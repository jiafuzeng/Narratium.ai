import { BaseWorkflow, WorkflowConfig } from "@/lib/workflow/BaseWorkflow";
import { NodeCategory } from "@/lib/nodeflow/types";
import { UserInputNode } from "@/lib/nodeflow/UserInputNode/UserInputNode";
import { PresetNode } from "@/lib/nodeflow/PresetNode/PresetNode";
import { ContextNode } from "@/lib/nodeflow/ContextNode/ContextNode";
import { MemoryRetrievalNode } from "@/lib/nodeflow/MemoryNode/MemoryRetrievalNode";
import { WorldBookNode } from "@/lib/nodeflow/WorldBookNode/WorldBookNode";
import { LLMNode } from "@/lib/nodeflow/LLMNode/LLMNode";
import { RegexNode } from "@/lib/nodeflow/RegexNode/RegexNode";
import { OutputNode } from "@/lib/nodeflow/OutputNode/OutputNode";
import { MemoryStorageNode } from "@/lib/nodeflow/MemoryNode/MemoryStorageNode";

/**
 * CorrectRAGWorkflow - Enhanced execution architecture with AFTER nodes
 * 
 * Execution Flow:
 * 1. ENTRY -> MIDDLE nodes execute sequentially (userInput -> preset -> context -> memoryRetrieval -> worldBook -> llm -> regex)
 * 2. EXIT node (output) executes and workflow returns immediately to user
 * 3. AFTER nodes (memoryStorage) execute in background asynchronously
 * 
 * Benefits:
 * - User receives immediate response after output node
 * - Memory storage happens asynchronously without blocking user experience
 * - Maintains data consistency while improving response time
 * 
 * Usage:
 * ```typescript
 * const result = await workflowEngine.execute(params, context, {
 *   executeAfterNodes: true,  // Execute memory storage in background (default: true)
 *   awaitAfterNodes: false    // Don't wait for memory storage (default: false)
 * });
 * // User receives result immediately while memory storage continues in background
 * ```
 */

export interface CorrectRAGWorkflowParams {
  characterId: string;
  userInput: string;
  number?: number;
  language?: "zh" | "en";
  username?: string;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  llmType?: "openai" | "ollama";
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  topK?: number;
  repeatPenalty?: number;
  streaming?: boolean;
  streamUsage?: boolean;
  fastModel?: boolean;
  // Memory-specific parameters
  maxMemories?: number;
  enableMemoryStorage?: boolean;
}

export class CorrectRAGWorkflow extends BaseWorkflow {
  protected getNodeRegistry() {
    return {
      "userInput": {
        nodeClass: UserInputNode,
      },
      "preset": {
        nodeClass: PresetNode,
      },
      "context": {
        nodeClass: ContextNode,
      },
      "memoryRetrieval": {
        nodeClass: MemoryRetrievalNode,
      },
      "worldBook": {
        nodeClass: WorldBookNode,
      },
      "llm": {
        nodeClass: LLMNode,
      },
      "regex": {
        nodeClass: RegexNode,
      },
      "output": {
        nodeClass: OutputNode,
      },
      "memoryStorage": {
        nodeClass: MemoryStorageNode,
      },
    };
  }

