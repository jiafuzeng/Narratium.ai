// NodeBase
// 职责：
// - 所有节点的抽象基类，定义统一的生命周期、输入解析与输出发布规则
// - 管理节点的元信息（id/name/category/next）与配置（init/input/output/mapping）
// - 提供工具类执行能力（executeTool）与状态存取（getState/setState）
// - 确保“显式输入/显式输出”，避免节点间隐式耦合
import { NodeConfig, NodeInput, NodeOutput, NodeExecutionStatus, NodeExecutionResult, NodeCategory } from "@/lib/nodeflow/types";
import { NodeContext } from "@/lib/nodeflow/NodeContext";
import { NodeTool, NodeToolRegistry } from "@/lib/nodeflow/NodeTool";

export abstract class NodeBase { // 抽象基类，不直接实例化
  protected id: string; // 节点唯一 ID（来自 WorkflowConfig）
  protected name: string; // 节点名称（注册表键）
  protected category: NodeCategory; // 节点类别（ENTRY/MIDDLE/EXIT/AFTER）
  protected next: string[]; // 后继节点 ID 列表
  protected toolClass?: typeof NodeTool; // 绑定的工具类（可执行方法集）
  protected params: Record<string, any>; // 节点配置参数集（I/O 与映射）
  protected state: Record<string, any> = {}; // 节点内部状态（仅本节点使用）

  constructor(config: NodeConfig) { // 由 WorkflowEngine 根据配置构造
    this.id = config.id;
    this.name = config.name;
    this.category = this.getDefaultCategory(); // 子类给出默认类别
    this.next = config.next || [];
    
    // 统一收拢本节点的输入输出声明与映射
    this.params = {
      initParams: config.initParams || [], // 从外部 Input 直接注入的字段
      inputFields: config.inputFields || [], // 从上下文 Cache 读取的字段
      outputFields: config.outputFields || [], // 本节点产出的字段
      inputMapping: config.inputMapping || {}, // workflow 字段名 → 节点内部字段名
    };
    this.initializeTools(); // 尝试绑定对应工具类（可选）
  }

  protected getInitParams(): string[] { // 获取 initParams 声明
    return this.getConfigValue("initParams") || [];
  }
  
  protected getInputFields(): string[] { // 获取 inputFields 声明
    return this.getConfigValue("inputFields") || [];
  }

  protected getOutputFields(): string[] { // 获取 outputFields 声明
    return this.getConfigValue("outputFields") || [];
  }
  
  protected getConfigValue<T>(key: string, defaultValue?: T): T | undefined { // 读取配置值
    if (this.params && this.params[key] !== undefined) {
      return this.params[key] as T;
    }
    return defaultValue;
  }

  protected getState<T>(key: string, defaultValue?: T): T | undefined { // 获取节点内部状态
    return (this.state[key] as T) ?? defaultValue;
  }

  protected setState<T>(key: string, value: T): void { // 写入节点内部状态
    this.state[key] = value;
  }

  protected abstract getDefaultCategory(): NodeCategory; // 子类必须声明默认类别

  getCategory(): NodeCategory { // 读取类别
    return this.category;
  }

  isEntryNode(): boolean { // 是否入口节点
    return this.category === NodeCategory.ENTRY;
  }

  isExitNode(): boolean { // 是否出口节点
    return this.category === NodeCategory.EXIT;
  }

  isMiddleNode(): boolean { // 是否中间节点
    return this.category === NodeCategory.MIDDLE;
  }
  
  protected initializeTools(): void { // 绑定工具类（若已通过 NodeToolRegistry 注册）
    try {
      const registeredToolClass = NodeToolRegistry.get(this.getName());
      if (registeredToolClass) {
        this.toolClass = registeredToolClass;
      } else {
        console.warn(`找不到节点类型的工具类: ${this.getName()}`);
      }
    } catch (error: any) {
      console.warn(`查找工具类失败: ${error?.message || "未知错误"}`);
    }
  }

  protected async executeTool(methodName: string, ...params: any[]): Promise<any> { // 调用绑定工具的方法
    if (!this.toolClass) {
      throw new Error(`No tool class available for node type: ${this.getName()}`);
    }
    return await this.toolClass.executeMethod(methodName, ...params);
  }

