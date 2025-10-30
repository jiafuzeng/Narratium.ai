// ContextNode
// 职责：
// - 将近期对话拼接到 `userMessage`，形成包含 {{chatHistory}} 的上下文消息
// - 生成供记忆系统使用的 `conversationContext`（更短的摘要形式）
// - 不直接调用 LLM，由工具类 ContextNodeTools 完成具体逻辑，节点仅负责编排与 I/O
import { NodeBase } from "@/lib/nodeflow/NodeBase";
import { NodeConfig, NodeInput, NodeOutput, NodeCategory } from "@/lib/nodeflow/types";
import { DialogueMessage } from "@/lib/models/character-dialogue-model";
import { ContextNodeTools } from "./ContextNodeTools";
import { NodeToolRegistry } from "../NodeTool";

export class ContextNode extends NodeBase {
  static readonly nodeName = "context"; // 节点名（用于工作流注册/引用）
  static readonly description = "Assembles chat history and system messages"; // 功能描述
  static readonly version = "1.0.0"; // 版本号

  constructor(config: NodeConfig) {
    NodeToolRegistry.register(ContextNodeTools); // 注册本节点可用的工具集合
    super(config); // 初始化基类（注入上下文、日志能力等）
    this.toolClass = ContextNodeTools; // 绑定默认工具类，供 executeTool 调用
  }

  protected getDefaultCategory(): NodeCategory {
    return NodeCategory.MIDDLE; // 属于中间处理节点
  }

  protected async _call(input: NodeInput): Promise<NodeOutput> {
    const userMessage = input.userMessage; // 上游（Preset）产出的用户消息（可含占位符）
    const characterId = input.characterId; // 角色 ID（用于检索对话记录）
    const userInput = input.userInput; // 当前用户输入（用于生成简短上下文）
    const memoryLength = input.memoryLength || 10; // 拼接的对话条数上限，默认 10

    if (!userMessage) {
      throw new Error("User message is required for ContextNode"); // 缺少基础消息无法拼接上下文
    }

    if (!characterId) {
      throw new Error("Character ID is required for ContextNode"); // 缺少角色无法定位会话
    }

    // 1) 组装近期对话：替换/填充 {{chatHistory}} 占位符，返回新的 userMessage 与消息数组
    const result = await this.executeTool(
      "assembleChatHistory",
      userMessage,
      characterId,
      memoryLength,
    ) as { userMessage: string; messages: DialogueMessage[] };

    // 2) 生成记忆系统所需的简短对话上下文摘要（更短，便于存储/检索）
    const conversationContext = await this.executeTool(
      "generateConversationContext",
      characterId,
      userInput || "",
      3, // Use shorter context for memory
    ) as string;

    return {
      userMessage: result.userMessage, // 带入近期对话后的用户消息
      conversationContext, // 面向记忆模块的简短上下文
    };
  }
} 
