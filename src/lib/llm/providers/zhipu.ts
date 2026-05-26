import type { LLMProvider, ChatMessage, RawTokenUsage } from '../types';

async function buildZhipuJWT(apiKey: string): Promise<string> {
  const parts = apiKey.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid Zhipu API key format. Expected id.secret');
  }
  const [id, secret] = parts;
  const now = Date.now();
  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const payload = { api_key: id, exp: now + 3600000, timestamp: now };

  const encoder = new TextEncoder();
  
  // Custom base64url encoding
  const toBase64Url = (str: string) => {
    return btoa(str)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const headerBase64 = toBase64Url(JSON.stringify(header));
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${headerBase64}.${payloadBase64}`;

  const keyData = encoder.encode(secret);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );

  const signatureBuffer = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureString = signatureArray.map(b => String.fromCharCode(b)).join('');
  const signatureBase64 = btoa(signatureString)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsignedToken}.${signatureBase64}`;
}

export const zhipuProvider: LLMProvider = {
  id: 'zhipu',
  name: 'GLM (Zhipu AI)',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  models: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
  supportsStreaming: true,
  
  buildHeaders: async (apiKey: string) => {
    const token = await buildZhipuJWT(apiKey);
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  },
  
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
