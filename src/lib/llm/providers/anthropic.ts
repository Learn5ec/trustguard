import type { LLMProvider, ChatMessage, RawTokenUsage } from '../types';

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  baseUrl: 'https://api.anthropic.com/v1/messages',
  models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  supportsStreaming: true,

  buildHeaders: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  }),

  buildBody: (messages: ChatMessage[], model: string, stream: boolean) => {
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    return {
      model,
      messages: userMessages,
      system: systemMessage?.content || '',
      stream,
      max_tokens: 4096
    };
  },

  parseStreamChunk: (chunk: string) => {
    try {
      const data = JSON.parse(chunk);
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        return data.delta.text;
      }
      return null;
    } catch {
      return null;
    }
  },

  // Anthropic streams usage in message_start (input) and message_delta (output)
  parseUsageFromChunk: (parsed: unknown): RawTokenUsage | null => {
    const d = parsed as any;
    // message_start carries input_tokens
    if (d?.type === 'message_start' && d.message?.usage?.input_tokens !== undefined) {
      return { inputTokens: d.message.usage.input_tokens, outputTokens: 0 };
    }
    // message_delta carries output_tokens
    if (d?.type === 'message_delta' && d.usage?.output_tokens !== undefined) {
      return { inputTokens: 0, outputTokens: d.usage.output_tokens };
    }
    return null;
  },

  parseFullResponse: (data: any) => {
    return data.content?.[0]?.text || '';
  }
};
