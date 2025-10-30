// UserInputNode
// 职责：
// - 作为工作流的 ENTRY 节点，接收调用方传入的运行参数（characterId、userInput 等）
// - 不修改内容，不做外部调用，仅把输入规范化并透传给上下文
// - 生命周期钩子（beforeExecute/afterExecute）由基类处理日志/计时等通用逻辑
import { NodeBase } from "@/lib/nodeflow/NodeBase";
import { NodeConfig, NodeInput, NodeOutput, NodeCategory } from "@/lib/nodeflow/types";

export class UserInputNode extends NodeBase {
  static readonly nodeName = "userInput"; // 节点名（供工作流图引用）
  static readonly description = "Node for accepting user input during workflow execution"; // 描述
  static readonly version = "1.0.0"; // 版本号（便于演进管理）

  constructor(config: NodeConfig) {
    super(config); // 透传配置给基类（包含日志、上下文引用等）
  }

  protected getDefaultCategory(): NodeCategory {
    return NodeCategory.ENTRY; // 默认类别：入口节点
  }

  protected async beforeExecute(input: NodeInput): Promise<void> {
    // 预执行钩子：可添加参数校验/埋点（当前直接使用基类默认行为）
    await super.beforeExecute(input);
  }

  protected async afterExecute(output: NodeOutput): Promise<void> {
    // 后执行钩子：可添加输出校验/埋点（当前直接使用基类默认行为）
    await super.afterExecute(output);
  }

  protected async _call(input: NodeInput): Promise<NodeOutput> {
    // 主体执行：
    // - 对于入口节点，通常直接将输入参数透传为输出（由工作流的 outputFields 控制具体字段）
    // - 如需对原始输入做规范化/清洗，可在此实现
    return await super._call(input);
  }
}
