# TrustGuard AI — Current Implementation Reference

**Last Updated:** 2026-05-27  
**Status:** Phase 12 + Bug Fixes — Version parsing, Registry URL tracking, Version-specific source, Batch card UI, PDF export restored  
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
└── @react-pdf/renderer (PDF export, client-side, not surfaced in UI)
```

All LLM calls go **directly from browser → provider API**. No proxy server. API keys live in `sessionStorage` only (cleared on tab close).

---

## Data Flow — Single Package Analysis

```
User input (pkg name / GitHub URL / file upload)
        │
        ▼
[ecosystem dropdown or detectEcosystemFromFilename()] ← file uploads skip the dropdown
        │
        ▼
[analysisStore.ts] runAnalysis()
        │
        ├─── [orchestrator.ts] analyzePackage()
        │         ├── [registryLookup.ts]  resolve canonical GitHub URL (whitelist-only)
        │         ├── [osv.ts]             CVEs for package
        │         ├── [github.ts]          repo stats (stars, forks, commits, release)
        │         └── [npm.ts]             weekly downloads, dependents, versions
        │
        ├─── Source code fetch (parallel with above)
        │         ├── GitHub URL → [githubSource.ts] fetchGitHubRepoSourceChunks()
        │         │       detects monorepo → returns SourceChunk[] (1 per workspace)
        │         └── npm pkg   → [unpkg.ts] fetchPackageSourceCode()
        │
        ├─── [osv.ts] enrichWithDependencyVulns()
        │
        ├─── [riskScore.ts] calculateRiskScore()   → riskScore 0-100
        ├─── [trustScore.ts] calculateTrustScore()  → trustScore 0-100
        │
        └─── LLM Analysis (see Agent Wiring below)
                  │
                  └─▶ set({ report }) → React re-renders panels
```

---

## Anti-Hallucination Flow — Registry Lookup

**Problem being solved:** LLMs hallucinate GitHub URLs for packages. Directly trusting LLM-produced URLs is unsafe.

**Solution:** Before any LLM call, `registryLookup.ts` queries the **official package registry API** for the package name and extracts the GitHub URL from official metadata. The LLM never determines the repository URL.

```
Input: packageName + ecosystem
        │
        ▼
registryLookup.ts (WHITELIST ENFORCED — only contacts REGISTRY_BASES)
        │   npm        → registry.npmjs.org
        │   pypi/uv/pip/pipx → pypi.org/pypi
        │   rust       → crates.io/api/v1/crates
        │   pub        → pub.dev/api/packages
        │   ruby       → rubygems.org/api/v1/gems
        │   nuget      → api.nuget.org/v3/registration5
        │   hex        → hex.pm/api/packages
        │   packagist  → packagist.org/packages
        │   maven      → search.maven.org/solrsearch/select + repo1.maven.org
        │   go         → GitHub URL derived from module path (no API call)
        │   conda      → No structured API (skipped)
        │
        ▼
canonicalizeGithubUrl(rawUrl) → https://github.com/owner/repo
        │
        ▼
