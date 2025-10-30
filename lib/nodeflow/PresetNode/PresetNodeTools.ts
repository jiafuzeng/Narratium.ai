import { NodeTool } from "@/lib/nodeflow/NodeTool";
import { PresetOperations } from "@/lib/data/roleplay/preset-operation";
import { PresetAssembler } from "@/lib/core/preset-assembler";
import { LocalCharacterRecordOperations } from "@/lib/data/roleplay/character-record-operation";
import { Character } from "@/lib/core/character";
import { PromptKey } from "@/lib/prompts/preset-prompts";

/**
 * 预设工具类：提供供 `PresetNode` 调用的静态方法。
 *
 * 设计要点：
 * - 通过统一的 `executeMethod` 进行动态分发，节点侧仅关心方法名与参数；
 * - 异常统一交由基类的 `handleError` 处理，便于日志与诊断；
 * - 具体的提示词模板装配由 `PresetAssembler` 完成，此处主要做数据准备与入参整合。
 */
export class PresetNodeTools extends NodeTool {
  protected static readonly toolType: string = "preset";
  protected static readonly version: string = "1.0.0";

  /** 返回工具类型标识（用于日志与注册）。 */
  static getToolType(): string {
    return this.toolType;
  }

  /**
   * 动态执行静态方法。
   * @param methodName 目标方法名
   * @param params     透传参数
   */
  static async executeMethod(methodName: string, ...params: any[]): Promise<any> {
    const method = (this as any)[methodName];
    
    if (typeof method !== "function") {
      console.error(`Method lookup failed: ${methodName} not found in PresetNodeTools`);
      console.log("Available methods:", Object.getOwnPropertyNames(this).filter(name => 
        typeof (this as any)[name] === "function" && !name.startsWith("_"),
      ));
      throw new Error(`Method ${methodName} not found in ${this.getToolType()}Tool`);
    }

    try {
      this.logExecution(methodName, params);
      return await (method as Function).apply(this, params);
    } catch (error) {
      this.handleError(error as Error, methodName);
    }
  }

  /**
   * 构建对话所需的系统/用户提示词框架。
   *
   * 流程：
   * 1) 读取角色并构造 `Character`（含描述/性格/场景等基础信息）；
   * 2) 读取启用的预设，按有序列表取出提示片段；
   * 3) 用角色信息补全缺失片段内容（`enrichPromptsWithCharacterInfo`）；
   * 4) 交给 `PresetAssembler.assemblePrompts` 产出 `systemMessage/userMessage`；
   * 5) 返回提示词与所使用的 `presetId`。
   */
  static async buildPromptFramework(
    characterId: string,
    language: "zh" | "en" = "zh",
    username?: string,
    charName?: string,
    number?: number,
    fastModel: boolean = false,
    systemPresetType: PromptKey = "mirror_realm",
  ): Promise<{ systemMessage: string; userMessage: string; presetId?: string }> {
    try {
      const characterRecord = await LocalCharacterRecordOperations.getCharacterById(characterId);
      const character = new Character(characterRecord);
      
      const allPresets = await PresetOperations.getAllPresets();
      const enabledPreset = allPresets.find(preset => preset.enabled === true);
      
      let orderedPrompts: any[] = [];
      let presetId: string | undefined = undefined;
      
      if (enabledPreset && enabledPreset.id) {
        orderedPrompts = await PresetOperations.getOrderedPrompts(enabledPreset.id);
        presetId = enabledPreset.id;
      } else {
        console.log(`No enabled preset found, using ${systemPresetType} system framework for character ${characterId}`);
      }
      
      // 使用角色信息补全/覆盖部分提示片段内容
      const enrichedPrompts = this.enrichPromptsWithCharacterInfo(orderedPrompts, character);
      
      const { systemMessage, userMessage } = PresetAssembler.assemblePrompts(
        enrichedPrompts,
        language,
        fastModel,
        { username, charName: charName || character.characterData.name, number },
        systemPresetType,
      );

      return { 
        systemMessage: systemMessage, 
        userMessage: userMessage,
        presetId: presetId,
      };
    } catch (error) {
      this.handleError(error as Error, "buildPromptFramework");
    }
  }

  /**
   * 将角色的描述/性格/场景等信息注入到预设片段中，
   * 仅在片段缺失内容时进行补全，不覆盖已有自定义内容。
   */
  private static enrichPromptsWithCharacterInfo(
    prompts: any[],
    character: Character,
  ): any[] {
    return prompts.map(prompt => {
      const enrichedPrompt = { ...prompt };
      
      switch (prompt.identifier) {
      case "charDescription":
        if (!enrichedPrompt.content && character.characterData.description) {
          enrichedPrompt.content = character.characterData.description;
        }
        break;
          
      case "charPersonality":
        if (!enrichedPrompt.content && character.characterData.personality) {
          enrichedPrompt.content = character.characterData.personality;
        }
        break;
          
      case "scenario":
        if (!enrichedPrompt.content && character.characterData.scenario) {
          enrichedPrompt.content = character.characterData.scenario;
        }
        break;
      }
      
      return enrichedPrompt;
    });
  }
} 
