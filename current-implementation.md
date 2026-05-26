# TrustGuard AI — Current Implementation Reference

**Last Updated:** 2026-05-26  
**Status:** Phase 10 Complete — pubspec.yaml & pyproject.toml Batch Support  
**Repo:** `~/trustguard` (formerly `~/depguard`)  
**Dev server:** `http://192.168.7.109:23232` (also accessible via ngrok `eastbound-unkempt-regulate.ngrok-free.dev`)

---

## Quick Start

```bash
cd ~/trustguard
npm run dev          # dev server on :23232
npm run build        # tsc -b && vite build → dist/
npm run lint         # eslint with security plugin
```

First run: open Settings (⚙ top-right) → choose LLM provider → paste API key → optionally add GitHub token (raises rate limit 60→5000 req/hr, required for private repos).

---

## Architecture Overview

```
Browser (SPA — no backend for LLM calls)
│
├── React 19 + Vite 8 + TypeScript 6 (strict)
├── Zustand (3 stores: settings / analysis / batch)
├── TailwindCSS 3 (dark-mode first)
└── @react-pdf/renderer (PDF export, client-side)
```

All LLM calls go **directly from browser → provider API**. No proxy server. API keys live in `sessionStorage` only (cleared on tab close).

---

## Data Flow — Single Package Analysis

```
User input (pkg name / GitHub URL)
        │
        ▼
[ecosystem.ts] auto-detect ecosystem
        │
        ▼
[analysisStore.ts] runAnalysis()
        │
        ├─── [orchestrator.ts] analyzePackage()
        │         ├── [osv.ts]     CVEs for package
        │         ├── [github.ts]  repo stats (stars, forks, commits, author, release)
        │         └── [npm.ts]     weekly downloads, dependents, versions
        │
        ├─── Source code fetch (parallel with above)
        │         ├── GitHub URL → [githubSource.ts] fetchGitHubRepoSourceChunks()
        │         │       detects monorepo → returns SourceChunk[] (1 per workspace)
        │         └── npm pkg   → [unpkg.ts] fetchPackageSourceCode()
        │                               returns single SourceChunk
        │
        ├─── [osv.ts] enrichWithDependencyVulns()
        │         parses manifest from source → OSV batch query on up to 25 deps
        │
        ├─── [riskScore.ts] calculateRiskScore()   → riskScore 0-100
        ├─── [trustScore.ts] calculateTrustScore()  → trustScore 0-100
        │
        └─── LLM Analysis (see Agent Wiring below)
                  │
                  └─▶ set({ report }) → React re-renders panels
```

---

## Agent Wiring — LLM Analysis Pipeline

### Decision point

```
sourceChunks.length > 1 ?
    YES → MULTI-PASS (monorepo)
    NO  → SINGLE-PASS
```

### Single-Pass (npm pkg or simple GitHub repo)

```
buildAnalysisPrompt(enrichedData)   ← full data + source code
        │
        ▼
LLMClient.streamAnalysis()          ← SSE stream → llmStream state (live UI)
        │
        ▼
parseFullJsonResponse(buffer)       ← 3-tier robust parse (see JSON Robustness)
        │
        ▼
set({ report: parsed })             ← all panels render
```

### Multi-Pass (monorepo — N chunks)

```
For each SourceChunk[i]:
    buildChunkFindingsPrompt(label, content)
            │
            ▼
    LLMClient.streamAnalysis()   ← SILENT (no UI stream)
            │
            ▼
    extractFindingsFromResponse()  ← 3-tier robust extraction
            │
            ▼
    allChunkFindings.push(...findings)

deduplicateFindings(allChunkFindings)
    → groups by category::title[:40]
    → keeps highest severity per group
    → returns mergedFindings[]
            │
            ▼
set({ packageData.securityFindings: mergedFindings })  ← panel updates mid-analysis
            │
            ▼
buildSynthesisPrompt(dataWithoutSource, mergedFindings)
    ← source stripped to save tokens
    ← findings injected as context only (NOT in response schema)
            │
            ▼
LLMClient.streamAnalysis()    ← streams to UI (live panels update)
            │
            ▼
parseFullJsonResponse(synthBuffer)
            │
            ▼
finalReport = { ...parsed, securityFindings: mergedFindings }
set({ report: finalReport })
```