data.resolvedGithubUrl = canonical URL
data.resolvedVia = 'registry_lookup' | 'direct_url' | 'user_input'
```

`resolvedGithubUrl` and `resolvedVia` are shown in HTML/Markdown exports with an advisory note: "Verify this is the correct repository — wrong matches can happen when package names are ambiguous."

---

## Ecosystem Support

All ecosystems supported in the `Ecosystem` type (`src/types/analysis.ts`):

| Ecosystem | Registry | Download Signal | Notes |
|---|---|---|---|
| `npm` | registry.npmjs.org | Weekly downloads | Full source via unpkg.com |
| `pypi` | pypi.org | Weekly downloads | OSV mapped via `PyPI:` |
| `uv` | pypi.org | Weekly downloads | uv packages are PyPI packages |
| `pip` | pypi.org | Weekly downloads | pip packages are PyPI packages |
| `pipx` | pypi.org | Weekly downloads | pipx packages are PyPI packages |
| `rust` | crates.io | GitHub stars | OSV mapped via `crates.io:` |
| `pub` | pub.dev | GitHub stars | Dart/Flutter; OSV mapped via `pub:` |
| `ruby` | rubygems.org | GitHub stars | OSV mapped via `RubyGems:` |
| `nuget` | nuget.org | GitHub stars | OSV mapped via `NuGet:` |
| `hex` | hex.pm | GitHub stars | Elixir/Erlang |
| `packagist` | packagist.org | GitHub stars | PHP Composer packages |
| `conda` | No API | GitHub stars | Ecosystem only, no registry lookup |
| `go` | module path → GitHub | GitHub stars | No API call; URL from module path |
| `maven` | search.maven.org | GitHub stars | Group:artifact input format |
| `github` | github.com direct | GitHub stars | Direct repo URL input |

---

## New PackageAnalysisData Fields (Phase 11–12)

All fields in `src/types/analysis.ts`:

| Field | Type | Set by | Description |
|---|---|---|---|
| `popularityLabel` | `string` | `computePopularityLabel()` | Niche / Small community / Established / Popular / Industry Standard |
| `resolvedGithubUrl` | `string` | `registryLookup.ts` | Canonical GitHub URL actually analyzed |
| `resolvedVia` | `'direct_url' \| 'registry_lookup' \| 'user_input'` | orchestrator | How the repo URL was resolved |
| `resolvedRegistryUrl` | `string` | `registryLookup.ts` | Exact registry API URL contacted (e.g. `https://pypi.org/pypi/fastapi/0.111.0/json`) |
| `scanStartedAt` | `string` (ISO) | `runFullAnalysis.ts` | When the pipeline began |
| `scanEndedAt` | `string` (ISO) | `runFullAnalysis.ts` | When LLM analysis ended |
| `reportGeneratedAt` | `string` (ISO) | `runFullAnalysis.ts` | When the final report object was finalized |
| `isDeprecated` | `boolean` | `registryLookup.ts` | Package marked deprecated in registry |
| `isUnmaintained` | `boolean` | scoring/orchestrator | No commits for 3+ years |
| `deprecationMessage` | `string` | `registryLookup.ts` | Registry deprecation notice text |
| `commercialModel` | `'open-source' \| 'freemium' \| 'paid' \| 'unknown'` | License analysis | Overall licensing model |
| `commercialUseClassification` | `'allowed' \| 'restricted' \| 'needs-permission' \| 'unknown'` | License analysis | Commercial use posture |

---

## Timestamp Tracking & Timezone Support

**File:** `src/lib/utils/timestamps.ts`

```typescript
export type TimezoneId = 'IST' | 'UTC' | 'GMT' | 'EST' | 'EDT';

formatTimestamp(isoString, timezone)  // → "27 May 2026, 10:30:45 AM IST"
formatDuration(startIso, endIso)      // → "1m 23s" or "45s"
now()                                 // → new Date().toISOString()
```

Default timezone for all exports is `IST` (Asia/Kolkata). Exports accept `options?: { timezone?: TimezoneId }` to override.

Timestamps in reports:
- `scanStartedAt` — when the analysis pipeline began
- `scanEndedAt` — when LLM analysis finished (scored in `runFullAnalysis.ts`)
- `reportGeneratedAt` — when the final report was assembled (displayed in header/footer)

---

## Rate Limiting

**File:** `src/lib/llm/rateLimiter.ts`

```typescript
export const globalLLMRateLimiter = new LLMRateLimiter(1); // 1 req/sec
```

All LLM calls in batch mode go through `globalLLMRateLimiter.scheduleRequest(async () => { ... })`. Non-LLM work (GitHub/OSV fetches, scoring) is NOT throttled.

`LLMRateLimiter.isRateLimitError(error)` — detects HTTP 429 / rate limit messages.

---

## Batch Analysis — Retry Logic

Constants in `batchStore.ts`:
- `BATCH_SIZE = 5` — concurrent items per wave
- `MAX_RETRIES = 3` — max LLM retries for rate-limit failures
- `RETRY_DELAY_MS = 15_000` — 15-second gap between retry waves

