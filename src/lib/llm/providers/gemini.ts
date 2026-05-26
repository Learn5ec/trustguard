import type { LLMProvider, ChatMessage, RawTokenUsage } from '../types';

export const geminiProvider: LLMProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
  supportsStreaming: true,

  buildHeaders: () => ({
    'Content-Type': 'application/json'
  }),

  buildBody: (messages: ChatMessage[], _model: string, _stream: boolean) => {
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    const contents = conversationMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const body: any = { contents };
    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }
    return body;
  },

  parseStreamChunk: (chunk: string) => {
    try {
      const data = JSON.parse(chunk);
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch {
      return null;
    }
  },

  // Gemini sends usageMetadata in every chunk; we use the last one with totals
  parseUsageFromChunk: (parsed: unknown): RawTokenUsage | null => {
    const d = parsed as any;
    if (d?.usageMetadata?.totalTokenCount !== undefined) {
      return {
        inputTokens: d.usageMetadata.promptTokenCount ?? 0,
        outputTokens: d.usageMetadata.candidatesTokenCount ?? 0
      };
    }
    return null;
  },

  parseFullResponse: (data: any) => {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
};