### Token tracking
All N chunk passes + synthesis pass tokens are summed into one `TokenUsage` displayed in `TokenUsagePanel`.

---

## JSON Robustness (Phase 9 — Critical Fix)

**Problem:** Several LLM providers (especially Mistral) emit malformed JSON:
- Markdown code fences wrapping the response (` ```json `)
- Trailing commas: `{"key": "val",}`
- Unescaped quotes inside string values: `"title": "Uses "eval" function"`
- Extra text after the closing `}` — old greedy regex `/\{[\s\S]*\}/` over-matched

**Solution** (in `analysisStore.ts`):

```
stripFences(text)              removes ```json fences
        │
extractFirstJsonObject(text)   bracket-counting (not greedy regex)
        │                       finds first balanced { ... }
        ├── JSON.parse()        Tier 1: standard parse
        ├── repairJson()        Tier 2: strip trailing commas → parse
        └── (chunk findings only — Tier 3):
            extractBalancedArray()     find "securityFindings": [ ... ]
            → JSON.parse(array)        try array directly
            → extractObjectsFromArrayText()   parse each { } individually
                                               skip malformed, keep valid
```

`parseFullJsonResponse(text)` — used for synthesis + single-pass (tiers 1+2)  
`extractFindingsFromResponse(text)` — used for chunk passes (tiers 1+2+3)

---

## Key Files & Responsibilities

