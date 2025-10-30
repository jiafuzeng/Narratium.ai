import { NodeBase } from "@/lib/nodeflow/NodeBase";
import { NodeConfig, NodeInput, NodeOutput, NodeCategory } from "@/lib/nodeflow/types";
import { PresetNodeTools } from "./PresetNodeTools";
import { NodeToolRegistry } from "../NodeTool";

/**
 * 预设节点（PresetNode）
 *
 * 作用：
 * - 基于角色与语言等运行参数，构建对话所需的 `systemMessage` 与 `userMessage` 模板；
 * - 仅做“组装/选择”工作，真正的模板逻辑在 `PresetNodeTools.buildPromptFramework` 中；
 * - 将结果写入工作流上下文，供后续节点（如世界书、上下文裁剪、LLM）使用。
 */
export class PresetNode extends NodeBase {
  static readonly nodeName = "preset";
  static readonly description = "Applies preset prompts to the conversation";
  static readonly version = "1.0.0";

  constructor(config: NodeConfig) {
    // 注册可用工具类，供本节点通过 executeTool 动态调用
    NodeToolRegistry.register(PresetNodeTools);
    super(config);
    this.toolClass = PresetNodeTools;
  }
  
  protected getDefaultCategory(): NodeCategory {
    return NodeCategory.MIDDLE;
  }

  /**
   * 节点主入口：根据输入参数构建预设提示词。
   *
   * 关键入参：
   * - characterId：角色 ID，用于选择角色相关的预设
   * - language/username/charName/number/fastModel/systemPresetType：影响模板内容或复杂度
   *
   * 返回：
   * - systemMessage/userMessage：用于后续节点的标准提示词文本
   * - presetId：可选的预设标识，便于追踪/审计
   */
  protected async _call(input: NodeInput): Promise<NodeOutput> {
    const characterId = input.characterId;
    const language = input.language || "zh";
    const username = input.username;
    const charName = input.charName;
    const number = input.number;
    const fastModel = input.fastModel;
    const systemPresetType = input.systemPresetType || "mirror_realm";
    //debugger;

    if (!characterId) {
      throw new Error("Character ID is required for PresetNode");
    }

    const result = await this.executeTool(
      "buildPromptFramework",
      characterId,
      language,
      username,
      charName,
      number,
      fastModel,
      systemPresetType,
    ) as { systemMessage: string; userMessage: string; presetId?: string };

    return {
      systemMessage: result.systemMessage,
      userMessage: result.userMessage,
      presetId: result.presetId,
    };
  }
} 
 
