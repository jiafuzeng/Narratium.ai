/**
 * useTTS Hook
 *
 * React hook for managing TTS (Text-to-Speech) functionality
 * Provides state management and audio playback control for messages
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TTSService } from '@/lib/api/tts-service';

export interface TTSState {
  isGenerating: boolean;
  isPlaying: boolean;
  error: string | null;
  progress: number; // 0-100
}

export interface UseTTSOptions {
  apiKey: string;
  workflowId?: string;
  autoPlay?: boolean;
}

export function useTTS(options: UseTTSOptions) {
  const { apiKey, workflowId = '1983711725981769729', autoPlay = true } = options;

  const [states, setStates] = useState<Map<string, TTSState>>(new Map());
  const ttsServiceRef = useRef<TTSService>();
  const audioRef = useRef<HTMLAudioElement>();
  const currentPlayingRef = useRef<string | null>(null);

  // Initialize TTS service and audio element
  useEffect(() => {
    if (!apiKey) return;

    ttsServiceRef.current = new TTSService({ apiKey, workflowId });
    audioRef.current = new Audio();

    // Audio event handlers
    const handleEnded = () => {
      if (currentPlayingRef.current) {
        updateState(currentPlayingRef.current, { isPlaying: false });
        currentPlayingRef.current = null;
      }
    };

    const handleError = () => {
      if (currentPlayingRef.current) {
        updateState(currentPlayingRef.current, {
          isPlaying: false,
          error: 'Audio playback failed'
        });
        currentPlayingRef.current = null;
      }
    };

    audioRef.current.addEventListener('ended', handleEnded);
    audioRef.current.addEventListener('error', handleError);

    return () => {
      audioRef.current?.removeEventListener('ended', handleEnded);
      audioRef.current?.removeEventListener('error', handleError);
      audioRef.current?.pause();
    };
  }, [apiKey, workflowId]);

  /**
   * Get TTS state for a message
   */
  const getState = useCallback((messageId: string): TTSState => {
    return states.get(messageId) || {
      isGenerating: false,
      isPlaying: false,
      error: null,
      progress: 0
    };
  }, [states]);

  /**
   * Update TTS state for a message
   */
  const updateState = useCallback((messageId: string, updates: Partial<TTSState>) => {
    setStates(prev => {
      const newStates = new Map(prev);
      const currentState = newStates.get(messageId) || {
        isGenerating: false,
        isPlaying: false,
        error: null,
        progress: 0
      };
      newStates.set(messageId, { ...currentState, ...updates });
      return newStates;
    });
  }, []);

  /**
   * Generate and play speech
   */
  const generateAndPlay = useCallback(async (
    messageId: string,
    htmlContent: string
  ): Promise<void> => {
    if (!ttsServiceRef.current || !audioRef.current) {
      throw new Error('TTS service not initialized');
    }

    try {
      updateState(messageId, { isGenerating: true, error: null, progress: 0 });

      // Check cache
      const cachedUrl = ttsServiceRef.current.getCachedAudio(messageId);

      let audioUrl: string;

      if (cachedUrl) {
        audioUrl = cachedUrl;
        updateState(messageId, { progress: 100 });
      } else {
        // Generate new speech
        audioUrl = await ttsServiceRef.current.generateSpeech(
          messageId,
          htmlContent,
          (progress) => {
            updateState(messageId, { progress });
          }
        );
      }

      updateState(messageId, { isGenerating: false, progress: 0 });

      // Auto play if enabled
      if (autoPlay && audioRef.current) {
        // Stop current playback if any
        if (currentPlayingRef.current) {
          updateState(currentPlayingRef.current, { isPlaying: false });
        }

        audioRef.current.src = audioUrl;
        await audioRef.current.play();
        currentPlayingRef.current = messageId;
        updateState(messageId, { isPlaying: true });
      }
    } catch (error) {
      console.error('TTS generation failed:', error);
      updateState(messageId, {
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0
      });
      throw error;
    }
  }, [autoPlay, updateState]);

  /**
   * Play cached audio
   */
  const play = useCallback(async (messageId: string): Promise<void> => {
    if (!ttsServiceRef.current || !audioRef.current) {
      throw new Error('TTS service not initialized');
    }

    const cachedUrl = ttsServiceRef.current.getCachedAudio(messageId);
    if (!cachedUrl) {
      updateState(messageId, { error: 'Audio not generated yet' });
      throw new Error('Audio not generated yet');
    }

    try {
      // Stop current playback if any
      if (currentPlayingRef.current && currentPlayingRef.current !== messageId) {
        updateState(currentPlayingRef.current, { isPlaying: false });
      }

      audioRef.current.src = cachedUrl;
      await audioRef.current.play();
      currentPlayingRef.current = messageId;
      updateState(messageId, { isPlaying: true, error: null });
    } catch (error) {
      console.error('Audio playback failed:', error);
      updateState(messageId, {
        error: error instanceof Error ? error.message : 'Playback failed'
      });
      throw error;
    }
  }, [updateState]);

  /**
   * Stop current playback
   */
  const stop = useCallback((messageId?: string): void => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;

    if (messageId) {
      updateState(messageId, { isPlaying: false });
      if (currentPlayingRef.current === messageId) {
        currentPlayingRef.current = null;
      }
    } else if (currentPlayingRef.current) {
      updateState(currentPlayingRef.current, { isPlaying: false });
      currentPlayingRef.current = null;
    }
  }, [updateState]);

  /**
   * Toggle play/pause
   */
  const toggle = useCallback(async (messageId: string): Promise<void> => {
    const state = getState(messageId);

    if (state.isPlaying) {
      stop(messageId);
    } else if (ttsServiceRef.current?.getCachedAudio(messageId)) {
      await play(messageId);
    } else {
      throw new Error('Audio not generated yet');
    }
  }, [getState, play, stop]);

  /**
   * Clear all cached audio
   */
  const clearCache = useCallback((): void => {
    ttsServiceRef.current?.clearCache();
    setStates(new Map());
  }, []);

  /**
   * Clear specific message cache
   */
  const clearMessageCache = useCallback((messageId: string): void => {
    ttsServiceRef.current?.clearMessageCache(messageId);
    setStates(prev => {
      const newStates = new Map(prev);
      newStates.delete(messageId);
      return newStates;
    });
  }, []);

  /**
   * Check if audio is cached
   */
  const isCached = useCallback((messageId: string): boolean => {
    return !!ttsServiceRef.current?.getCachedAudio(messageId);
  }, []);

  /**
   * Upload reference audio
   */
  const uploadReferenceAudio = useCallback(async (audioFile: File): Promise<string> => {
    if (!ttsServiceRef.current) {
      throw new Error('TTS service not initialized');
    }
    return await ttsServiceRef.current.uploadReferenceAudio(audioFile);
  }, []);

  /**
   * Update reference audio URL
   */
  const setReferenceAudio = useCallback((referenceAudioUrl?: string): void => {
    ttsServiceRef.current?.updateReferenceAudio(referenceAudioUrl);
  }, []);

  return {
    // Actions
    generateAndPlay,
    play,
    stop,
    toggle,
    clearCache,
    clearMessageCache,
    uploadReferenceAudio,
    setReferenceAudio,

    // State queries
    getState,
    isCached,

    // Current playing message
    currentPlaying: currentPlayingRef.current,
  };
}