`BatchItem` fields for retry tracking:
```typescript
retryCount?: number;
retryStatus?: 'pendingRetry' | 'retrying' | 'retryFailed';
failureReason?: 'rate_limit' | 'other';
```

When `retryStatus === 'retryFailed'`, exports show "Failed after 3 retries (API rate limit)" instead of the raw error.

---

## Batch Card — New Fields (Phase 12)

The batch HTML summary table now includes two additional columns:

| Column | Source | Display |
|---|---|---|
| **License** | `r.license?.spdxId \|\| r.github?.license?.spdxId` | SPDX ID (e.g., MIT) |
| **Commercial** | `r.commercialModel` + `r.commercialUseClassification` | 🟢 OSS / 🟡 Freemium / 🔴 Paid + ✅/🚫/⚠️ |

Package name cell is colored `text-red` for deprecated, `text-amber` for unmaintained.

---

## Deprecated / Unmaintained Detection

**Deprecated:**
- Set by `registryLookup.ts` when the registry API returns a deprecation flag (npm `deprecated` field, PyPI `yanked`, etc.)
- `isDeprecated = true`, `deprecationMessage` = registry notice text

**Unmaintained:**
- Set during scoring/orchestration when `lastCommitDate` is more than 3 years ago
- `isUnmaintained = true`

Both flags trigger red/amber warning banners at the top of HTML and Markdown exports.

---

## Export Formats — Phase 12 Additions

**HtmlExporter.ts** (`src/lib/export/HtmlExporter.ts`):
- `generateHtml(data, report, tokenUsage, options?)` — now accepts `{ timezone? }`
- `generateBatchHtml(items, options?)` — now accepts `{ timezone? }`

New elements in both single and batch HTML:
- `renderDeprecationWarning(data)` — red/amber banner if `isDeprecated` or `isUnmaintained`
- `renderRepositoryAttribution(data)` — chip showing `resolvedGithubUrl` with `resolvedVia`
- `renderTimestamps(data, tz)` — scan start, duration, report generated
- `renderTechnicalAppendix()` — collapsible `<details>` with popularity labels, license reference, risk/trust methodology, security finding categories, data sources

**ReportExporter.ts** (`src/lib/export/ReportExporter.ts`):
- `generateMarkdown(data, report, tokenUsage, options?)` — now accepts `{ timezone? }`

New sections in single-package Markdown:
- Deprecated/unmaintained blockquote warning at top
- `## Source Repository` section with `resolvedGithubUrl` and `resolvedVia`
- Scan started, scan duration, commercial model/use fields in frontmatter
- `## 📖 Appendix — Technical Reference` at end: popularity labels, license quick reference, risk/trust methodology, data sources

---

## File Upload — Auto-Detection

`detectEcosystemFromFilename(filename)` in `src/lib/parsers/detector.ts`:

When the user uploads a manifest file, the ecosystem is detected from the filename and the ecosystem dropdown is hidden (no user input needed).

| Filename | Detected Ecosystem |
|---|---|
| `package.json` | npm |
| `package-lock.json`, `npm-shrinkwrap.json` | npm |
| `requirements.txt`, `requirements*.txt` | pypi |
| `pubspec.yaml` | pub |
| `pyproject.toml` | pypi |
| `Cargo.toml` | rust |
| `Cargo.lock` | rust |
| `Gemfile.lock` | ruby |
| `go.mod` | go |
| `composer.json` | packagist |

---

## All Manifest Parsers

| File | Format | Ecosystems | Key function |
|---|---|---|---|
| `packageLockJson.ts` | package-lock.json v1/v2/v3, npm-shrinkwrap.json | npm | `packageLockJsonParser` |
| `packageJson.ts` | package.json `dependencies`/`devDependencies` | npm | `packageJsonParser` |
| `requirementsTxt.ts` | requirements.txt | pypi | `requirementsTxtParser` |
| `pubspecYaml.ts` | pubspec.yaml | pub (Dart/Flutter) | `pubspecYamlParser` |
| `pyprojectToml.ts` | pyproject.toml (PEP 621 + Poetry) | pypi | `pyprojectTomlParser` |
| `cargoToml.ts` | Cargo.toml `[dependencies]` | rust | `cargoTomlParser` |
| `gemfileLock.ts` | Gemfile.lock | ruby | `gemfileLockParser` |
| `goMod.ts` | go.mod `require` block | go | `goModParser` |
| `composerJson.ts` | composer.json `require`/`require-dev` | packagist | `composerJsonParser` |
| `detector.ts` | All of the above | — | `detectEcosystemFromFilename()`, `getParserForFile()` |

