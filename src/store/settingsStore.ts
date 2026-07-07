import { create } from 'zustand';
import { LLMKeyManager } from '../lib/keyManager';
import { LLM_PROVIDERS } from '../lib/llm/LLMClient';

export type LLMProviderId = 
  | 'openai' 
  | 'anthropic' 
  | 'mistral' 
  | 'zhipu' 
  | 'zai' 
  | 'groq' 
  | 'together' 
  | 'gemini' 
  | 'ollama';

interface SettingsState {
  llmProvider: LLMProviderId;
  llmModel: string;
  githubToken: string | null;
  includeTransitive: boolean;
  verboseThreatModel: boolean;
  timezone: 'IST' | 'UTC' | 'GMT' | 'EST' | 'EDT';
  setTimezone: (tz: 'IST' | 'UTC' | 'GMT' | 'EST' | 'EDT') => void;

  availableModels: string[];
  isLoadingModels: boolean;
  modelsError: string | null;
  
  setLLMProvider: (provider: LLMProviderId, model: string) => void;
  setLLMModel: (model: string) => void;
  setGithubToken: (token: string | null) => void;
  setIncludeTransitive: (include: boolean) => void;
  setVerboseThreatModel: (verbose: boolean) => void;
  fetchAvailableModels: (provider: LLMProviderId, apiKey?: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
  githubToken: null,
  includeTransitive: false,
  verboseThreatModel: false,
  timezone: 'IST',

  availableModels: LLM_PROVIDERS['openai']?.models || [],
  isLoadingModels: false,
  modelsError: null,

  setLLMProvider: (provider, model) => {
    set({ llmProvider: provider, llmModel: model });
    get().fetchAvailableModels(provider);
  },
  setLLMModel: (model) => set({ llmModel: model }),
  setGithubToken: (token) => set({ githubToken: token }),
  setIncludeTransitive: (include) => set({ includeTransitive: include }),
  setVerboseThreatModel: (verbose) => set({ verboseThreatModel: verbose }),
  setTimezone: (tz) => set({ timezone: tz }),

  fetchAvailableModels: async (provider, apiKey) => {
    const key = apiKey || (provider === 'ollama' ? 'local' : LLMKeyManager.get(provider));
    
    if (provider !== 'ollama' && !key) {
      const fallback = LLM_PROVIDERS[provider]?.models || [];
      set({ 
        availableModels: fallback, 
        isLoadingModels: false, 
        modelsError: 'No API key configured. Showing default models.' 
      });
      // Fallback model if current model is not part of provider
      if (!fallback.includes(get().llmModel) && fallback.length > 0) {
        set({ llmModel: fallback[0] });
      }
      return;
    }

    set({ isLoadingModels: true, modelsError: null });
    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let parsedError = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedError = parsed.error || errorText;
        } catch {}
        throw new Error(parsedError);
      }
      
      const data = await response.json();
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        set({ availableModels: data.models, isLoadingModels: false });
        if (!data.models.includes(get().llmModel)) {
          set({ llmModel: data.models[0] });
        }
      } else {
        throw new Error('No models returned from provider API.');
      }
    } catch (err: any) {
      console.warn(`Failed to fetch models for ${provider}, using static fallback:`, err.message);
      const fallback = LLM_PROVIDERS[provider]?.models || [];
      set({ 
        availableModels: fallback, 
        isLoadingModels: false, 
        modelsError: `Failed to load live models: ${err.message || 'Unknown error'}. Showing static fallback.` 
      });
      if (!fallback.includes(get().llmModel) && fallback.length > 0) {
        set({ llmModel: fallback[0] });
      }
    }
  }
}));