  protected getWorkflowConfig(): WorkflowConfig {
    return {
      id: "correct-rag-workflow",
      name: "Correct RAG Workflow - Early return with background AFTER nodes",
      // 执行顺序（带记忆的对话）：
      // userInput → preset → context → memoryRetrieval → worldBook → llm → regex → output │ AFTER: memoryStorage
      // 设计思路：
      // - 仅在 llm 节点调用大模型；其余节点用于提示词构建、上下文/记忆注入与后处理
      // - output 为 EXIT 节点，先向前端返回；memoryStorage 作为 AFTER 节点在后台落库，避免阻塞首屏
      nodes: [
        {
          id: "user-input-1",
          name: "userInput",
          category: NodeCategory.ENTRY,
          next: ["preset-1"],
          // 初始化运行参数：来自前端/调用方的本次会话配置
          initParams: [
            "characterId", 
            "userInput", 
            "number", 
            "language", 
            "username", 
            "modelName", 
            "apiKey", 
            "baseUrl", 
            "llmType", 
            "temperature", 
            "fastModel",
            "maxMemories",
            "enableMemoryStorage",
          ],
          inputFields: [],
          // 输出：把所有运行参数写入上下文，供后续节点统一读取
          outputFields: [
            "characterId", 
            "userInput", 
            "number", 
            "language", 
            "username", 
            "modelName", 
            "apiKey", 
            "baseUrl", 
            "llmType", 
            "temperature", 
            "fastModel",
            "maxMemories",
            "enableMemoryStorage",
          ],
        },
        {
          id: "preset-1",
          name: "preset",
          category: NodeCategory.MIDDLE,
          next: ["context-1"],
          initParams: [],
          // 载入角色预设/系统提示，形成初版 systemMessage 与 userMessage
          inputFields: ["characterId", "language", "username", "number", "fastModel"],
          outputFields: ["systemMessage", "userMessage", "presetId"],
        },
        {
          id: "context-1",
          name: "context",
          category: NodeCategory.MIDDLE,
          next: ["memory-retrieval-1"],
          initParams: [],
          // 拼接近期对话，产出 conversationContext；并对 userMessage 进行上下文增强
          inputFields: ["userMessage", "characterId", "userInput"],
          outputFields: ["userMessage", "conversationContext"],
        },
        {
          id: "memory-retrieval-1",
          name: "memoryRetrieval",
          category: NodeCategory.MIDDLE,
          next: ["world-book-1"],
          initParams: [],
          // 召回长期记忆：将记忆作为 memoryPrompt/追加信息并入 systemMessage
          inputFields: ["characterId", "userInput", "systemMessage", "apiKey", "baseUrl", "language", "maxMemories", "username"],
          outputFields: ["systemMessage", "memoryPrompt"],
        },
        {
          id: "world-book-1",
          name: "worldBook",
          category: NodeCategory.MIDDLE,
          next: ["llm-1"],
          initParams: [],
          // 世界书筛选：根据当前输入与上下文命中条目，继续完善 systemMessage/userMessage
          inputFields: ["systemMessage", "userMessage", "characterId", "language", "username", "userInput"],
          outputFields: ["systemMessage", "userMessage"],
          inputMapping: {
            // 将 userInput 映射为 currentUserInput，提高条目匹配准确度
            "userInput": "currentUserInput",
          },
        },
        {
          id: "llm-1",
          name: "llm",
          category: NodeCategory.MIDDLE,
          next: ["regex-1"],
          initParams: [],
          // 唯一必经的模型调用：以最终提示调用 LLM，得到 llmResponse（可流式）
          inputFields: ["systemMessage", "userMessage", "modelName", "apiKey", "baseUrl", "llmType", "temperature", "language"],
          outputFields: ["llmResponse"],
        },
        {
          id: "regex-1",
          name: "regex",
          category: NodeCategory.MIDDLE,
          next: ["output-1"],
          initParams: [],
          // 后处理：抽取渲染需要的字段，控制 UI 与下一步交互
          inputFields: ["llmResponse", "characterId"],
          outputFields: ["replacedText", "screenContent", "fullResponse", "nextPrompts", "event"], // 只输出处理后的内容
        },
        {
          id: "output-1",
          name: "output",
          category: NodeCategory.EXIT, // EXIT：在此节点立即返回用户响应
          next: [], // 无后继主线节点——到此为止用户已拿到结果
          initParams: [],
          inputFields: [
            "replacedText", 
            "screenContent", 
            "fullResponse", 
            "nextPrompts", 
            "event", 
            "presetId",
          ],
          outputFields: [
            "replacedText", 
            "screenContent", 
            "fullResponse", 
            "nextPrompts", 
            "event", 
            "presetId",
          ], // 这些字段将直接返回给前端
        },
        {
          id: "memory-storage-1",
          name: "memoryStorage",
          category: NodeCategory.AFTER, // AFTER：在 EXIT 之后后台执行，不阻塞首屏
          next: [], // 后台分支的终点
          initParams: [],
          inputFields: [
            // AFTER 节点可访问主流程上下文的所有数据
            "characterId",
            "userInput",
            "fullResponse",
            "conversationContext",
            "apiKey",
            "baseUrl",
            "language",
            "enableMemoryStorage",
            "replacedText",
            "screenContent", 
            "nextPrompts",
            "event",
            "presetId",
          ],
          outputFields: [
            // AFTER 节点无需输出；用户已获得响应
          ],
        },
      ],
    };
  }
} 
