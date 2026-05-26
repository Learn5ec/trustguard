import type { LLMProvider, ChatMessage, RawTokenUsage } from '../types';

export const togetherProvider: LLMProvider = {
  id: 'together',
  name: 'Together AI',
  baseUrl: 'https://api.together.xyz/v1/chat/completions',
  models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'Qwen/Qwen2-72B-Instruct'],
  supportsStreaming: true,
  
  buildHeaders: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
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
  
  parseUsageFromChunk: (parsed: unknown): RawTokenUsage | null => {
    const d = parsed as any;
    if (d?.usage?.prompt_tokens !== undefined) {
      return { inputTokens: d.usage.prompt_tokens, outputTokens: d.usage.completion_tokens ?? 0 };
    }
    return null;
  },

  parseFullResponse: (data: any) => {
    return data.choices?.[0]?.message?.content || '';
  }
};
