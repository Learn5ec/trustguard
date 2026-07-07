# Audit-all summary — audit-all-2026-07-07-171104

Run: 2026-07-07T17:11:04Z
Audits run: architecture, schema, api, security, ops (5 of 5)
Audits failed: none

Note: graphify was unavailable for this run (`docs/.cadence/.graphify-unavailable` marker present); all audits used grep/read fallback via the `kb` skill.

## Cross-referenced findings (flagged by 2+ audits — highest confidence)

| Finding | Flagged by | Severity | Citation |
|---|---|---|---|
| Dev-server `/api/models` proxy is unauthenticated, has wildcard `Access-Control-Allow-Origin: '*'`, is exposed off-LAN via ngrok `allowedHosts`, and its `ollama` branch performs an unconditional SSRF-shaped fetch to hardcoded `http://localhost:11434/api/tags` reachable from any origin | architecture, api, security | P1 | `vite.config.ts:63,88-91,105,117-189` |
| Debug `console.log` leftovers ship to production: full raw PyPI API response body dumped on every lookup, plus batch-retry internals logged on every run | architecture, api, ops | P0 (per ops) | `src/lib/fetchers/registryLookup.ts:244`, `src/store/batchStore.ts:98,187` |
| Client-side API-key handling is insecure across multiple independent surfaces — no backend exists to hold secrets, so keys leak via three different mechanisms | architecture, api, security | P2 | sessionStorage: `src/lib/keyManager.ts:4-9`; URL query string: `src/lib/llm/providers/gemini.ts`, `src/lib/llm/LLMClient.ts:41-42`; bundle-inlining risk: `.env.example:1-13` |

## All findings (severity-ranked, deduplicated)

| # | Finding | Source audit(s) | Severity | Citation |
|---|---|---|---|---|
| 1 | `server.js` request-handler catch-block never logs errors server-side — pm2 shows nothing on failure | ops | P0 | `development-updates-and-notes/DEPLOYMENT.md:284-297` |
| 2 | Debug `console.log` leaks full PyPI response + batch-retry internals into production logs | architecture, api, ops | P0 | `src/lib/fetchers/registryLookup.ts:244`, `src/store/batchStore.ts:98,187` |
| 3 | Unauthenticated `/api/models` proxy: wildcard CORS + public ngrok exposure + SSRF-shaped `ollama` branch to `localhost:11434` | architecture, api, security | P1 | `vite.config.ts:63,88-91,105,117-189` |
| 4 | Two independently-maintained copies of the fetch→score→LLM pipeline have diverged (batch is rate-limited, single-package is not) | architecture | P1 | `src/store/analysisStore.ts:357`, `src/lib/analysis/runFullAnalysis.ts:222` |
| 5 | Dev `/api/models` middleware lacks origin allowlist / payload cap / provider-type check that the documented production replacement has (doc-drift) | api | P1 | `vite.config.ts:118-160` vs `development-updates-and-notes/DEPLOYMENT.md:255-300` |
| 6 | Zero telemetry anywhere: no metrics, no traces, no client error tracker, no correlation IDs across a 5-10-API-call pipeline | ops | P1 | repo-wide |
| 7 | GitHub/registry 401/403/429 responses swallowed identically to any other failure, silently degrading `dataCompleteness`/risk scores | ops | P1 | `src/lib/fetchers/github.ts:31`, `osv.ts:45-47`, `orchestrator.ts:328-330` |
| 8 | No ErrorBoundary, no `window.onerror`/`unhandledrejection` handler anywhere in the SPA | ops | P1 | repo-wide |
| 9 | LLM API keys stored in `sessionStorage`, reachable by any XSS on the page | architecture, security | P2 | `src/lib/keyManager.ts:4-9` |
| 10 | Untrusted, attacker-publishable package README/source concatenated verbatim into the LLM analysis prompt — prompt-injection path against the product's own trust verdict | security | P2 | `src/lib/fetchers/githubSource.ts:217`, `src/lib/llm/prompts.ts` |
| 11 | Gemini provider sends API key in URL query string while 8 other providers use Authorization/x-api-key headers | api | P2 | `src/lib/llm/providers/gemini.ts`, `src/lib/llm/LLMClient.ts:41-42` |
| 12 | `.env.example` documents `VITE_`-prefixed default-token vars that Vite would inline into the public client bundle if ever populated | security | P2 | `.env.example:1-13` |
| 13 | `.gitignore` does not exclude `.env`, risking accidental secret commit | security | P2 | `.gitignore:1-19` |
| 14 | No CSP / security headers reach the production build (only dev-server headers exist) | security | P2 | `index.html:1-14`, `vite.config.ts:185-188` |
| 15 | Client-side-only CVE applicability logic (`isAlreadyFixed`) can silently suppress real findings with no server-side check | architecture | P2 | `src/lib/fetchers/orchestrator.ts:204-220` |
| 16 | GitHub source-fetch truncates/omits files (8-file cap, 32k char cap) with no completeness signal surfaced to the UI | architecture | P2 | `src/lib/fetchers/githubSource.ts:113-180` |
| 17 | Inconsistent error-handling contract across outbound fetchers: `registryLookup.ts` throws, `npm.ts`/`github.ts`/`osv.ts`/`unpkg.ts`/`pypiStats.ts` swallow and return `null`/`[]` | api | P2 | `registryLookup.ts:178-179` vs `npm.ts:22`, `github.ts:31` |
| 18 | Sequential (non-parallel) batch retry loop scales retry time linearly with rate-limited item count | ops | P2 | `src/store/batchStore.ts:172-225` |
| 19 | Up to ~25+ concurrent unauthenticated-rate-limit-exposed GitHub calls per 5-package micro-batch, no shared throttle | ops | P2 | `src/lib/fetchers/github.ts:23-29`, `sourceResolver.ts:230-251` |
| 20 | Dead dependency `react-router-dom` declared but never used; app has no real router, just if/else on Zustand state | architecture | P3 | `package.json:20`, `src/App.tsx:16-72` |
| 21 | `nvdKey` setting stored in `settingsStore` but never consumed by any fetcher — dead config field | api | P3 | `src/store/settingsStore.ts:20,43,58` |
| — | No database/ORM/migration surface exists — pure client-side React/Vite/Zustand SPA, all state in-memory (schema audit N/A by design) | schema | — | `src/store/*.ts`, `src/types/analysis.ts` |

*(This table reflects the TOP_FINDINGS each audit returned, not their full finding lists — architecture reported 7 total, api 11, security 10, ops 27 (incl. inventory/silent-failure/bottleneck sub-items), schema 0. See each report for the complete list.)*

## Per-audit reports

- 🏛️ [architecture](../docs/.cadence/audit-architecture/report.md) — 7 findings (P1:2 P2:3 P3:2), COMPLETE
- 🗄️ [schema](../docs/.cadence/audit-schema/report.md) — 0 findings (no schema surface — SPA, no DB), COMPLETE
- 🔌 [api](../docs/.cadence/audit-api/report.md) — 11 findings (P1:3 P2:5 P3:3), COMPLETE
- 🛡️ [security](../docs/.cadence/audit-security/report.md) — 10 findings (P1:1 P2:6 P3:3), COMPLETE
- 📊 [ops](../docs/.cadence/audit-ops/report.md) — 27 findings (P0:2 P1:4 P2:5, plus 9 inventory gaps / 11 silent-failure sites / 9 bottleneck candidates), COMPLETE

## Failures (if any)

- none
