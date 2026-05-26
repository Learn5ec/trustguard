import type { LLMProvider, ChatMessage, RawTokenUsage } from '../types';

export const ollamaProvider: LLMProvider = {
  id: 'ollama',
  name: 'Ollama (Local)',
  baseUrl: 'http://localhost:11434/v1/chat/completions',
  models: ['llama3', 'mistral', 'codellama', 'phi3'],
  supportsStreaming: true,

  buildHeaders: () => ({
    'Content-Type': 'application/json'
  }),

  buildBody: (messages: ChatMessage[], model: string, stream: boolean) => ({
    model,
    messages,
    stream
  }),

  parseStreamChunk: (chunk: string) => {
    if (chunk === '[DONE]') return null;
    try {
      const data = JSON.parse(chunk);
      return data.choices?.[0]?.delta?.content || null;
    } catch {
      return null;
    }
  },

  // Ollama OpenAI-compat endpoint sends usage in the final chunk
  parseUsageFromChunk: (parsed: unknown): RawTokenUsage | null => {
    const d = parsed as any;
    if (d?.usage?.prompt_tokens !== undefined) {
      return { inputTokens: d.usage.prompt_tokens, outputTokens: d.usage.completion_tokens ?? 0 };
    }
    return null;
  },

  parseFullResponse: (data: any) => data.choices?.[0]?.message?.content || ''
};