---

## Commercial Model / Use Classification

Derived from license analysis. Set by `runFullAnalysis.ts` post-LLM:

```typescript
// Reads licenseExplanation.commercialUse from the LLM report
if (commercialUse === 'YES')        → commercialModel = 'open-source', commercialUseClassification = 'allowed'
if (commercialUse === 'NO')         → commercialUseClassification = 'restricted'
if (commercialUse === 'CONDITIONS') → commercialUseClassification = 'needs-permission'
```

`commercialModel` can also be set to `'freemium'` or `'paid'` if the LLM identifies a commercial license tier.

---

## Agent Wiring — LLM Analysis Pipeline

### Decision point

```
sourceChunks.length > 1 ?
    YES → MULTI-PASS (monorepo)
    NO  → SINGLE-PASS
```

### Single-Pass

```
buildAnalysisPrompt(enrichedData) → LLMClient.streamAnalysis() → parseFullJsonResponse() → set({ report })
```

### Multi-Pass (monorepo)

```
For each SourceChunk[i]:
    buildChunkFindingsPrompt() → LLMClient.streamAnalysis() (SILENT) → extractFindingsFromResponse()
deduplicateFindings(allChunkFindings)
buildSynthesisPrompt(dataWithoutSource, mergedFindings) → LLMClient.streamAnalysis() (STREAMS to UI)
parseFullJsonResponse() → finalReport = { ...parsed, securityFindings: mergedFindings }
```

---

## JSON Robustness (3-Tier Extract)

| Tier | Method | Used For |
|---|---|---|
| 1 | `JSON.parse()` after `stripFences()` + `extractFirstJsonObject()` | All passes |
| 2 | `repairJson()` (strip trailing commas) + `JSON.parse()` | All passes |
| 3 | `extractBalancedArray()` → per-object fallback | Chunk findings only |

`extractFirstJsonObject()` uses bracket counting (not greedy regex) to find the first balanced `{ ... }`.

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
Deductions mirror risk factors. Bonuses: >1M downloads (+10), >10k stars (+8), >100 contributors (+5), recent release within 90d (+5), signed releases (+5).

### Popularity Labels

Computed by `computePopularityLabel(stars, weeklyDownloads, ecosystem)` in `src/lib/constants/popularityThresholds.ts`. Stored in `POPULARITY_LABELS` and `POPULARITY_LABEL_DESCRIPTIONS` — also used directly by the Technical Appendix in exports.

Signal: weekly downloads for npm/pypi/uv/pip/pipx; GitHub stars for all others.

| Label | Downloads (npm/PyPI) | Stars (others) |
|---|---|---|
| Niche | < 100/wk | < 100 stars |
| Small community | 100–9,999 | 100–999 |
| Established | 10,000–99,999 | 1,000–9,999 |
| Popular | 100,000–999,999 | 10,000–49,999 |
| Industry Standard | ≥ 1,000,000 | ≥ 50,000 |

---

## Security Findings — 13 Categories

| Category | Trigger |
|---|---|
| `README_CODE_MISMATCH` | README claims contradict source |
| `SILENT_TELEMETRY` | Analytics/crash reporting auto-fires on import |
| `THIRD_PARTY_DATA_EXFILTRATION` | Data sent to unrelated external domains |
| `INSECURE_TRANSMISSION` | HTTP not HTTPS, `rejectUnauthorized:false` |
| `SENSITIVE_OUTBOUND` | Requests include credentials/tokens/PII |
| `BACKGROUND_PROCESS` | setInterval/cron daemons, ServiceWorker, OS service |
| `POSTINSTALL_RISK` | `scripts.postinstall/preinstall/prepare` in package.json |
| `EXCESSIVE_PERMISSIONS` | FS access beyond purpose, raw sockets, sudo elevation |
| `HARDCODED_SECRET` | API keys, tokens, passwords in source |
| `DANGEROUS_API_USAGE` | eval(), Function(), exec(), dynamic require() with user input |
| `PROTOTYPE_POLLUTION` | Unsafe Object.assign or recursive merge without prototype check |
| `OBFUSCATION_INDICATOR` | eval(atob(…)), hex strings, obfuscated code in non-dist files |
| `DEPENDENCY_CVE` | CVEs in direct dependencies |

