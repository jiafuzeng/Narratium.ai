/**
 * TTS Settings Component
 *
 * This component provides a user interface for configuring Text-to-Speech settings:
 * - Enable/disable TTS功能
 * - RunningHub API Key configuration
 * - Auto-play settings
 * - Workflow ID configuration (optional)
 *
 * Settings are persisted in localStorage for user convenience.
 */

"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/app/i18n";

interface TTSSettingsProps {
  onSettingsChange?: (settings: TTSSettings) => void;
}

export interface TTSSettings {
  enabled: boolean;
  apiKey: string;
  autoPlay: boolean;
  workflowId: string;
}

export default function TTSSettingsPanel({ onSettingsChange }: TTSSettingsProps) {
  const { t, fontClass } = useLanguage();

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [autoPlay, setAutoPlay] = useState(true);
  const [workflowId, setWorkflowId] = useState("1983711725981769729");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedEnabled = localStorage.getItem("tts_enabled");
    const savedApiKey = localStorage.getItem("tts_api_key");
    const savedAutoPlay = localStorage.getItem("tts_auto_play");
    const savedWorkflowId = localStorage.getItem("tts_workflow_id");

    if (savedEnabled === "true") setEnabled(true);
    if (savedApiKey) setApiKey(savedApiKey);
    if (savedAutoPlay === "false") setAutoPlay(false);

    // Auto-migrate old workflow ID to new one
    if (savedWorkflowId === "1983506334995914754") {
      console.log("Auto-migrating old workflow ID to new one");
      const newWorkflowId = "1983711725981769729";
      setWorkflowId(newWorkflowId);
      localStorage.setItem("tts_workflow_id", newWorkflowId);
    } else if (savedWorkflowId) {
      setWorkflowId(savedWorkflowId);
    }
  }, []);

  // Notify parent component of settings changes
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange({ enabled, apiKey, autoPlay, workflowId });
    }
  }, [enabled, apiKey, autoPlay, workflowId, onSettingsChange]);

  const handleSave = () => {
    localStorage.setItem("tts_enabled", String(enabled));
    localStorage.setItem("tts_api_key", apiKey);
    localStorage.setItem("tts_auto_play", String(autoPlay));
    localStorage.setItem("tts_workflow_id", workflowId);

    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent("ttsSettingsChanged", {
      detail: { enabled, apiKey, autoPlay, workflowId },
    }));

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="mt-4 p-4 bg-[#2a261f] rounded-lg border border-[#534741]">
      <h3 className={`text-sm font-medium text-[#f4e8c1] mb-3 ${fontClass}`}>
        🎙️ TTS 语音合成设置
      </h3>

      <div className="space-y-4">
        {/* Enable TTS Toggle */}
        <div className="flex items-center justify-between">
          <span className={`text-xs text-[#c0a480] ${fontClass}`}>启用 TTS</span>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? "bg-[#d1a35c]" : "bg-[#534741]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* API Key Input */}
        <div>
          <label className={`block text-xs text-[#c0a480] mb-1 ${fontClass}`}>
            RunningHub API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入你的 API Key"
              className={`w-full px-3 py-2 pr-10 text-xs bg-[#1c1c1c] border border-[#534741] rounded text-[#f4e8c1] focus:border-[#d1a35c] focus:outline-none ${fontClass}`}
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8a8a8a] hover:text-[#c0a480] transition-colors"
              title={showApiKey ? "隐藏" : "显示"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {showApiKey ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
          <p className={`mt-1 text-xs text-[#8a8a8a] ${fontClass}`}>
            获取 API Key: <a href="https://www.runninghub.cn" target="_blank" rel="noopener noreferrer" className="text-[#d1a35c] hover:underline">RunningHub 官网</a>
          </p>
        </div>

        {/* Auto-play Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-xs text-[#c0a480] block ${fontClass}`}>自动播放</span>
            <p className={`text-xs text-[#8a8a8a] mt-0.5 ${fontClass}`}>新消息到达时自动播放语音</p>
          </div>
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              autoPlay ? "bg-[#d1a35c]" : "bg-[#534741]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoPlay ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Workflow ID Input (Advanced) */}
        <details className="mt-2">
          <summary className={`text-xs text-[#8a8a8a] cursor-pointer hover:text-[#c0a480] transition-colors ${fontClass}`}>
            高级设置
          </summary>
          <div className="mt-2">
            <label className={`block text-xs text-[#c0a480] mb-1 ${fontClass}`}>
              工作流 ID
            </label>
            <input
              type="text"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              placeholder="1983711725981769729"
              className={`w-full px-3 py-2 text-xs bg-[#1c1c1c] border border-[#534741] rounded text-[#f4e8c1] focus:border-[#d1a35c] focus:outline-none ${fontClass}`}
            />
            <p className={`mt-1 text-xs text-[#8a8a8a] ${fontClass}`}>
              默认使用 TTS2 情绪控制工作流
            </p>
          </div>
        </details>

        {/* Description */}
        <div className="pt-2 border-t border-[#534741]">
          <p className={`text-xs text-[#8a8a8a] leading-relaxed ${fontClass}`}>
            TTS 将自动识别并播放对话中的说话内容（引号内的文本）。<br />
            生成的音频会被缓存，无需重复生成。
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!apiKey && enabled}
          className={`w-full py-2 px-4 rounded-lg transition-all duration-200 ${
            saveSuccess
              ? "bg-green-600 text-white"
              : !apiKey && enabled
                ? "bg-[#534741] text-[#8a8a8a] cursor-not-allowed"
                : "bg-[#d1a35c] hover:bg-[#e0b46d] text-[#1a1816] hover:shadow-[0_0_8px_rgba(209,163,92,0.4)]"
          } ${fontClass}`}
        >
          {saveSuccess ? "✓ 已保存" : "保存设置"}
        </button>

        {/* Status Messages */}
        {enabled && !apiKey && (
          <div className={`p-2 bg-red-900/20 border border-red-700/30 rounded text-xs text-red-400 ${fontClass}`}>
            ⚠️ 请输入 API Key 以启用 TTS 功能
          </div>
        )}
      </div>
    </div>
  );
}
