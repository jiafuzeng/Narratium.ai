import { NodeTool } from "@/lib/nodeflow/NodeTool";
import { Character } from "@/lib/core/character";
import { PromptAssembler } from "@/lib/core/prompt-assembler";
import { DialogueMessage } from "@/lib/models/character-dialogue-model";
import { LocalCharacterRecordOperations } from "@/lib/data/roleplay/character-record-operation";
import { LocalCharacterDialogueOperations } from "@/lib/data/roleplay/character-dialogue-operation";

/**
 * 工具集合：为 `WorldBook` 节点提供可被工作流调用的静态方法。
 *
 * 设计约定：
 * - 所有对外暴露的方法均为 `static`，以便通过统一的 `executeMethod` 动态分发调用；
 * - 所有方法内部发生的异常使用基类提供的 `handleError` 记录并抛出，避免吞错；
 * - 与世界书、对话上下文装配相关的逻辑收敛在这里，节点实现只负责调度。
 */
export class WorldBookNodeTools extends NodeTool {
  protected static readonly toolType: string = "worldBook";
  protected static readonly version: string = "1.0.0";

  /**
   * 返回当前工具类型，供日志与动态路由使用。
   */
  static getToolType(): string {
    return this.toolType;
  }

  /**
   * 动态执行同名静态方法。
   *
   * 用法场景：节点运行时只传入方法名与参数，由该入口完成方法查找与调用，
   * 可减少节点与具体工具实现的耦合。
   *
   * @param methodName 需要调用的静态方法名
   * @param params     透传给目标方法的变参
   * @returns          目标方法的返回值（可能为 Promise）
   */
  static async executeMethod(methodName: string, ...params: any[]): Promise<any> {
    const method = (this as any)[methodName];
    
    if (typeof method !== "function") {
      console.error(`Method lookup failed: ${methodName} not found in WorldBookNodeTools`);
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
   * 基于世界书与对话上下文装配提示词。
   *
   * 处理流程：
   * 1. 读取角色记录，构造成 `Character` 对象（包含世界书等资料）；
   * 2. 裁剪/获取最近对话历史（受 `contextWindow` 限制）；
   * 3. 使用 `PromptAssembler` 将世界书、系统消息、用户消息与聊天上下文合并；
   * 4. 返回新的 `systemMessage` 与 `userMessage`。
   *
   * @param characterId       角色 ID
   * @param baseSystemMessage 作为模板的系统提示词
   * @param userMessage       进入节点前的用户消息（可能已被前序节点改写）
   * @param currentUserInput  本轮用户原始输入（用于更精准地匹配世界书）
   * @param language          语言标记（默认 zh）
   * @param contextWindow     上下文窗口大小（以“消息对”计）
   * @param username          用户名（可选）
   * @param charName          角色显示名（可选）
   */
  static async assemblePromptWithWorldBook(
    characterId: string,
    baseSystemMessage: string,
    userMessage: string,
    currentUserInput: string,
    language: "zh" | "en" = "zh",
    contextWindow: number = 5,
    username?: string,
    charName?: string,
  ): Promise<{ systemMessage: string; userMessage: string }> {
    try {
      const characterRecord = await LocalCharacterRecordOperations.getCharacterById(characterId);
      const character = new Character(characterRecord);

      // 获取最近若干轮对话记录，用于提示词装配
      const chatHistory = await this.getChatHistory(characterId, contextWindow);
      
      const promptAssembler = new PromptAssembler({
        language,
        contextWindow,
      });

      const result = promptAssembler.assemblePrompt(
        character.worldBook,
        baseSystemMessage,
        userMessage,
        chatHistory,
        currentUserInput,
        username,
        charName,
      );
      return result;
    } catch (error) {
      this.handleError(error as Error, "assemblePromptWithWorldBook");
    }
  }

  /**
   * 获取并裁剪指定角色的最近对话历史。
   *
   * 规则说明：
   * - 若当前节点为根（root），跳过首个 assistant 响应以避免重复；
   * - 生成 `DialogueMessage[]`，包含 role/content/id；
   * - 最终取最近 `contextWindow * 2` 条消息（按“用户+助手”为一对）。
   */
  private static async getChatHistory(characterId: string, contextWindow: number = 5): Promise<DialogueMessage[]> {
    try {
      const dialogueTree = await LocalCharacterDialogueOperations.getDialogueTreeById(characterId);
      if (!dialogueTree) {
        return [];
      }

      const nodePath = dialogueTree.current_nodeId !== "root"
        ? await LocalCharacterDialogueOperations.getDialoguePathToNode(characterId, dialogueTree.current_nodeId)
        : [];
      
      const messages: DialogueMessage[] = [];
      let messageId = 0;
      
      for (const node of nodePath) {
        if (node.parentNodeId === "root" && node.assistantResponse) {
          continue;
        }
        
        if (node.userInput) {
          messages.push({
            role: "user",
            content: node.userInput,
            id: messageId++,
          });
        }
        
        if (node.assistantResponse) {
          messages.push({
            role: "assistant", 
            content: node.assistantResponse,
            id: messageId++,
          });
        }
      }

      const recentMessages = messages.slice(-contextWindow * 2);
      return recentMessages;
    } catch (error) {
      this.handleError(error as Error, "getChatHistory");
      return [];
    }
  }
} 
