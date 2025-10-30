// 对话工作流（基础版）：
// - 将一次聊天拆为若干职责单一的节点，按有向链执行
// - 仅在 LLM 节点调用大模型；其余节点做提示词构建、上下文裁剪与输出后处理
// - 输出结构化字段供前端直接渲染与交互
// 执行生命周期（由 WorkflowEngine 调度）：
// 1) execute(params) → 初始化上下文 Context（含 initParams 注入的运行参数）
// 2) 按 nodes 顺序运行：每个节点仅可读取 inputFields，并把 outputFields 写回 Context
// 3) 命中 EXIT 节点后立即返回前端；若存在 AFTER 节点，则在后台继续执行（不阻塞首屏）
// 4) 异常由基类捕获并向上抛出，前端可据此提示或重试
import { BaseWorkflow, WorkflowConfig } from "@/lib/workflow/BaseWorkflow";
import { NodeCategory } from "@/lib/nodeflow/types";
// 节点实现（输入/输出在下方 getWorkflowConfig 中定义）
import { UserInputNode } from "@/lib/nodeflow/UserInputNode/UserInputNode";
import { ContextNode } from "@/lib/nodeflow/ContextNode/ContextNode";
import { WorldBookNode } from "@/lib/nodeflow/WorldBookNode/WorldBookNode";
import { PresetNode } from "@/lib/nodeflow/PresetNode/PresetNode";
import { LLMNode } from "@/lib/nodeflow/LLMNode/LLMNode";
import { RegexNode } from "@/lib/nodeflow/RegexNode/RegexNode";
import { PluginNode } from "@/lib/nodeflow/PluginNode/PluginNode";
import { PluginMessageNode } from "@/lib/nodeflow/PluginNode/PluginMessageNode";
import { OutputNode } from "@/lib/nodeflow/OutputNode/OutputNode";
import { PromptKey } from "@/lib/prompts/preset-prompts";

export interface DialogueWorkflowParams {
  // 运行参数：由前端/调用方注入
  characterId: string;
  userInput: string;
  number?: number;
  language?: "zh" | "en";
  username?: string;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  llmType?: "openai" | "ollama";
  // LLM 采样与资源相关参数
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  topK?: number;
  repeatPenalty?: number;
  // 流式与统计
  streaming?: boolean;
  streamUsage?: boolean;
  // 性能/预设选择
  fastModel?: boolean;
  systemPresetType?: PromptKey;
}

export class DialogueWorkflow extends BaseWorkflow {
  // 注册节点：把可用节点名称映射到其实现类
  protected getNodeRegistry() {
    return {
      "userInput": {
        nodeClass: UserInputNode,
      },
      "pluginMessage": {
        nodeClass: PluginMessageNode,
      },
      "context": {
        nodeClass: ContextNode,
      },
      "worldBook": {
        nodeClass: WorldBookNode,
      },
      "preset": {
        nodeClass: PresetNode,
      },
      "llm": {
        nodeClass: LLMNode,
      },
      "regex": {
        nodeClass: RegexNode,
      },
      "plugin": {
        nodeClass: PluginNode,
      },
      "output": {
        nodeClass: OutputNode,
      },
    };
  }

