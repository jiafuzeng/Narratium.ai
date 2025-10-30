// WorldBookNode
// 职责：
// - 基于当前输入与最近上下文，从“世界书”中筛选匹配条目
// - 将命中条目拼装进 systemMessage/userMessage，保证设定一致性与风格稳定
// - 实际检索与拼装逻辑由 WorldBookNodeTools 提供，节点只负责编排与 I/O
import { NodeBase } from "@/lib/nodeflow/NodeBase";
import { NodeConfig, NodeInput, NodeOutput, NodeCategory } from "@/lib/nodeflow/types";
import { WorldBookNodeTools } from "./WorldBookNodeTools";
import { NodeToolRegistry } from "../NodeTool";

export class WorldBookNode extends NodeBase {
  static readonly nodeName = "worldBook"; // 节点名（供工作流注册/引用）
  static readonly description = "Assembles world book content into system and user messages"; // 功能描述
  static readonly version = "1.0.0"; // 版本号

  constructor(config: NodeConfig) {
    NodeToolRegistry.register(WorldBookNodeTools); // 注册可用工具（检索与拼装）
    super(config); // 初始化基类（上下文、日志等）
    this.toolClass = WorldBookNodeTools; // 绑定默认工具类，供 executeTool 调用
  }
  
  protected getDefaultCategory(): NodeCategory {
    return NodeCategory.MIDDLE; // 中间处理节点
  }

  protected async _call(input: NodeInput): Promise<NodeOutput> {
    const systemMessage = input.systemMessage; // 上游构建的系统提示
    const userMessage = input.userMessage; // 上游构建的用户提示
    const characterId = input.characterId; // 角色 ID（用于定位世界书）
    const language = input.language || "zh"; // 语言（影响条目选择或模板）
    const username = input.username; // 用户名（可用于个性化）
    const charName = input.charName; // 角色名（可用于模板替换）
    const currentUserInput = input.currentUserInput || ""; // 当前轮原始输入，提升匹配准确度
    const contextWindow = input.contextWindow || 5; // 结合最近 N 轮上下文进行匹配，默认 5

    if (!systemMessage) {
      throw new Error("System message is required for WorldBookNode"); // 缺少系统提示无法拼装
    }

    if (!characterId) {
      throw new Error("Character ID is required for WorldBookNode"); // 无法定位世界书
    }
    const result = await this.executeTool(
      "assemblePromptWithWorldBook",
      characterId,
      systemMessage,
      userMessage,
      currentUserInput,
      language,
      contextWindow,
      username,
      charName,
    ) as { systemMessage: string; userMessage: string };
    debugger;
    return {
      systemMessage: result.systemMessage, // 注入世界书后的系统提示
      userMessage: result.userMessage, // 注入世界书后的用户提示
      characterId,
      language,
      username,
      charName,
      contextWindow,
      currentUserInput,
    };
  }
} 