| File | What it does |
|---|---|
| `store/analysisStore.ts` | **Central pipeline.** runAnalysis(), multi-pass flow, JSON utilities, AnalysisProgress state |
| `store/settingsStore.ts` | LLM provider/model/key, GitHub token, live model list fetch |
| `store/batchStore.ts` | Batch analysis state machine (5 concurrent, metadata-only) |
| `lib/llm/prompts.ts` | SYSTEM_PROMPT, buildAnalysisPrompt, buildChunkFindingsPrompt, buildSynthesisPrompt |
| `lib/llm/LLMClient.ts` | SSE streaming unified client, routes to correct provider |
| `lib/fetchers/githubSource.ts` | Monorepo detection, workflow scoring, workspace scoring, fetchGitHubRepoSourceChunks |
| `lib/fetchers/orchestrator.ts` | analyzePackage() — parallel OSV + GitHub + npm fetch |
| `lib/scoring/riskScore.ts` | Risk = vulns(0-40) + maintenance(0-25) + archived(+20) + scorecard(0-20) + license(0-10) + transitive(0-5) |
| `lib/scoring/trustScore.ts` | Trust = 100 − deductions + bonuses (adoption, activity, scorecard) |
| `lib/export/ReportExporter.ts` | Markdown + JSON export with full field parity |
| `lib/export/PdfDocument.tsx` | react-pdf document — emoji-free headings (Helvetica doesn't render emoji) |
| `components/report/ReportContainer.tsx` | Report layout, export dropdown, panel gating logic |
| `components/report/SecurityFindingsPanel.tsx` | 13-category finding cards + severity filter tabs; shows "clean" card when findings=[] |
| `components/report/AnalysisProgressBar.tsx` | Determinate % bar (multi-pass) or shimmer (single-pass) |

---

## AnalysisProgress State

```typescript
// Exported from analysisStore.ts
interface AnalysisProgress {
  phase: 'fetching' | 'scoring' | 'scanning' | 'synthesizing' | 'analyzing' | 'parsing';
  scanStep: number;   // 1-based chunk index (0 when not scanning)
  totalChunks: number;
  chunkLabel: string; // e.g. "langwatch" — shown in progress bar subtitle
}
```

Set at every pipeline stage; `null` when idle or complete.  
Consumed by `ExecutiveSummaryPanel`, `SecurityFindingsPanel`, `ThreatModel` via `ReportContainer`.

---

## Security Findings — 13 Categories

| Category | What triggers it |
|---|---|
| `README_CODE_MISMATCH` | README claims contradict source (e.g. "zero telemetry" + outbound call) |
| `SILENT_TELEMETRY` | Analytics/crash reporting auto-fires on import without consent |
| `THIRD_PARTY_DATA_EXFILTRATION` | Data sent to external domains not needed for package purpose |
| `INSECURE_TRANSMISSION` | HTTP not HTTPS, `rejectUnauthorized:false`, `verify=False` |
| `SENSITIVE_OUTBOUND` | Requests include credentials/tokens/PII in URL or body |
| `BACKGROUND_PROCESS` | setInterval/cron daemons, ServiceWorker, OS service install |
| `POSTINSTALL_RISK` | `scripts.postinstall/preinstall/prepare` in any package.json |
| `EXCESSIVE_PERMISSIONS` | FS access beyond purpose, raw sockets, sudo/admin elevation |
| `HARDCODED_SECRET` | API keys, tokens, passwords in source |
| `DANGEROUS_API_USAGE` | eval(), Function(), exec(), dynamic require() with user input |
| `PROTOTYPE_POLLUTION` | Unsafe Object.assign(target, input), recursive merge without check |
| `OBFUSCATION_INDICATOR` | eval(atob(…)), hex strings, minified code in source (not dist) |
| `DEPENDENCY_CVE` | Known CVEs in the scanned package's own direct dependencies |

Each finding: `{ category, severity, title, description, evidence, recommendation, confirmed }`.  
`confirmed: true` = directly observed in provided source. `false` = inferred.

---

## Report Panels & Their Data Sources

| Panel | Data source | Shows during load |
|---|---|---|
| Executive Summary | `report.executiveSummary` | AnalysisProgressBar |
| Code Review | `report.codeReview` | streaming text extraction |
| Security Findings | `report.securityFindings` or `data.securityFindings` | AnalysisProgressBar |
| STRIDE Threat Model | `report.threatModel` | AnalysisProgressBar |
| License Audit | `report.licenseExplanation` | hidden until ready |
| Alternatives | `report.alternatives` | hidden until ready |
| Remediation | `report.remediationSteps` | hidden until ready |
| Vulnerabilities | `data.vulnerabilities` (OSV.dev) | N/A — pre-loaded |
| Repo Metadata | `data.github` + `data.packageStats` | N/A — pre-loaded |
| Score Gauges | `data.riskScore` + `data.trustScore` | 0 shown immediately |

**Panel gating in ReportContainer:**
- CodeReviewPanel renders if `data.sourceCode || report?.codeReview`
- SecurityFindingsPanel renders if `data.sourceCode || report !== null`
- All other panels render when their data field is present

**SecurityFindingsPanel empty state:** When `findings.length === 0` and not streaming, shows a green "No security issues identified" card (does NOT return null — panel always visible after analysis).

---

## Score Algorithms

### Risk Score (0–100, additive)
- Vulnerabilities: CRITICAL=+40, HIGH=+25, MEDIUM=+15, LOW=+5 (capped at 40)
- Maintenance: no commits 1yr=+15, no commits 6mo=+10, no commits 3mo=+5
- Archived repo: +20
- OpenSSF Scorecard: max +20 (inverse of score)
- License: GPL/AGPL/SSPL=+10, LGPL/MPL=+5
- Transitive deps with CVEs: +5

### Trust Score (100 − deductions + bonuses)
Deductions mirror risk factors. Bonuses for: >1M weekly downloads (+10), >10k stars (+8), >100 contributors (+5), recent release (+5), signed releases (+5).

**Risk gauge is always red** (`text-red-500`) regardless of score value — low risk is still risk, not safety.

---

## Export Formats

| Format | Contents | File |
|---|---|---|
| JSON | Full raw state: packageData + report + tokenUsage | ReportContainer.tsx inline |
| Markdown | All sections with full field parity (popularityLabel, watchers, latestRelease, alt stars/downloads/features) | ReportExporter.ts |
| PDF | react-pdf rendered — same fields; emoji-free headings; covers all panels | PdfDocument.tsx + pdfExport.ts |

---

## Security Hardening — App-Level

| Concern | Implementation |
|---|---|
| API key storage | `sessionStorage` only — `lib/keyManager.ts`; cleared on tab close |
| Key transmission | Direct browser → provider API; no server proxy |
| GitHub token | Same sessionStorage treatment; only sent to `api.github.com` |
| XSS prevention | `lib/validation.ts` input sanitization; React escapes by default |
| CSP headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` in `vite.config.ts` |
| Static analysis | `eslint-plugin-security` on every build |
| No telemetry | Zero analytics or usage collection in TrustGuard itself |

---

## Known Runtime Vulnerabilities / User-Facing Risks

These are **current known limitations** a new session should be aware of:

1. **LLM JSON quality is provider-dependent.** Mistral and some other providers emit malformed JSON despite being told not to. The 3-tier `extractFindingsFromResponse` handles most cases, but fundamentally broken responses (missing closing brackets from truncation) fall back to showing 0 findings with a status message. User sees "No security issues identified" — potentially misleading if the scan failed silently.

2. **Source code not fetched for PyPI / Go / Maven / NuGet.** Only npm (via unpkg) and GitHub repos get source code. For other ecosystems, `data.sourceCode` is null → CodeReviewPanel and SecurityFindingsPanel are hidden. The LLM still runs a single-pass analysis but without source code to examine.

3. **Monorepo chunk limit is MAX_CHUNKS=5.** Large monorepos with many workspaces (e.g. 20+ packages) only scan the top 4 scored workspace dirs + root. Findings in lower-priority workspace dirs are silently skipped.

4. **GitHub API rate limit without token.** 60 requests/hour unauthenticated. Large repos or batch scans of GitHub packages can exhaust this quickly. User must add a GitHub PAT in Settings.

5. **Batch mode is metadata-only.** No LLM source code scan per package in batch mode — only OSV CVEs + GitHub stats + risk/trust scores. Security findings panel is empty for batch results.

6. **PDF rendering of emoji.** `@react-pdf/renderer` with Helvetica font cannot render emoji — headings are emoji-free by design, but if LLM output in `codeReview` / `executiveSummary` contains emoji, they may render as blank boxes in PDF. Not a security issue but a known UX defect.

7. **No persistent history.** TrustGuard is a pure SPA with no backend. Each session starts fresh. There is no way to retrieve previous analysis results after closing the tab.

8. **Ollama CORS.** Local Ollama requires `OLLAMA_ORIGINS=*` environment variable to accept browser requests. Without it, all Ollama requests fail with a CORS error. Not surfaced in UI — user sees a generic streaming error.

---

## Monorepo Detection & Source Fetching

`fetchGitHubRepoSourceChunks(url)` in `githubSource.ts`:

1. Fetch root directory listing via GitHub API
2. Check for monorepo markers: `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, `nx.json`, `turbo.json`, or `workspaces` in `package.json`
3. If monorepo: score workspace dirs by name → pick top 4 → one chunk per dir + root chunk
4. If simple repo: one chunk for root

**Workflow scoring** (`scoreWorkflowFile`): selects most security-relevant CI/CD file from `.github/workflows/`:
- publish/release = 10, codeql/security = 9, deploy/cd = 8, install/setup = 7, ci/build = 6, default = 1

**Per-chunk file selection** (`selectPriorityFiles`): package.json, index/main entry, telemetry files, install hooks, CI workflow, README — scans `src/` subdirectory too.

**Constants:** `MAX_CHUNK_CHARS=14000`, `MAX_TOTAL_CHARS=32000`, `MAX_FILE_CHARS=10000`, `MAX_WORKSPACE_DIRS=4`, `MAX_CHUNKS=5`

---

## LLM Providers

| Provider | Notes |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4 |
| Google Gemini | Gemini 2.5 Pro/Flash |
| Groq | Llama 3.3, Mixtral (fast inference) |
| Mistral | Mistral Large/Small — **known malformed JSON emitter; handled by 3-tier extractor** |
| Together AI | 100+ open models |
| Ollama | Local models — **requires `OLLAMA_ORIGINS=*`** |
| Zai | — |
| Zhipu (GLM) | GLM-4, GLM-4-Flash — JWT auth built into vite.config.ts proxy |

Live model lists fetched via `/api/models` proxy in `vite.config.ts` dev middleware. Production needs a companion Node.js service (see DEPLOYMENT.md).

---

## File Structure (flat reference)

```
src/
├── App.tsx                          Root — routes landing ↔ report
├── main.tsx                         Entry point
├── index.css                        Tailwind + progress-slide keyframe
├── types/analysis.ts                All domain types
├── store/
│   ├── analysisStore.ts             Pipeline + JSON utilities + AnalysisProgress
│   ├── settingsStore.ts             API keys + provider/model selection
│   └── batchStore.ts                Batch state machine
├── lib/
│   ├── ecosystem.ts                 Input → ecosystem detection
│   ├── validation.ts                XSS/input sanitization
│   ├── keyManager.ts                sessionStorage key manager
│   ├── llm/
│   │   ├── LLMClient.ts             SSE streaming unified client
│   │   ├── prompts.ts               3 prompts: single-pass / chunk / synthesis
│   │   ├── tokenPricing.ts          Cost table + calculateCost
│   │   ├── types.ts                 LLMProvider interface
│   │   └── providers/               openai anthropic gemini groq mistral
│   │                                together ollama zai zhipu
│   ├── fetchers/
│   │   ├── orchestrator.ts          analyzePackage() + enrichWithDependencyVulns()
│   │   ├── githubSource.ts          Monorepo detection + chunked source fetch
│   │   ├── github.ts                GitHub stats API
│   │   ├── npm.ts                   npm registry + downloads
│   │   ├── unpkg.ts                 CDN source fetch (npm packages)
│   │   ├── osv.ts                   CVE lookup + dep batch scan
│   │   └── types.ts                 SourceChunk, FetchResult
│   ├── scoring/
│   │   ├── riskScore.ts             Risk 0-100 (additive)
│   │   └── trustScore.ts            Trust 0-100 (deductions + bonuses)
│   ├── export/
│   │   ├── ReportExporter.ts        MD + JSON
│   │   ├── PdfDocument.tsx          react-pdf layout
│   │   └── pdfExport.ts             pdf().toBlob() → download
│   └── parsers/
│       ├── detector.ts              Manifest format detection
│       ├── packageJson.ts           package.json batch parser
│       └── requirementsTxt.ts       requirements.txt batch parser
└── components/
    ├── layout/
    │   ├── Header.tsx               Navbar + Settings drawer
    │   └── LandingPage.tsx          Home + search + batch upload
    ├── input/SearchBar.tsx          Search input
    ├── report/
    │   ├── ReportContainer.tsx      Layout + export + panel gating
    │   ├── AnalysisProgressBar.tsx  Determinate/shimmer progress bar
    │   ├── ExecutiveSummaryPanel.tsx
    │   ├── SecurityFindingsPanel.tsx  Cards + severity filter + clean state
    │   ├── CodeReviewPanel.tsx      Narrative review (streaming-aware)
    │   ├── ThreatModel.tsx          STRIDE 6-dimension panel
    │   ├── LicensePanel.tsx         Can/cannot/must matrix
    │   ├── VulnerabilityTable.tsx   CVE table
    │   ├── AlternativesPanel.tsx    Alternative packages
    │   ├── RemediationPanel.tsx     Prioritised action roadmap
    │   ├── RepoMetadataPanel.tsx    GitHub stats + package stats
    │   ├── TokenUsagePanel.tsx      Token count + USD cost
    │   ├── ScoreGauge.tsx           SVG gauge — risk always red
    │   └── RiskBadge.tsx            Severity label badge
    └── batch/
        ├── DependencySelector.tsx   Manifest upload + selection
        └── BatchProgress.tsx        Batch run progress cards
```

---

## Phase History (condensed)

| Phase | Key work |
|---|---|
| 1–5 | Core app: data fetchers, scoring, 9 LLM providers, risk/trust gauges, CVE table, export |
| 6 | Token usage tracking across all providers |
| 7 | Secure Code Review Agent: 13 categories, SecurityFindingsPanel, dependency CVE scanner |
| 8 | Monorepo chunked analysis, workflow scoring, workspace scoring, AnalysisProgressBar, synthesis prompt hardening, export parity (Markdown + PDF), risk gauge always red |
| 9 | 3-tier JSON robustness (greedy regex → bracket counting, repairJson, per-object fallback), SecurityFindingsPanel never returns null, ReportContainer panel gate widened |
