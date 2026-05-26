# TrustGuard AI — Production Deployment Guide

**Target:** Subdomain SPA on company domain · Nginx · Cloudflare · GitLab CI/CD  
**Last Updated:** 2026-05-26  
**Audience:** DevOps / Infrastructure team

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Server Preparation](#3-server-preparation)
4. [Models Proxy Service](#4-models-proxy-service)
5. [Nginx Configuration](#5-nginx-configuration)
6. [Cloudflare Setup](#6-cloudflare-setup)
7. [GitLab CI/CD Pipeline](#7-gitlab-cicd-pipeline)
8. [First Deploy (Manual Bootstrap)](#8-first-deploy-manual-bootstrap)
9. [Security Hardening Checklist](#9-security-hardening-checklist)
10. [Log Rotation & Monitoring](#10-log-rotation--monitoring)
11. [Rollback Procedure](#11-rollback-procedure)
12. [Maintenance & Updates](#12-maintenance--updates)

---

## 1. Architecture Overview

```
User Browser
     │  HTTPS
     ▼
Cloudflare Edge  ──── WAF / DDoS / Cache / DNS
     │  HTTPS (Origin cert)
     ▼
Nginx (your server)
     ├── /              → serve static dist/ (SPA)
     └── /api/models    → proxy_pass → localhost:3721 (Node.js models proxy)

All LLM API calls, GitHub API calls, OSV calls
are made CLIENT-SIDE directly from the browser.
The server only serves static files + one models endpoint.
```

**Why a models proxy service?**  
The Vite dev server includes a built-in `/api/models` plugin that relays model-listing requests to LLM providers (needed because some providers don't allow CORS from arbitrary origins). In production, that plugin is gone — a lightweight standalone Node.js service replaces it. It is the **only server-side component**.

**What the server never sees:**  
- LLM API keys (sent browser → LLM provider directly)
- GitHub tokens (sent browser → api.github.com directly)
- Package source code or analysis results

---

## 2. Prerequisites

### On the deployment server
- Ubuntu 22.04 LTS or Debian 12 (recommended)
- Nginx 1.24+
- Node.js 20 LTS (`node` + `npm`)
- `pm2` for process management: `npm install -g pm2`
- `rsync` and `ssh`
- UFW or iptables firewall

### In GitLab
- GitLab project with the TrustGuard AI source code
- GitLab Runner registered and available (shell or Docker executor)
- The following CI/CD variables configured (Settings → CI/CD → Variables):

| Variable | Type | Description |
|---|---|---|
| `DEPLOY_HOST` | Variable | Deployment server hostname or IP |
| `DEPLOY_USER` | Variable | SSH user on the deployment server (e.g. `trustguard`) |
| `DEPLOY_SSH_KEY` | File | Private SSH key for the deploy user (protected, masked) |
| `DEPLOY_PATH` | Variable | Absolute path to web root, e.g. `/var/www/trustguard` |
| `MODELS_PROXY_PORT` | Variable | Port for the models proxy, e.g. `3721` |

### DNS (Cloudflare)
- A record for `trustguard.your-company.com` pointing to your server's IP
- Cloudflare proxy (orange cloud) **enabled**

---

## 3. Server Preparation

### 3.1 Create a dedicated deploy user

```bash
# Run as root or sudo on the deployment server
adduser trustguard --disabled-password --gecos ""
mkdir -p /var/www/trustguard
chown trustguard:www-data /var/www/trustguard
chmod 750 /var/www/trustguard

# Add nginx to the trustguard group so it can read the files
usermod -aG trustguard www-data
```

### 3.2 Set up SSH key for GitLab CI

```bash
# On your local machine — generate a deploy key pair
ssh-keygen -t ed25519 -C "gitlab-trustguard-deploy" -f ~/.ssh/trustguard_deploy

# Copy the PUBLIC key to the server
ssh-copy-id -i ~/.ssh/trustguard_deploy.pub trustguard@your-server

# Add the PRIVATE key (trustguard_deploy) content as the
# DEPLOY_SSH_KEY variable in GitLab (type: File, protected: yes)
```

### 3.3 Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Enable pm2 to start on boot
pm2 startup systemd -u trustguard --hp /home/trustguard
# Run the printed command as root
```

### 3.4 Create the models proxy directory

```bash
mkdir -p /opt/trustguard-proxy
chown trustguard:trustguard /opt/trustguard-proxy
```

---

## 4. Models Proxy Service

The models proxy is a minimal Express/Node.js HTTP service that mirrors the Vite dev plugin: it accepts `POST /api/models` with `{ provider, apiKey }` and returns the provider's model list.

### 4.1 Create the proxy server

Save this file as `/opt/trustguard-proxy/server.js`:

```javascript
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = parseInt(process.env.MODELS_PROXY_PORT || '3721', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

// ── Zhipu JWT builder ──────────────────────────────────────────────────────
function buildZhipuJWT(apiKey) {
  const [id, secret] = apiKey.split('.');
  if (!id || !secret) throw new Error('Invalid Zhipu key format (expected id.secret)');
  const now = Date.now();
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp: now + 3600000, timestamp: now })).toString('base64url');
  const sig     = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// ── Generic JSON fetch (no external deps) ─────────────────────────────────
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

// ── Provider model fetchers ────────────────────────────────────────────────
async function getModels(provider, apiKey) {
  switch (provider) {
    case 'openai': {
      const d = await fetchJson('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      return d.data.map(m => m.id);
    }
    case 'anthropic': {
      const d = await fetchJson('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      });
      return d.data.map(m => m.id);
    }
    case 'mistral': {
      const d = await fetchJson('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      return d.data.map(m => m.id);
    }
    case 'groq': {
      const d = await fetchJson('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      return d.data.map(m => m.id);
    }
    case 'together': {
      const d = await fetchJson('https://api.together.xyz/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      return d.data.map(m => m.id);
    }
    case 'zai': {
      const d = await fetchJson('https://api.z.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      return d.data.map(m => m.id);
    }
    case 'gemini': {
      const d = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      return d.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
    }
    case 'zhipu': {
      const token = buildZhipuJWT(apiKey);
      try {
        const d = await fetchJson('https://open.bigmodel.cn/api/paas/v4/models', {
          headers: { Authorization: `Bearer ${token}` }
        });
        return d.data.map(m => m.id);
      } catch {
        return ['glm-4', 'glm-4-flash', 'glm-3-turbo'];
      }
    }
    case 'ollama': {
      const d = await fetchJson('http://localhost:11434/api/tags');
      return d.models.map(m => m.name);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS — only allow configured origins
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/models') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) { // Guard against large payloads
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
      }
    });
    req.on('end', async () => {
      try {
        const { provider, apiKey } = JSON.parse(body);
        if (!provider || typeof provider !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid provider' }));
          return;
        }
        const models = await getModels(provider, apiKey || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal error' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[trustguard-proxy] listening on 127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
```

### 4.2 Create PM2 ecosystem file

Save as `/opt/trustguard-proxy/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'trustguard-proxy',
    script: '/opt/trustguard-proxy/server.js',
    instances: 1,
    exec_mode: 'fork',
    user: 'trustguard',
    env: {
      NODE_ENV: 'production',
      MODELS_PROXY_PORT: '3721',
      // Replace with your actual subdomain
      ALLOWED_ORIGIN: 'https://trustguard.your-company.com',
    },
    error_file: '/var/log/trustguard/proxy-error.log',
    out_file:   '/var/log/trustguard/proxy-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '150M',
    restart_delay: 3000,
    max_restarts: 10,
  }]
};
```

### 4.3 Start and persist the proxy

```bash
sudo mkdir -p /var/log/trustguard
sudo chown trustguard:trustguard /var/log/trustguard

# As the trustguard user:
su - trustguard
pm2 start /opt/trustguard-proxy/ecosystem.config.js
pm2 save   # persist across reboots
```

---

## 5. Nginx Configuration

### 5.1 Obtain an Origin Certificate from Cloudflare

In Cloudflare dashboard:  
**SSL/TLS → Origin Server → Create Certificate**  
- Choose RSA 2048 or ECDSA (P-256)
- Hostnames: `trustguard.your-company.com`
- Validity: 15 years (Cloudflare origin certs are only trusted by Cloudflare)

Download:
- `trustguard.your-company.com.pem` → `/etc/ssl/trustguard/origin.crt`
- `trustguard.your-company.com.key` → `/etc/ssl/trustguard/origin.key`

```bash
sudo mkdir -p /etc/ssl/trustguard
sudo chmod 700 /etc/ssl/trustguard
# Copy your cert files here, then:
sudo chmod 644 /etc/ssl/trustguard/origin.crt
sudo chmod 600 /etc/ssl/trustguard/origin.key
```

Also download Cloudflare's Authenticated Origin Pull CA:
```bash
sudo curl -o /etc/ssl/trustguard/cloudflare-origin-pull-ca.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

### 5.2 Nginx site config

Save as `/etc/nginx/sites-available/trustguard`:

```nginx
# ── Rate limiting zones ───────────────────────────────────────────────────
limit_req_zone $binary_remote_addr zone=trustguard_api:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=trustguard_static:10m rate=300r/m;

# ── HTTP → redirect to HTTPS ──────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name trustguard.your-company.com;

    # Allow Cloudflare health checks, redirect everything else
    location / {
        return 301 https://$host$request_uri;
    }
}

# ── HTTPS main server ─────────────────────────────────────────────────────
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name trustguard.your-company.com;

    # ── SSL — Cloudflare Origin Certificate ───────────────────────────────
    ssl_certificate     /etc/ssl/trustguard/origin.crt;
    ssl_certificate_key /etc/ssl/trustguard/origin.key;

    # Authenticated Origin Pulls — only accept connections from Cloudflare
    ssl_client_certificate /etc/ssl/trustguard/cloudflare-origin-pull-ca.pem;
    ssl_verify_client on;

    # Modern TLS only
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling (for origin cert — optional but good practice)
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # ── Security headers ──────────────────────────────────────────────────
    add_header Strict-Transport-Security     "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options        "nosniff" always;
    add_header X-Frame-Options               "DENY" always;
    add_header X-XSS-Protection              "1; mode=block" always;
    add_header Referrer-Policy               "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy            "geolocation=(), microphone=(), camera=(), usb=(), payment=()" always;

    # Content Security Policy
    # TrustGuard AI makes client-side calls to all LLM providers and data APIs —
    # all required connect-src origins are listed explicitly.
    add_header Content-Security-Policy "
        default-src 'self';
        script-src  'self' 'unsafe-inline';
        style-src   'self' 'unsafe-inline';
        img-src     'self' data: https://avatars.githubusercontent.com;
        font-src    'self';
        connect-src 'self'
                    https://api.openai.com
                    https://api.anthropic.com
                    https://generativelanguage.googleapis.com
                    https://api.groq.com
                    https://api.mistral.ai
                    https://api.together.xyz
                    https://api.z.ai
                    https://open.bigmodel.cn
                    https://api.github.com
                    https://raw.githubusercontent.com
                    https://registry.npmjs.org
                    https://api.npmjs.org
                    https://unpkg.com
                    https://api.osv.dev
                    https://api.securityscorecards.dev;
        frame-src   'none';
        object-src  'none';
        base-uri    'self';
        form-action 'self';
        upgrade-insecure-requests;
    " always;

    # ── Logging ───────────────────────────────────────────────────────────
    access_log /var/log/nginx/trustguard.access.log combined buffer=32k flush=5s;
    error_log  /var/log/nginx/trustguard.error.log warn;

    # ── Document root ─────────────────────────────────────────────────────
    root /var/www/trustguard;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json
               application/javascript application/xml+rss
               application/atom+xml image/svg+xml;

    # ── Static assets — long-lived cache (Vite content-hashes filenames) ──
    location /assets/ {
        limit_req zone=trustguard_static burst=100 nodelay;
        expires 1y;
        add_header Cache-Control "public, immutable";
        # Re-add security headers (add_header doesn't inherit into nested locations)
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options        "DENY" always;
    }

    # ── Models proxy API ──────────────────────────────────────────────────
    location /api/models {
        limit_req zone=trustguard_api burst=10 nodelay;

        proxy_pass         http://127.0.0.1:3721;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 15s;
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;

        # Strip internal headers
        proxy_hide_header X-Powered-By;
    }

    # ── SPA fallback — all routes serve index.html ─────────────────────────
    location / {
        limit_req zone=trustguard_static burst=50 nodelay;
        try_files $uri $uri/ /index.html;

        # index.html must not be cached (SPA entry point)
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma        "no-cache" always;
        add_header Expires       "0" always;
        # Re-add security headers
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options        "DENY" always;
    }

    # ── Block hidden files and sensitive paths ────────────────────────────
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(env|log|bak|sql|sh|md)$ {
        deny all;
        access_log off;
    }
}
```

### 5.3 Enable and test

```bash
sudo ln -s /etc/nginx/sites-available/trustguard /etc/nginx/sites-enabled/trustguard
sudo nginx -t                   # must say "syntax is ok" and "test is successful"
sudo systemctl reload nginx
```

---

## 6. Cloudflare Setup

### 6.1 DNS record

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `trustguard` | `<your server IP>` | ✅ Proxied (orange cloud) |

### 6.2 SSL/TLS settings

**SSL/TLS → Overview:**
- Mode: **Full (strict)** — Cloudflare verifies your Origin Certificate

**SSL/TLS → Edge Certificates:**
- Always Use HTTPS: **On**
- Minimum TLS Version: **TLS 1.2**
- TLS 1.3: **On**
- HSTS: Enable — `max-age=31536000`, include subdomains, preload

**SSL/TLS → Origin Server:**
- Authenticated Origin Pulls: **On** — this enforces that only Cloudflare can reach nginx (the `ssl_verify_client on` directive above validates this)

### 6.3 Security settings

**Security → WAF:**
- Enable Cloudflare Managed Ruleset (OWASP + Cloudflare Core)
- Create a custom rule to challenge/block unusual request volumes to `/api/models`:

  ```
  Rule: Protect models endpoint
  Expression: (http.request.uri.path eq "/api/models" and cf.threat_score gt 10)
  Action: Managed Challenge
  ```

**Security → Bots:**
- Bot Fight Mode: **On**

**Security → Settings:**
- Security Level: **Medium**
- Browser Integrity Check: **On**
- Hotlink Protection: **On**

### 6.4 Performance / Cache rules

**Rules → Cache Rules — New rule:**

```
Rule name: TrustGuard AI Assets — Immutable Cache
Match: URI Path starts with /assets/
Cache status: Eligible for cache
Edge Cache TTL: 1 year
Browser Cache TTL: 1 year
```

```
Rule name: TrustGuard AI HTML — No Cache
Match: URI Path equals / OR ends with .html
Cache status: Bypass cache
```

```
Rule name: TrustGuard AI API — No Cache
Match: URI Path starts with /api/
Cache status: Bypass cache
```

### 6.5 Firewall — server-side IP allowlist (recommended)

Lock your server so it only accepts inbound HTTPS from Cloudflare IPs (not the public internet). This prevents attackers from bypassing Cloudflare.

```bash
# Download current Cloudflare IP ranges
curl -s https://www.cloudflare.com/ips-v4 | sudo tee /etc/nginx/cloudflare-ips.conf > /dev/null

# Then in your UFW rules — allow only Cloudflare + your office/VPN IP for SSH
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <your-office-or-vpn-IP> to any port 22 comment "SSH admin"

# Allow Cloudflare IPv4 ranges on port 443 and 80
# (automate this with a cron job that re-fetches the list periodically)
while IFS= read -r ip; do
  sudo ufw allow from "$ip" to any port 443 comment "Cloudflare"
  sudo ufw allow from "$ip" to any port 80  comment "Cloudflare redirect"
done < /etc/nginx/cloudflare-ips.conf

sudo ufw enable
```

> Script this as a weekly cron to refresh Cloudflare IPs automatically — they change occasionally.

---

## 7. GitLab CI/CD Pipeline

Save as `.gitlab-ci.yml` in the root of the repository:

```yaml
# TrustGuard AI GitLab CI/CD Pipeline
# Stages: build → test → deploy

stages:
  - build
  - test
  - deploy

variables:
  NODE_VERSION: "20"
  # Disable host key checking for rsync deploy
  GIT_DEPTH: "1"

default:
  image: node:20-alpine
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/

# ── Stage 1: Build ──────────────────────────────────────────────────────────
build:
  stage: build
  script:
    - npm ci --prefer-offline
    - npm run build
  artifacts:
    name: "trustguard-dist-$CI_COMMIT_SHORT_SHA"
    paths:
      - dist/
    expire_in: 7 days
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# ── Stage 2: Test ───────────────────────────────────────────────────────────
lint-and-typecheck:
  stage: test
  needs: []           # Run in parallel with build
  script:
    - npm ci --prefer-offline
    - npm run lint
    - npx tsc --noEmit
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# ── Stage 3: Deploy (main branch only) ──────────────────────────────────────
deploy:production:
  stage: deploy
  needs:
    - build
    - lint-and-typecheck
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client rsync
    # Set up SSH
    - eval $(ssh-agent -s)
    - echo "$DEPLOY_SSH_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    - ssh-keyscan -H "$DEPLOY_HOST" >> ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts
  script:
    # Sync built assets to server (atomic: temp dir → rename)
    - |
      rsync -avz --delete \
        --checksum \
        -e "ssh -o StrictHostKeyChecking=yes" \
        dist/ \
        ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}_next/
    # Atomic swap: rename _next to live dir with minimal downtime
    - |
      ssh -o StrictHostKeyChecking=yes \
        ${DEPLOY_USER}@${DEPLOY_HOST} \
        "mv ${DEPLOY_PATH} ${DEPLOY_PATH}_prev 2>/dev/null || true && \
         mv ${DEPLOY_PATH}_next ${DEPLOY_PATH} && \
         chmod -R 750 ${DEPLOY_PATH}"
    # Reload nginx (no restart — zero downtime)
    - |
      ssh -o StrictHostKeyChecking=yes \
        ${DEPLOY_USER}@${DEPLOY_HOST} \
        "sudo /bin/systemctl reload nginx"
  after_script:
    # Clean up old backup
    - |
      ssh -o StrictHostKeyChecking=yes \
        ${DEPLOY_USER}@${DEPLOY_HOST} \
        "rm -rf ${DEPLOY_PATH}_prev" || true
  environment:
    name: production
    url: https://trustguard.your-company.com
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: on_success
```

### 7.1 Allow the deploy user to reload nginx without a password

On the server:
```bash
sudo visudo
# Add this line:
trustguard ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
```

---

## 8. First Deploy (Manual Bootstrap)

Run this once to set up the server before CI takes over:

```bash
# On your local machine
npm run build

# Upload initial build
rsync -avz dist/ trustguard@your-server:/var/www/trustguard/

# Upload models proxy files
scp /opt/trustguard-proxy/server.js trustguard@your-server:/opt/trustguard-proxy/
scp /opt/trustguard-proxy/ecosystem.config.js trustguard@your-server:/opt/trustguard-proxy/

# On the server: start proxy
su - trustguard -c "pm2 start /opt/trustguard-proxy/ecosystem.config.js && pm2 save"

# Verify everything
curl -I https://trustguard.your-company.com          # should return 200
curl -X POST https://trustguard.your-company.com/api/models \
  -H "Content-Type: application/json" \
  -d '{"provider":"ollama","apiKey":""}' | jq .    # should return {"models":[...]}
```

---

## 9. Security Hardening Checklist

Work through this before going live:

### Server
- [ ] UFW enabled; only Cloudflare IPs + your admin IP allowed on 443/80
- [ ] SSH: key-only auth, root login disabled (`PermitRootLogin no`, `PasswordAuthentication no`)
- [ ] `fail2ban` installed and configured for SSH brute-force protection
- [ ] `unattended-upgrades` enabled for automatic security patches
- [ ] `/var/www/trustguard` owned by `trustguard:www-data`, mode `750` — not world-readable
- [ ] `/opt/trustguard-proxy/server.js` owned by `trustguard`, mode `600`
- [ ] Node.js process runs as `trustguard` user — not root
- [ ] `/api/models` listens on `127.0.0.1` only — not exposed directly

### Nginx
- [ ] `nginx -t` passes cleanly
- [ ] `server_tokens off;` in `nginx.conf` (hides nginx version)
- [ ] Authenticated Origin Pulls enforced (`ssl_verify_client on`)
- [ ] No directory listing (`autoindex off;` — default in nginx)
- [ ] `.env`, `.md`, `.sh`, `.log` files blocked
- [ ] HSTS header confirmed present: `curl -I https://trustguard.your-company.com | grep Strict`

### Cloudflare
- [ ] SSL mode is **Full (strict)** — not "Flexible"
- [ ] Authenticated Origin Pulls enabled in Cloudflare dashboard
- [ ] WAF Managed Rules enabled
- [ ] Bot Fight Mode on
- [ ] Always Use HTTPS on
- [ ] TLS minimum version: 1.2

### Application
- [ ] No API keys or secrets in the git repository (check with `git log -p | grep -i 'key\|token\|secret\|password'`)
- [ ] `DEPLOY_SSH_KEY` GitLab variable is marked **Protected** and **Masked**
- [ ] CI pipeline `DEPLOY_SSH_KEY` is a dedicated key — not a developer's personal key
- [ ] Models proxy `ALLOWED_ORIGIN` is set to the exact production URL

### Post-go-live verification
```bash
# Security headers check
curl -I https://trustguard.your-company.com

# Expected headers (verify all present):
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Content-Security-Policy: ...
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: geolocation=(), ...

# SSL grade — aim for A+
# https://www.ssllabs.com/ssltest/analyze.html?d=trustguard.your-company.com

# Security headers grade — aim for A+
# https://securityheaders.com/?q=trustguard.your-company.com
```

---

## 10. Log Rotation & Monitoring

### Nginx log rotation

`/etc/logrotate.d/trustguard-nginx`:
```
/var/log/nginx/trustguard.*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        /bin/kill -USR1 $(cat /run/nginx.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
```

### Proxy log rotation

`/etc/logrotate.d/trustguard-proxy`:
```
/var/log/trustguard/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
}
```

### Health check endpoint (nginx)

Add to the nginx config (inside the `server {}` block) for uptime monitors:

```nginx
location /health {
    access_log off;
    return 200 '{"status":"ok"}';
    add_header Content-Type application/json;
}
```

### PM2 monitoring

```bash
pm2 status          # service status
pm2 logs trustguard-proxy --lines 50   # recent logs
pm2 monit           # live dashboard
```

---

## 11. Rollback Procedure

If a deploy causes issues:

```bash
# On the server — swap back to previous build
mv /var/www/trustguard /var/www/trustguard_bad
mv /var/www/trustguard_prev /var/www/trustguard
sudo systemctl reload nginx

# Or, re-trigger a previous pipeline in GitLab:
# CI/CD → Pipelines → find last good commit → Re-run
```

GitLab artifacts are kept for 7 days — you can download and manually deploy any previous `dist/` artifact.

---

## 12. Maintenance & Updates

### Updating the application
Push to `main` — CI builds and deploys automatically. Zero-downtime (atomic rsync swap + `nginx reload`).

### Updating the models proxy
The `server.js` file is deployed separately (not via CI — it changes infrequently). To update:

```bash
scp /opt/trustguard-proxy/server.js trustguard@your-server:/opt/trustguard-proxy/server.js
ssh trustguard@your-server "pm2 restart trustguard-proxy"
```

### Refreshing Cloudflare IP allowlist
Add to root crontab (`crontab -e`):

```cron
# Refresh Cloudflare IPs weekly (Sunday 02:00)
0 2 * * 0 /usr/local/bin/refresh-cloudflare-ips.sh
```

`/usr/local/bin/refresh-cloudflare-ips.sh`:
```bash
#!/bin/bash
set -euo pipefail
NEW_IPS=$(curl -sf https://www.cloudflare.com/ips-v4)
# Reset and re-add (simplistic — adapt to your firewall management tool)
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from <YOUR_ADMIN_IP> to any port 22 comment "SSH admin"
while IFS= read -r ip; do
  ufw allow from "$ip" to any port 443 comment "Cloudflare"
  ufw allow from "$ip" to any port 80  comment "Cloudflare redirect"
done <<< "$NEW_IPS"
ufw --force enable
```

### Node.js and dependency updates
```bash
# Check for outdated packages
npm outdated

# Update (in a branch, run CI before merging to main)
npm update
npm audit fix
```

---

*This document should be reviewed and updated whenever the application architecture changes. The deployment process has been designed to be repeatable — a fresh server should be deployable from scratch using only this guide.*
