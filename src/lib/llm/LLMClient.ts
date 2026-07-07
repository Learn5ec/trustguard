import type { LLMProvider, ChatMessage } from './types';
import type { TokenUsage } from '../../types/analysis';
import { openaiProvider } from './providers/openai';
import { anthropicProvider } from './providers/anthropic';
import { mistralProvider } from './providers/mistral';
import { zhipuProvider } from './providers/zhipu';
import { zaiProvider } from './providers/zai';
import { groqProvider } from './providers/groq';
import { togetherProvider } from './providers/together';
import { geminiProvider } from './providers/gemini';
import { ollamaProvider } from './providers/ollama';
import { calculateCost, estimateTokens } from './tokenPricing';

export const LLM_PROVIDERS: Record<string, LLMProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  mistral: mistralProvider,
  zhipu: zhipuProvider,
  zai: zaiProvider,
  groq: groqProvider,
  together: togetherProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

export class LLMClient {
  static async *streamAnalysis(
    providerId: string,
    model: string,
    apiKey: string,
    messages: ChatMessage[],
    onUsage?: (usage: TokenUsage) => void
  ): AsyncGenerator<string, void, unknown> {
    const provider = LLM_PROVIDERS[providerId];
    if (!provider) throw new Error(`Provider ${providerId} not found`);

    const headers = await provider.buildHeaders(apiKey);
    const body = provider.buildBody(messages, model, true);

    let url = provider.baseUrl;
    if (providerId === 'gemini') {
      // Key is passed via x-goog-api-key header (set in buildHeaders above),
      // NOT appended to the URL — keeps it out of server logs and browser history.
      url = `${provider.baseUrl}/${model}:streamGenerateContent`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API Error (${response.status}): ${errorText}`);
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let lineBuf = '';
    let allText = '';

    // For Anthropic: accumulate input + output separately across events
    let accInputTokens = 0;
    let accOutputTokens = 0;
    let gotApiUsage = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuf += decoder.decode(value, { stream: true });
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6).trim();

          // ── Text extraction ──────────────────────────────────────────────
          const chunkText = provider.parseStreamChunk(dataStr);
          if (chunkText) {
            allText += chunkText;
            yield chunkText;
          }

          // ── Usage extraction ─────────────────────────────────────────────
          if (provider.parseUsageFromChunk && dataStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(dataStr);
              const usage = provider.parseUsageFromChunk(parsed);
              if (usage) {
                gotApiUsage = true;
                // Anthropic sends input in message_start (outputTokens=0) and output
                // in message_delta (inputTokens=0) so we accumulate both
                if (usage.inputTokens > 0)  accInputTokens  = usage.inputTokens;
                if (usage.outputTokens > 0) accOutputTokens = usage.outputTokens;
              }
            } catch { /* ignore JSON parse errors on non-data lines */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // ── Fire onUsage callback ────────────────────────────────────────────────
    if (onUsage) {
      let inputTokens  = accInputTokens;
      let outputTokens = accOutputTokens;
      let isEstimated  = !gotApiUsage;

      if (!gotApiUsage) {
        // Fall back to character-based estimation
        const promptText = messages.map(m => m.content).join('\n');
        inputTokens  = estimateTokens(promptText);
        outputTokens = estimateTokens(allText);
        isEstimated  = true;
      }

      const totalTokens     = inputTokens + outputTokens;
      const estimatedCostUSD = calculateCost(providerId, model, inputTokens, outputTokens);

      onUsage({
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostUSD,
        model,
        provider: providerId,
        isEstimated
      });
    }
  }
}
