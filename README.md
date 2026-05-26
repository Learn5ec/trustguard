# TrustGuard AI — Dependency Security Analysis Agent

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)](#)
[![React](https://img.shields.io/badge/React-19-61dafb)](#)
[![License](https://img.shields.io/badge/license-proprietary-red)](#)

TrustGuard AI is a browser-based security intelligence tool that analyses software dependencies before you ship them. It performs static code analysis, CVE scanning, trust scoring, and STRIDE threat modelling — then streams a structured report via your chosen LLM provider.

> ⚠️ **Disclaimer:** TrustGuard AI provides automated analysis for developer due-diligence. Results may be incomplete — always verify critical findings independently. Misuse of any security information obtained through this tool is entirely the responsibility of the user. This tool must not be used to target systems without explicit authorisation.

---

## Features

### 🔍 Secure Code Review Agent
- Fetches source files per package — for simple repos: up to 8 priority files (README, manifest, CI/CD workflows, telemetry files, install hooks, entry points); for **monorepos**: up to 5 chunked sections covering the root plus the top 4 most security-relevant workspace directories
- **Monorepo detection and chunked analysis** — detects monorepos via `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, `nx.json`, `turbo.json`, or the `workspaces` field in `package.json`; each workspace section is scanned in its own silent LLM pass, findings are deduplicated across passes, then a final streaming synthesis pass produces the full report
- **Workflow file scoring** — selects the most security-relevant CI/CD workflow from `.github/workflows/` by scoring file names (publish/release > codeql/security > deploy > install/setup > ci/build); avoids accidentally picking irrelevant infrastructure workflows
- Produces **structured security findings** across 13 categories: silent telemetry, postinstall risks, hardcoded secrets, dangerous API usage, prototype pollution, obfuscation indicators, insecure transmission, data exfiltration, background processes, excessive permissions, README/code mismatches, and CVEs in direct dependencies
- Every finding includes: severity (CRITICAL → INFO), evidence (file + line reference), recommendation, and a `confirmed` vs `suspected` flag
- Narrative code review alongside the structured findings

### 🛡️ Vulnerability Intelligence
- Live CVE data from [OSV.dev](https://osv.dev) for the scanned package
- Dependency CVE scanner: parses `package.json` / `requirements.txt` / `go.mod` and batch-queries OSV for up to 25 direct dependencies
- Supports: npm, PyPI, Go, Maven, NuGet, Ruby, Rust, GitHub repos

### 📊 Risk & Trust Scoring
- **Risk Score (0–100):** Additive — vulnerability severity, maintenance health, archived status, OpenSSF Scorecard, license risk, transitive exposure
- **Trust Score (0–100):** Starts at 100 with deductions for risk signals and bonuses for adoption, activity, and community size
- Both scores show always-visible breakdowns explaining every point added or deducted
- Risk score gauge renders in **red at all values** — a low risk score is not "good enough" to show green

### 🤖 Multi-Provider LLM Streaming
9 providers supported with real-time SSE streaming:

| Provider | Notes |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4 |
| Google Gemini | Gemini 2.5 Pro/Flash |
| Groq | Llama 3.3, Mixtral (fast inference) |
| Mistral | Mistral Large/Small |
| Together AI | 100+ open models |
| Ollama | Local models (no API key needed) |
| z.ai | — |
| Zhipu AI (GLM) | GLM-4, GLM-4-Flash |

Live model lists are fetched from each provider when you open Settings.

### ⏳ Analysis Progress Indicators
Each report panel (Executive Summary, Security Findings, Threat Model) shows a live progress bar while the AI is generating content:
- **Multi-pass / monorepo:** determinate bar with percentage (e.g. `Scanning code section 2 of 4 · langwatch — 43%`)
- **Single-pass:** indeterminate shimmer animation

### 📦 Batch Analysis
- Upload a `package.json`, `requirements.txt`, or other manifest file to analyse all dependencies at once
- Select/deselect individual packages before running
- 5 concurrent analyses with real-time progress
- Export results as JSON

### 📤 Report Export
- **JSON** — Full machine-readable report including all fields, security findings, and token usage
- **Markdown** — Complete formatted report: security findings table, dependency CVE table, repository metadata (including `watchers`, `latestRelease`, `authorPublicRepos`), alternatives with stars/downloads/features, and all other sections
- **PDF** — Rendered via `@react-pdf/renderer`; headings use plain text (no emoji) to prevent character overlap in Helvetica font layout; includes all fields shown on-screen

> HTML export is not supported — use Markdown or PDF for shareable reports.

### 💰 Token Usage Tracking
Shows input tokens, output tokens, total, and estimated USD cost after each analysis. For multi-pass monorepo scans the display combines all chunk passes and the synthesis pass into one total. Supports exact counts where the provider returns them; estimates otherwise (~4 chars/token).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Language | TypeScript 6 (strict) |
| State | Zustand |
| Styling | TailwindCSS 3 (dark-mode first) |
| Icons | Lucide React |
| Markdown | react-markdown |
| PDF | `@react-pdf/renderer` |
| Linting | ESLint + eslint-plugin-security |

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+

### Local Development

```bash
git clone https://gitlab.your-company.com/security/trustguard.git
cd trustguard
npm install
npm run dev
```

The dev server starts at `http://localhost:23232` (or the host configured in `vite.config.ts`).

### First-time Setup
1. Open the app in your browser
2. Click the **⚙ gear icon** (top right) to open Settings
3. Select your LLM provider and paste your API key
4. *(Optional)* Add a GitHub Personal Access Token to increase rate limits from 60 → 5,000 req/hour, and to enable scanning of **private repos**

### Scanning a Private GitHub Repository
1. Generate a GitHub PAT: GitHub → Settings → Developer settings → Personal access tokens
   - Fine-grained: grant `Contents: Read-only` on the specific repo
   - Classic: `repo` scope
2. Paste the token into Settings → GitHub Token
3. Paste the full private repo URL into the search bar: `https://github.com/your-org/private-repo`

### Build for Production

```bash
npm run build      # outputs to dist/
npm run preview    # preview production build locally
```

> **Note:** The production build is a purely static SPA (`dist/`). A small companion API endpoint (`POST /api/models`) is required for live model listing from LLM providers — see [DEPLOYMENT.md](./DEPLOYMENT.md) for nginx + Node.js configuration.

---

## Security Model

| Concern | Approach |
|---|---|
| API key storage | `sessionStorage` only — cleared on tab close, never persisted |
| Key transmission | Sent directly to the LLM provider's API. No server-side proxy for LLM calls |
| GitHub token | Same sessionStorage treatment; only sent to `api.github.com` |
| XSS prevention | Input sanitisation in `validation.ts`; React escapes by default |
| CSP | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` set in vite dev server and nginx config |
| Static analysis | `eslint-plugin-security` runs on every CI build |
| No telemetry | TrustGuard AI itself collects zero analytics or usage data |

---

## Project Structure

```
trustguard/
├── src/
│   ├── components/        # React UI components
│   ├── lib/               # Business logic (fetchers, scoring, LLM, export)
│   ├── store/             # Zustand state stores
│   └── types/             # TypeScript interfaces
├── public/                # Static assets
├── dist/                  # Production build output (git-ignored)
├── .github/workflows/     # CI pipeline
├── README.md              # This file
├── DEPLOYMENT.md          # Production deployment guide
├── HOW_TO_USE.md          # End-user usage guide
├── current-implementation.md   # Full feature inventory and file structure
└── future-improvements.md      # Roadmap and planned work
```

See [current-implementation.md](./current-implementation.md) for a full feature inventory and file structure, and [future-improvements.md](./future-improvements.md) for the roadmap.

---

## CI Pipeline

GitHub Actions runs on every push to `main` and every PR:
1. `npm ci` — reproducible install
2. `npm run lint` — ESLint + security plugin
3. `npx tsc --noEmit` — type check
4. `npm run build` — full production build

---

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the complete production deployment guide covering:
- GitLab CI/CD pipeline with auto-deploy
- Nginx subdomain configuration
- Cloudflare DNS, SSL, WAF, and cache rules
- Security headers (CSP, HSTS, Permissions-Policy)
- The `/api/models` Node.js companion service
- Zero-downtime deploys

---

## Contributing

1. Branch from `main`: `git checkout -b feature/your-feature`
2. Make changes; ensure `npm run build` and `npm run lint` pass
3. Open a Merge Request on GitLab
4. CI must be green before merge

---

*Built for internal security engineering use. All LLM API calls are made client-side — no data is retained by TrustGuard AI.*