  protected getWorkflowConfig(): WorkflowConfig {
    return {
      id: "complete-dialogue-workflow",
      name: "Complete Dialogue Processing Workflow",
      // 节点按顺序执行：userInput → pluginMessage → preset → context → worldBook → llm → regex → plugin → output
      // 设计要点：
      // - 仅在 LLM 节点调用大模型，其余节点负责提示词与上下文准备/后处理
      // - output 为 EXIT 节点，工作流在此向前端返回结果
      // 字段流转规则：每个节点只读取其 inputFields，并向 Context 写入其 outputFields；
      // 通过“显式输入/显式输出”实现节点解耦，避免隐式依赖导致的维护困难。
      nodes: [
        {
          id: "user-input-1",
          name: "userInput",
          category: NodeCategory.ENTRY,
          next: ["plugin-message-1"],
          // 初始化参数：从前端/调用方注入本次对话所需的运行时配置
          initParams: ["characterId", "userInput", "number", "language", "username", "modelName", "apiKey", "baseUrl", "llmType", "temperature", "fastModel", "systemPresetType", "streaming", "streamUsage"],
          inputFields: [],
          // 输出：把运行参数写入工作流上下文，供后续节点使用
          outputFields: ["characterId", "userInput", "number", "language", "username", "modelName", "apiKey", "baseUrl", "llmType", "temperature", "fastModel", "systemPresetType", "streaming", "streamUsage"],
        },
        {
          id: "plugin-message-1",
          name: "pluginMessage",
          category: NodeCategory.MIDDLE,
          next: ["preset-1"],
          initParams: [],
          // 输入：角色与用户输入
          // 作用：将插件消息（如系统信号/工具反馈）合入上下文，便于后续提示词组装
          inputFields: ["characterId", "userInput"],
          outputFields: ["characterId", "userInput", "number", "language", "username", "modelName", "apiKey", "baseUrl", "llmType", "temperature", "fastModel", "systemPresetType", "streaming", "streamUsage"],
        },
        {
          id: "preset-1",
          name: "preset",
          category: NodeCategory.MIDDLE,
          next: ["context-1"],
          initParams: [],
          // 载入角色预设与系统提示，产出初始的 systemMessage/userMessage
          inputFields: ["characterId", "language", "username", "number", "fastModel", "systemPresetType"],
          outputFields: ["systemMessage", "userMessage", "presetId"],
        },
        {
          id: "context-1",
          name: "context",
          category: NodeCategory.MIDDLE,
          next: ["world-book-1"],
          initParams: [],
          // 基于近期对话裁剪上下文，只改写/返回 userMessage（带上下文）
          inputFields: ["userMessage", "characterId", "userInput"],
          outputFields: ["userMessage"],
        },
        {
          id: "world-book-1",
          name: "worldBook",
          category: NodeCategory.MIDDLE,
          next: ["llm-1"],
          initParams: [],
          // 世界书命中：根据当前/最近消息筛选世界观条目，进一步完善 systemMessage 与 userMessage
          inputFields: ["systemMessage", "userMessage", "characterId", "language", "username", "userInput"],
          outputFields: ["systemMessage", "userMessage"],
          inputMapping: {
            // 将上下文里的 userInput 映射为当前轮输入，以便世界书更准确匹配
            "userInput": "currentUserInput",
          },
        },
        {
          id: "llm-1",
          name: "llm",
          category: NodeCategory.MIDDLE,
          next: ["regex-1"],
          initParams: [],
          // 唯一必经的模型调用：把 system/user 提示与参数交给模型产出 llmResponse。
          // 当 streaming=true 时仍会聚合为完整响应，以便 regex 节点统一做结构化处理。
          inputFields: ["systemMessage", "userMessage", "modelName", "apiKey", "baseUrl", "llmType", "temperature", "language", "streaming", "streamUsage"],
          outputFields: ["llmResponse"],
        },
        {
          id: "regex-1",
          name: "regex",
          category: NodeCategory.MIDDLE,
          next: ["plugin-1"],
          initParams: [],
          // 对模型输出做结构化后处理：用于渲染与交互
          // 输出字段含义：
          // - thinkingContent：可折叠“思考/旁白”；
          // - screenContent：渲染 HTML，包含 <talk> 片段（供高亮与 TTS 抽取）；
          // - fullResponse：保留原文，便于复核与持久化；
          // - nextPrompts：下一步输入建议；
          // - event：可选的机器可读信号，用于驱动 UI 或分支逻辑。
          inputFields: ["llmResponse", "characterId"],
          outputFields: ["thinkingContent", "screenContent", "fullResponse", "nextPrompts", "event"],
        },
        {
          id: "plugin-1",
          name: "plugin",
          category: NodeCategory.MIDDLE,
          next: ["output-1"],
          initParams: [],
          // 插件执行阶段（可选）：可在此触发工具/副作用（如检索、埋点、外部 API），
          // 也可根据 event 执行分支逻辑；默认将处理结果透传给输出节点。
          inputFields: ["thinkingContent", "screenContent", "fullResponse", "nextPrompts", "event", "characterId"],
          outputFields: ["thinkingContent", "screenContent", "fullResponse", "nextPrompts", "event"],
        },
        {
          id: "output-1",
          name: "output",
          category: NodeCategory.EXIT,
          next: [],
          initParams: [],
          // 终点：将结构化结果返回前端进行渲染；前端据此高亮 <talk> 并可触发 TTS 播放。
          inputFields: ["thinkingContent", "screenContent", "fullResponse", "nextPrompts", "event"],
          outputFields: ["thinkingContent", "screenContent", "fullResponse", "nextPrompts", "event"],
        },
      ],
    };
  }
} 
