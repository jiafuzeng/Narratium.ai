/**
 * TTS Service Module
 *
 * This module provides text-to-speech functionality using RunningHub TTS API.
 * It handles:
 * - Extracting speech content from HTML (talk tags)
 * - Creating TTS tasks via RunningHub API
 * - Polling task results
 * - Caching generated audio URLs
 * - Uploading reference audio files
 */

import { processForHighlight } from "@/lib/utils/highlight-processor";

export interface TTSConfig {
  apiKey: string;
  workflowId: string;
  referenceAudioUrl?: string; // Optional reference audio
}

export interface TTSTaskResult {
  taskId: string;
  audioUrl?: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

export class TTSService {
  private config: TTSConfig;
  private audioCache: Map<string, string> = new Map(); // messageId -> audioUrl
  private readonly API_BASE_URL = "https://www.runninghub.cn";
  private readonly DEFAULT_WORKFLOW_ID = "1983741272638857217";

  constructor(config: TTSConfig) {
    this.config = {
      ...config,
      workflowId: config.workflowId || this.DEFAULT_WORKFLOW_ID,
    };
  }

  /**
   * Extract speech content from HTML (talk tags)
   * First converts quoted text to <talk> tags, then extracts content
   */
  extractSpeechContent(htmlContent: string): string[] {
    // Normalize/prepare: convert markdown & quoted parts to <talk>, add highlight attributes
    const processed = (() => {
      try {
        return processForHighlight(htmlContent || "");
      } catch (_) {
        return htmlContent || "";
      }
    })();

    // Highest priority: explicitly marked talk segments
    const talkMatches: string[] = [];
    try {
      // data-tag="talk" or <talk>...</talk>
      const dataTagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*data-tag=["']talk["'][^>]*>([\s\S]*?)<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = dataTagRegex.exec(processed)) !== null) {
        const text = (m[2] || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ")
          .replace(/[“”"']/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) talkMatches.push(text);
      }

      const talkTagRegex = /<talk\b[^>]*>([\s\S]*?)<\/talk>/gi;
      while ((m = talkTagRegex.exec(processed)) !== null) {
        const text = (m[1] || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/[“”"']/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) talkMatches.push(text);
      }
    } catch (_) {}

    if (talkMatches.length > 0) {
      return talkMatches;
    }

    // Prefer highlighted segments (elements with explicit color style)
    const highlightedMatches: string[] = [];
    try {
      const highlightRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*style=["'][^"']*color\s*:\s*[^"';]+[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = highlightRegex.exec(processed)) !== null) {
        const text = (m[2] || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) highlightedMatches.push(text);
      }
    } catch (_) {
      // ignore regex errors
    }

    if (highlightedMatches.length > 0) {
      return highlightedMatches;
    }

    // Secondary: elements marked with class "tag-styled" (post-processed highlight class)
    try {
      const classRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*class=["'][^"']*tag-styled[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = classRegex.exec(processed)) !== null) {
        const text = (m[2] || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) highlightedMatches.push(text);
      }
    } catch (_) {}

    if (highlightedMatches.length > 0) {
      return highlightedMatches;
    }

    // Tertiary: semantic emphasis tags often used as highlights
    try {
      const emphasisRegex = /<(strong|em|mark)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = emphasisRegex.exec(processed)) !== null) {
        const text = (m[2] || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) highlightedMatches.push(text);
      }
    } catch (_) {}

    // 只返回高亮文本；若没有则返回空数组
    return highlightedMatches;
  }

  /**
   * Extract speech from DOM (more accurate method)
   * Used when iframe document is available
   */
  extractSpeechFromDOM(iframeDocument: Document): string[] {
    const talkElements = iframeDocument.querySelectorAll("[data-tag=\"talk\"]");
    const speeches: string[] = [];

    talkElements.forEach(element => {
      const text = element.textContent?.replace(/["""""]/g, "").trim();
      if (text) {
        speeches.push(text);
      }
    });

    return speeches;
  }

  /**
   * Create TTS task via RunningHub API
   */
  async createTTSTask(text: string, referenceAudioFileName?: string): Promise<string> {
    const nodeInfoList = [
      {
        nodeId: "102", // Multi Line Text node
        fieldName: "multi_line_prompt",
        fieldValue: text,
      },
    ];

    // Add reference audio if provided
    if (referenceAudioFileName) {
      nodeInfoList.push({
        nodeId: "101", // Load Audio node
        fieldName: "audio",
        fieldValue: referenceAudioFileName,
      });
    }

    const response = await fetch(`${this.API_BASE_URL}/task/openapi/create`, {
      method: "POST",
      headers: {
        "Host": "www.runninghub.cn",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: this.config.apiKey,
        workflowId: this.config.workflowId,
        nodeInfoList,
      }),
    });

    const result = await response.json();

    console.log("TTS API Response:", result);

    if (result.code !== 0) {
      console.error("TTS API Error Details:", {
        code: result.code,
        msg: result.msg,
        workflowId: this.config.workflowId,
        apiKey: this.config.apiKey.substring(0, 10) + "...",
      });
      throw new Error(`TTS task creation failed: ${result.msg} (code: ${result.code})`);
    }

    return result.data.taskId;
  }

  /**
   * Query task status and result
   */
  async queryTaskResult(taskId: string): Promise<TTSTaskResult> {
    const response = await fetch(`${this.API_BASE_URL}/task/openapi/outputs`, {
      method: "POST",
      headers: {
        "Host": "www.runninghub.cn",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: this.config.apiKey,
        taskId,
      }),
    });

    const result = await response.json();

    if (result.code === 0 && result.data && result.data.length > 0) {
      // Task completed, return audio file
      return {
        taskId,
        audioUrl: result.data[0].fileUrl,
        status: "completed",
      };
    } else if (result.code === 805) {
      // Task failed
      return {
        taskId,
        status: "failed",
        error: result.data?.failedReason?.exception_message || "Unknown error",
      };
    } else {
      // Task in progress
      return {
        taskId,
        status: "processing",
      };
    }
  }

  /**
   * Poll task until completion
   */
  async waitForTaskCompletion(
    taskId: string,
    maxRetries = 900, // 30 minutes with 2s interval
    interval = 2000,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      const result = await this.queryTaskResult(taskId);

      // Update progress
      if (onProgress) {
        const progress = Math.min(90, 10 + (i / maxRetries) * 80);
        onProgress(progress);
      }

      if (result.status === "completed" && result.audioUrl) {
        if (onProgress) onProgress(100);
        return result.audioUrl;
      }

      if (result.status === "failed") {
        throw new Error(`TTS task failed: ${result.error}`);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error("TTS task timeout");
  }

  /**
   * Complete TTS workflow: extract text → generate speech → return audio URL
   */
  async generateSpeech(
    messageId: string,
    htmlContent: string,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    // Check cache
    const cached = this.audioCache.get(messageId);
    if (cached) {
      if (onProgress) onProgress(100);
      return cached;
    }

    // Extract speech content (process HTML to include highlight styles/classes first)
    if (onProgress) onProgress(5);
    const processed = processForHighlight(htmlContent);
    const speeches = this.extractSpeechContent(processed);
    if (speeches.length === 0) {
      throw new Error("No highlighted speech content found");
    }

    // Merge all speech content
    const fullText = speeches.join(" ");

    // Create TTS task
    if (onProgress) onProgress(10);
    const taskId = await this.createTTSTask(fullText, this.config.referenceAudioUrl);

    // Wait for task completion
    const audioUrl = await this.waitForTaskCompletion(taskId, 900, 2000, onProgress);

    // Cache result
    this.audioCache.set(messageId, audioUrl);

    return audioUrl;
  }

  /**
   * Get cached audio URL
   */
  getCachedAudio(messageId: string): string | undefined {
    return this.audioCache.get(messageId);
  }

  /**
   * Clear audio cache
   */
  clearCache(): void {
    this.audioCache.clear();
  }

  /**
   * Clear specific message cache
   */
  clearMessageCache(messageId: string): void {
    this.audioCache.delete(messageId);
  }

  /**
   * Upload reference audio (for character-specific voice)
   */
  async uploadReferenceAudio(audioFile: File): Promise<string> {
    const formData = new FormData();
    formData.append("apiKey", this.config.apiKey);
    formData.append("file", audioFile);
    formData.append("fileType", "audio");

    const response = await fetch(`${this.API_BASE_URL}/task/openapi/upload`, {
      method: "POST",
      headers: {
        "Host": "www.runninghub.cn",
      },
      body: formData,
    });

    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`Audio upload failed: ${result.msg}`);
    }

    return result.data.fileName;
  }

  /**
   * Update API key
   */
  updateApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  /**
   * Update workflow ID
   */
  updateWorkflowId(workflowId: string): void {
    this.config.workflowId = workflowId;
  }

  /**
   * Update reference audio
   */
  updateReferenceAudio(referenceAudioUrl?: string): void {
    this.config.referenceAudioUrl = referenceAudioUrl;
  }
}
