import type { LLMProvider, ChatMessage, RawTokenUsage } from '../types';

export const openaiProvider: LLMProvider = {
  id: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  supportsStreaming: true,

  buildHeaders: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }),

  buildBody: (messages: ChatMessage[], model: string, stream: boolean) => ({
    model,
    messages,
    stream,
    // Request usage data in the final stream chunk
    ...(stream ? { stream_options: { include_usage: true } } : {})
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

  parseUsageFromChunk: (parsed: unknown): RawTokenUsage | null => {
    const d = parsed as any;
    if (d?.usage?.prompt_tokens !== undefined) {
      return {
        inputTokens: d.usage.prompt_tokens,
        outputTokens: d.usage.completion_tokens ?? 0
      };
    }
    return null;
  },

  parseFullResponse: (data: any) => {
    return data.choices?.[0]?.message?.content || '';
  }
};
