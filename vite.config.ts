import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'

function buildNodeZhipuJWT(apiKey: string): string {
  const [id, secret] = apiKey.split('.');
  if (!id || !secret) throw new Error('Invalid Zhipu key format');
  const now = Date.now();
  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const payload = { api_key: id, exp: now + 3600000, timestamp: now };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${headerB64}.${payloadB64}`);
  const signatureB64 = hmac.digest('base64url');
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function fetchModelsFromProvider(provider: string, apiKey: string): Promise<string[]> {
  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }
    
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }

    if (provider === 'mistral') {
      const response = await fetch('https://api.mistral.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }

    if (provider === 'zhipu') {
      const token = buildNodeZhipuJWT(apiKey);
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/models', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        // Fallback to static if endpoint doesn't support models list or fails
        return ['glm-4', 'glm-4-flash', 'glm-3-turbo'];
      }
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }

    if (provider === 'zai') {
      const response = await fetch('https://api.z.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }

    if (provider === 'groq') {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }

    if (provider === 'together') {
      const response = await fetch('https://api.together.xyz/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.data.map((m: any) => m.id);
    }

    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json() as any;
      return data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace(/^models\//, ''));
    }

    if (provider === 'ollama') {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      return data.models.map((m: any) => m.name);
    }
  } catch (err: any) {
    console.error(`Error fetching models for ${provider}:`, err.message);
    throw err;
  }
  return [];
}

// Known valid provider IDs — reject anything outside this list
const KNOWN_PROVIDERS = new Set([
  'openai', 'anthropic', 'mistral', 'zhipu', 'zai', 'groq', 'together', 'gemini', 'ollama'
]);

// Max POST body size for /api/models (1 KB is plenty for provider + key)
const MAX_BODY_BYTES = 1024;

// Allowed request origins for the dev proxy
const ALLOWED_ORIGINS = new Set([
  'http://192.168.7.109:23232',
  'http://localhost:23232',
]);

function modelsProxyPlugin(): Plugin {
  const middleware = async (req: any, res: any, next: any) => {
    if (!(req.url && req.url.startsWith('/api/models'))) {
      next();
      return;
    }

    // ── Origin check — only accept requests from the dev server itself ────────
    const origin = req.headers['origin'] || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Forbidden: origin not allowed' }));
      return;
    }

    // ── CORS headers — restrict to the actual origin, not wildcard ────────────
    const responseOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'http://192.168.7.109:23232';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', responseOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // ── Read body with hard size limit ────────────────────────────────────────
    let body = '';
    let bodyBytes = 0;
    let aborted = false;

    await new Promise<void>((resolve) => {
      req.on('data', (chunk: Buffer) => {
        bodyBytes += chunk.length;
        if (bodyBytes > MAX_BODY_BYTES) {
          aborted = true;
          res.statusCode = 413;
          res.end(JSON.stringify({ error: 'Request body too large' }));
          resolve();
          return;
        }
        body += chunk.toString();
      });
      req.on('end', resolve);
    });

    if (aborted) return;

    try {
      const parsed = JSON.parse(body);
      const { provider, apiKey } = parsed;

      // ── Provider whitelist ────────────────────────────────────────────────
      if (!provider || typeof provider !== 'string' || !KNOWN_PROVIDERS.has(provider)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid or missing provider' }));
        return;
      }

      // ── Ollama SSRF guard — only allow if explicitly enabled ──────────────
      if (provider === 'ollama' && process.env.TRUSTGUARD_OLLAMA_ENABLED !== 'true') {
        // Ollama model list is handled client-side; do not proxy localhost fetch
        res.statusCode = 200;
        res.end(JSON.stringify({ models: [] }));
        return;
      }

      const models = await fetchModelsFromProvider(provider, apiKey);
      res.statusCode = 200;
      res.end(JSON.stringify({ models }));
    } catch (err: any) {
      console.error('[models-proxy] error:', err.message);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Failed to fetch models' }));
    }
  };

  return {
    name: 'models-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

// Content Security Policy — tightly scoped to known origins only
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // 'unsafe-inline' required by Vite HMR in dev
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.openai.com https://*.anthropic.com https://*.mistral.ai https://api.groq.com https://api.together.xyz https://api.z.ai https://open.bigmodel.cn https://generativelanguage.googleapis.com https://api.github.com https://registry.npmjs.org https://pypi.org https://crates.io https://pub.dev https://rubygems.org https://api.nuget.org https://hex.pm https://packagist.org https://search.maven.org https://repo1.maven.org https://api.osv.dev",
  "img-src 'self' https://*.githubusercontent.com data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), modelsProxyPlugin()],
  define: {
    // @iarna/toml uses Node.js `global` (global.Date, global.BigInt, global.Buffer).
    // Polyfill it as globalThis so the browser parser works without crashing.
    global: 'globalThis',
  },
  server: {
    host: '192.168.7.109',
    port: 23232,
    strictPort: true,
    allowedHosts: ['eastbound-unkempt-regulate.ngrok-free.dev'],
    headers: {
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    }
  }
})
