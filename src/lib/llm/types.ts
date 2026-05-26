export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RawTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  supportsStreaming: boolean;
  buildHeaders: (apiKey: string) => Record<string, string> | Promise<Record<string, string>>;
  buildBody: (messages: ChatMessage[], model: string, stream: boolean) => object;
  parseStreamChunk: (chunk: string) => string | null;
  parseFullResponse: (data: unknown) => string;
  /** Optional: extract token counts from a raw parsed SSE chunk object */
  parseUsageFromChunk?: (parsed: unknown) => RawTokenUsage | null;
}