---

## LLM Providers

| Provider | Notes |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4 |
| Google Gemini | Gemini 2.5 Pro/Flash |
| Groq | Llama 3.3, Mixtral (fast inference) |
| Mistral | Large/Small — **known malformed JSON emitter; handled by 3-tier extractor** |
| Together AI | 100+ open models |
| Ollama | Local models — **requires `OLLAMA_ORIGINS=*`** |
| Zai | — |
| Zhipu (GLM) | GLM-4, GLM-4-Flash — JWT auth via vite.config.ts proxy |

---

## File Structure (flat reference)

```
src/
├── App.tsx
├── main.tsx
├── index.css
├── types/analysis.ts                All domain types (see New Fields section above)
├── store/
│   ├── analysisStore.ts             Pipeline + JSON utilities + AnalysisProgress
│   ├── settingsStore.ts             API keys + provider/model selection
│   └── batchStore.ts                Batch state machine (5 concurrent, 3 retries, 15s gap)
├── lib/
│   ├── ecosystem.ts                 Input → ecosystem detection
│   ├── validation.ts                XSS/input sanitization
│   ├── keyManager.ts                sessionStorage key manager
│   ├── utils/
│   │   └── timestamps.ts            formatTimestamp(), formatDuration(), now(); TimezoneId type
│   ├── constants/
│   │   └── popularityThresholds.ts  POPULARITY_LABELS, DOWNLOAD_THRESHOLDS, STAR_THRESHOLDS,
│   │                                POPULARITY_LABEL_DESCRIPTIONS, computePopularityLabel()
│   ├── llm/
│   │   ├── LLMClient.ts             SSE streaming unified client
│   │   ├── prompts.ts               3 prompts: single-pass / chunk / synthesis
│   │   ├── tokenPricing.ts          Cost table + calculateCost
│   │   ├── rateLimiter.ts           LLMRateLimiter (1 req/sec); globalLLMRateLimiter singleton
│   │   ├── types.ts                 LLMProvider interface
│   │   └── providers/               openai anthropic gemini groq mistral together ollama zai zhipu
│   ├── fetchers/
│   │   ├── orchestrator.ts          analyzePackage() + enrichWithDependencyVulns()
│   │   ├── registryLookup.ts        Official registry → canonical GitHub URL (whitelist enforced)
│   │   │                            canonicalizeGithubUrl(), RegistryLookupResult
│   │   ├── githubSource.ts          Monorepo detection + chunked source fetch
│   │   ├── github.ts                GitHub stats API
│   │   ├── npm.ts                   npm registry + downloads
│   │   ├── unpkg.ts                 CDN source fetch (npm packages)
│   │   ├── osv.ts                   CVE lookup + dep batch scan
│   │   └── types.ts                 SourceChunk, FetchResult
│   ├── scoring/
│   │   ├── riskScore.ts             Risk 0-100 (additive)
│   │   └── trustScore.ts            Trust 0-100 (deductions + bonuses)
│   ├── analysis/
│   │   ├── jsonUtils.ts             Shared JSON parsing utilities (dedup, strip, repair, 3-tier)
│   │   └── runFullAnalysis.ts       Full pipeline: registry lookup → fetch → score → LLM
│   │                                Sets scanStartedAt, scanEndedAt, reportGeneratedAt
│   │                                Sets commercialModel/commercialUseClassification post-LLM
│   ├── export/
│   │   ├── ReportExporter.ts        Markdown export (single package + appendix + attribution)
│   │   ├── HtmlExporter.ts          HTML export (single + batch); dark-themed self-contained CSS
│   │   │                            New: renderDeprecationWarning, renderRepositoryAttribution,
│   │   │                            renderTimestamps, renderTechnicalAppendix
│   │   ├── PdfDocument.tsx          react-pdf layout (kept but not in export dropdown)
│   │   └── pdfExport.ts             pdf().toBlob() → download (kept but not surfaced in UI)
│   └── parsers/
│       ├── detector.ts              detectEcosystemFromFilename(), getParserForFile()
│       ├── packageLockJson.ts       package-lock.json / npm-shrinkwrap.json (v1/v2/v3)
│       ├── packageJson.ts           package.json batch parser
│       ├── requirementsTxt.ts       requirements.txt
│       ├── pubspecYaml.ts           pubspec.yaml (Dart/Flutter → pub)
│       ├── pyprojectToml.ts         pyproject.toml (PEP 621 + Poetry → pypi)
│       ├── cargoToml.ts             Cargo.toml (Rust → rust)
│       ├── gemfileLock.ts           Gemfile.lock (Ruby → ruby)
│       ├── goMod.ts                 go.mod (Go → go)
│       └── composerJson.ts          composer.json (PHP → packagist)
└── components/
    ├── layout/
    │   ├── Header.tsx
    │   └── LandingPage.tsx          Home + search + batch upload + Pricing section
    ├── input/SearchBar.tsx          Search input (hides ecosystem dropdown on file upload)
    ├── report/
    │   ├── ReportContainer.tsx      Layout + export dropdown (Markdown + HTML) + panel gating
    │   ├── AnalysisProgressBar.tsx  Determinate % bar (multi-pass) or shimmer (single-pass)
    │   ├── ExecutiveSummaryPanel.tsx
    │   ├── SecurityFindingsPanel.tsx  Cards + severity filter + clean state
    │   ├── CodeReviewPanel.tsx
    │   ├── ThreatModel.tsx          STRIDE 6-dimension panel
    │   ├── LicensePanel.tsx         Can/cannot/must matrix
    │   ├── VulnerabilityTable.tsx   CVE table
    │   ├── AlternativesPanel.tsx
    │   ├── RemediationPanel.tsx
    │   ├── RepoMetadataPanel.tsx    GitHub stats + package stats
    │   ├── TokenUsagePanel.tsx      Token count + USD cost
    │   ├── ScoreGauge.tsx           SVG gauge — risk always red
    │   └── RiskBadge.tsx
    └── batch/
        ├── DependencySelector.tsx   Manifest upload + selection
        └── BatchProgress.tsx        Overview grid + click-to-drill per-item full report view
```