  getId(): string { // 读取节点 ID
    return this.id;
  }

  getName(): string { // 读取节点名称
    return this.name;
  }

  getNext(): string[] { // 读取后继节点列表（返回拷贝防止外部修改）
    return [...this.next];
  }

  protected async resolveInput(context: NodeContext): Promise<NodeInput> { // 解析节点输入
    const resolvedInput: NodeInput = {};
    const initParams = this.getInitParams(); // 从外部 Input 注入的字段
    const inputFields = this.getInputFields(); // 从上下文 Cache 读取的字段
    const inputMapping = this.getConfigValue<Record<string, string>>("inputMapping") || {}; // 字段映射

    // 1) 注入 initParams（来自工作流 execute 的外部输入）
    for (const fieldName of initParams) {
      if (context.hasInput(fieldName)) {
        resolvedInput[fieldName] = context.getInput(fieldName);
      } else {
        console.warn(`Node ${this.id}: Required input '${fieldName}' not found in Input`);
      }
    }

    // 2) 读取 inputFields（来自前置节点写入的缓存）并应用字段映射
    for (const workflowFieldName of inputFields) {
      const nodeFieldName = inputMapping[workflowFieldName] || workflowFieldName;
      
      if (context.hasCache(workflowFieldName)) {
        resolvedInput[nodeFieldName] = context.getCache(workflowFieldName);
      } else {
        console.warn(`Node ${this.id}: Required input '${workflowFieldName}' (mapped to node field '${nodeFieldName}') not found in cache`);
      }
    }

    return resolvedInput;
  }

  protected async publishOutput(output: NodeOutput, context: NodeContext): Promise<void> { // 发布节点输出
    const outputFields = this.getOutputFields();
    
    const storeData = (key: string, value: any) => {
      switch (this.category) {
      case NodeCategory.EXIT: // 终点节点把结果放到最终 Output
        context.setOutput(key, value);
        break;
      default: // 其余节点写入缓存，供后继节点读取
        context.setCache(key, value);
        break;
      }
    };
    
    for (const fieldName of outputFields) {
      if (output[fieldName] !== undefined) {
        storeData(fieldName, output[fieldName]);
      }
    }
  }

  async execute(context: NodeContext): Promise<NodeExecutionResult> { // 节点执行主流程
    const startTime = new Date();
    const result: NodeExecutionResult = {
      nodeId: this.id,
      status: NodeExecutionStatus.RUNNING,
      input: {},
      startTime,
    };
    try {
      const resolvedNodeInput = await this.resolveInput(context); // 解析输入
      await this.beforeExecute(resolvedNodeInput); // 前置钩子
      result.input = resolvedNodeInput;
      
      const output = await this._call(resolvedNodeInput); // 主体执行
      await this.publishOutput(output, context); // 发布输出
      await this.afterExecute(output); // 后置钩子

      result.status = NodeExecutionStatus.COMPLETED;
      result.output = output;
    } catch (error) {
      result.status = NodeExecutionStatus.FAILED;
      result.error = error as Error;
    } finally {
      result.endTime = new Date();
    }

    return result;
  }

  protected async beforeExecute(input: NodeInput): Promise<void> { // 默认的前置钩子（可被子类覆写）
    console.log(`Node ${this.id}: Processing workflow beforeExecute`);
  }

  protected async afterExecute(output: NodeOutput): Promise<void> { // 默认的后置钩子（可被子类覆写）
    console.log(`Node ${this.id}: Processing workflow afterExecute`);
  }

  protected async _call(input: NodeInput): Promise<NodeOutput>{ // 默认实现：按 outputFields 透传输入
    const outputFields = this.getOutputFields();
    const output: NodeOutput = {};
    
    if (outputFields.length === 0) { // 未声明输出则直接回传全部输入（常用于 ENTRY）
      return { ...input };
    }
    
    for (const field of outputFields) {
      if (input[field] !== undefined) {
        output[field] = input[field];
      }
    }
    
    return output;
  }

  getStatus(): Record<string, any> { // 提供轻量状态查询（便于可视化/调试）
    return {
      id: this.id,
      name: this.name,
    };
  }

  toJSON(): NodeConfig { // 转换为可序列化配置（便于导出/调试）
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      next: this.next,
    };
  }
} 
