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

function modelsProxyPlugin(): Plugin {
  const middleware = async (req: any, res: any, next: any) => {
    if (req.url && req.url.startsWith('/api/models')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }
      
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const { provider, apiKey } = JSON.parse(body);
            if (!provider) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing provider' }));
              return;
            }
            const models = await fetchModelsFromProvider(provider, apiKey);
            res.statusCode = 200;
            res.end(JSON.stringify({ models }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message || 'Failed to fetch models' }));
          }
        });
      } else {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
    } else {
      next();
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), modelsProxyPlugin()],
  server: {
    host: '192.168.7.109',
    port: 23232,
    strictPort: true,
    allowedHosts: ['eastbound-unkempt-regulate.ngrok-free.dev'],
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    }
  }
})
