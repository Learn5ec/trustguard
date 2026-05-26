// Token pricing per 1M tokens (USD). Approximate as of 2026.
// Prices are { input, output } in USD per 1,000,000 tokens.
const PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  openai: {
    'gpt-4o':              { input: 2.50,  output: 10.00 },
    'gpt-4o-mini':         { input: 0.15,  output: 0.60  },
    'gpt-4-turbo':         { input: 10.00, output: 30.00 },
    'gpt-4':               { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo':       { input: 0.50,  output: 1.50  },
  },
  anthropic: {
    'claude-opus-4-7':               { input: 15.00, output: 75.00 },
    'claude-sonnet-4-6':             { input: 3.00,  output: 15.00 },
    'claude-haiku-4-5-20251001':     { input: 0.80,  output: 4.00  },
    'claude-3-5-sonnet-20241022':    { input: 3.00,  output: 15.00 },
    'claude-3-5-haiku-20241022':     { input: 0.80,  output: 4.00  },
    'claude-3-opus-20240229':        { input: 15.00, output: 75.00 },
  },
  mistral: {
    'mistral-large-latest':  { input: 2.00,  output: 6.00  },
    'mistral-medium':        { input: 2.75,  output: 8.10  },
    'mistral-small-latest':  { input: 0.10,  output: 0.30  },
    'open-mistral-7b':       { input: 0.25,  output: 0.25  },
    'open-mixtral-8x7b':     { input: 0.70,  output: 0.70  },
  },
  groq: {
    'llama-3.1-70b-versatile':  { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant':     { input: 0.05, output: 0.08 },
    'mixtral-8x7b-32768':       { input: 0.24, output: 0.24 },
    'llama3-70b-8192':          { input: 0.59, output: 0.79 },
    'llama3-8b-8192':           { input: 0.05, output: 0.08 },
  },
  gemini: {
    'gemini-1.5-pro':          { input: 1.25,  output: 5.00  },
    'gemini-1.5-flash':        { input: 0.075, output: 0.30  },
    'gemini-2.0-flash-exp':    { input: 0.00,  output: 0.00  },
    'gemini-2.5-pro':          { input: 1.25,  output: 10.00 },
    'gemini-2.5-flash':        { input: 0.15,  output: 0.60  },
  },
  together: {
    // Generic fallback for Together AI models
    _default:                  { input: 0.20,  output: 0.20  },
  },
  zhipu: {
    'glm-4':                   { input: 14.00, output: 14.00 },
    'glm-4-flash':             { input: 0.00,  output: 0.00  },
    'glm-3-turbo':             { input: 5.00,  output: 5.00  },
  },
  zai: {
    _default:                  { input: 0.00,  output: 0.00  },
  },
  ollama: {
    _default:                  { input: 0.00,  output: 0.00  },
  },
};

export function calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const providerPricing = PRICING[provider];
  if (!providerPricing) return 0;
  const modelPricing = providerPricing[model] || providerPricing['_default'];
  if (!modelPricing) return 0;
  return (inputTokens / 1_000_000) * modelPricing.input + (outputTokens / 1_000_000) * modelPricing.output;
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00 (free)';
  if (usd < 0.0001) return `< $0.0001`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

/** Rough character-based token estimator: ~4 chars per token for English */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