---

## Security Hardening

| Concern | Implementation |
|---|---|
| API key storage | `sessionStorage` only — `lib/keyManager.ts`; cleared on tab close |
| Key transmission | Direct browser → provider API; no server proxy |
| GitHub token | Same sessionStorage treatment; only sent to `api.github.com` |
| Registry URLs | Only whitelist URLs in `registryLookup.ts` (`REGISTRY_BASES`) |
| XSS prevention | `lib/validation.ts` + React escaping + `esc()` in HTML exports |
| CSP headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` in `vite.config.ts` |
| Static analysis | `eslint-plugin-security` on every build |
| No telemetry | Zero analytics in TrustGuard itself |

---

## Known Limitations

1. **LLM JSON quality is provider-dependent.** Mistral and similar providers emit malformed JSON. The 3-tier extractor handles most cases, but fundamentally truncated responses fall back to 0 findings silently.

2. **Source code not fetched for PyPI / Go / Maven / NuGet.** Only npm (via unpkg) and GitHub repos get source code. For other ecosystems, CodeReviewPanel and SecurityFindingsPanel are hidden.

3. **Monorepo chunk limit is MAX_CHUNKS=5.** Large monorepos with 20+ workspaces only scan top 4 scored dirs + root.

4. **GitHub API rate limit without token.** 60 requests/hour unauthenticated. Batch scans exhaust this quickly.

5. **Batch mode — full AI analysis requires API key.** Without a key, batch items are metadata-only (OSV CVEs + scores, no LLM executive summary/STRIDE/findings/alternatives).

6. **PDF emoji rendering.** `@react-pdf/renderer` with Helvetica cannot render emoji — headings are emoji-free; LLM narrative text with emoji may render as blank boxes.

7. **No persistent history.** Pure SPA — no backend, no history after tab close.

8. **Ollama CORS.** Requires `OLLAMA_ORIGINS=*` env var. Without it, all Ollama requests fail silently.

---

## Phase History (condensed)

| Phase | Key work |
|---|---|
| 1–5 | Core app: data fetchers, scoring, 9 LLM providers, risk/trust gauges, CVE table, export |
| 6 | Token usage tracking across all providers |
| 7 | Secure Code Review Agent: 13 categories, SecurityFindingsPanel, dependency CVE scanner |
| 8 | Monorepo chunked analysis, workflow scoring, workspace scoring, AnalysisProgressBar, synthesis prompt hardening, export parity (Markdown + PDF), risk gauge always red |
| 9 | 3-tier JSON robustness (greedy regex → bracket counting, repairJson, per-object fallback), SecurityFindingsPanel never returns null, ReportContainer panel gate widened |
| 10 | pubspec.yaml parser (Dart/Flutter → `pub`), pyproject.toml parser (PEP 621 + Poetry → pypi), `pub` added to Ecosystem type + OSV mapper + validation prefixes. vite.config `define: { global: 'globalThis' }` fix for @iarna/toml browser crash |
| 11 | Full-pipeline batch (`runFullAnalysis.ts`, `jsonUtils.ts`); package-lock.json parser (v1/v2/v3); HTML export (`HtmlExporter.ts`); export dropdown simplified (Markdown + HTML only); BatchProgress rewritten (overview grid → click-to-drill); Pricing section on LandingPage |
| 12 | **Export additions**: `renderDeprecationWarning`, `renderRepositoryAttribution`, `renderTimestamps`, `renderTechnicalAppendix` in HtmlExporter; Technical Appendix + attribution + timestamps + commercial fields in ReportExporter (Markdown); batch HTML/Markdown summary tables add License + Commercial columns; retry failure messaging; `TimezoneId` timezone support; new parsers: `cargoToml`, `gemfileLock`, `goMod`, `composerJson`; `detectEcosystemFromFilename` in detector.ts; `registryLookup.ts` (anti-hallucination registry whitelist); `rateLimiter.ts` (1 req/sec global); popularity thresholds constants extracted to `popularityThresholds.ts`; new `PackageAnalysisData` fields: `resolvedGithubUrl`, `resolvedVia`, `scanStartedAt`, `scanEndedAt`, `reportGeneratedAt`, `isDeprecated`, `isUnmaintained`, `deprecationMessage`, `commercialModel`, `commercialUseClassification` |
| 12-fix | **Bug fixes**: [1] `validation.ts` — TOML (`fastapi = "^0.111.0"`), pip (`fastapi>=0.111.0`), space-sep (`fastapi 0.130.0`) version parsing added before @-sep logic, strips version operators `^~>=<=!=`; [2] `resolvedRegistryUrl` field added to `PackageAnalysisData`, `RegistryLookupResult`, all 9 per-ecosystem lookup functions, `orchestrator.ts`, shown in app header + all export formats; [3] `fetchGitHubRepoSourceChunks(url, version?)` — new `resolveVersionRef()` helper tries `v{version}` then `{version}` tags; `?ref=` appended to all GitHub Contents API calls including workspace dir and src/ fetches; [4] `BatchProgress.tsx` — overflow-hidden cards, `min-w-0` flex fix, N/A for zero scores, "None" shown (green) in Findings row when AI report present; [5] `PdfDocument.tsx` updated with deprecated/unmaintained warning, repository attribution (resolvedGithubUrl+resolvedVia+resolvedRegistryUrl), scan timestamps, commercial classification, license SPDX, Technical Appendix page; `pdfExport.ts` reads timezone from settingsStore; PDF export button restored to `ReportContainer.tsx` export dropdown |
