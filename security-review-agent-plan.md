# Security Code Review Agent — Enhancement Plan

**Date:** 2026-05-26  
**Status:** Pending review  
**Goal:** Transform the current single-paragraph `codeReview` field into a structured, deep, multi-category security investigation that surfaces real findings from actual code — not README claims.

---

## 1. What changes and why

### Current state (problems)
- The LLM produces a single freetext `codeReview` string — unstructured, easy to miss findings in
- Source code fetching only targets entry points — misses the highest-risk files (postinstall scripts, CI/CD configs, network clients)
- No dependency-level CVE scan — we only query OSV for the *top-level* package, not what it pulls in
- No distinction between severity levels in code findings
- No explicit check for README-vs-code mismatches, background processes, silent telemetry, etc.

### What we're building
A **structured `securityFindings[]` array** in the LLM output — each finding has a category, severity, title, evidence (specific code line/file reference), and recommendation. This renders as a scannable card grid in the UI. The narrative `codeReview` is kept for the overall story.

---

## 2. New finding categories (13 total)

| Category constant | What the agent looks for |
|---|---|
| `README_CODE_MISMATCH` | Claims made in README that are contradicted or unsupported by actual source code (e.g., "zero telemetry" but code calls an external endpoint) |
| `SILENT_TELEMETRY` | Analytics, crash reporting, or usage tracking calls that aren't prominently disclosed — especially any that fire automatically on import/install |
| `THIRD_PARTY_DATA_EXFILTRATION` | Data (user input, file contents, env vars, device info) sent to external domains/IPs that are NOT the package's stated purpose |
| `INSECURE_TRANSMISSION` | HTTP (not HTTPS) connections, disabled TLS validation, `rejectUnauthorized: false`, `verify=False`, certificate pinning bypasses |
| `SENSITIVE_OUTBOUND` | Outbound requests that include credentials, tokens, PII, or system metadata in URL params, headers, or body |
| `BACKGROUND_PROCESS` | `setInterval`, `cron`, `setTimeout` with recurring invocations, `spawn`/`fork` of daemons, `ServiceWorker` registration, OS-level service installation |
| `POSTINSTALL_RISK` | `scripts.postinstall`, `scripts.prepare`, `scripts.install` in package.json that execute arbitrary code at install time — high malware vector |
| `EXCESSIVE_PERMISSIONS` | Requesting filesystem access (beyond package purpose), raw network sockets, OS-level APIs, `sudo`/`admin` elevation, `--allow-all` flags |
| `HARDCODED_SECRET` | API keys, tokens, passwords, private keys, connection strings embedded directly in source code |
| `DANGEROUS_API_USAGE` | `eval()`, `Function()`, `exec()`, `child_process.exec`, `os.system()`, `subprocess.call()`, `__import__`, dynamic `require()` with user input |
| `PROTOTYPE_POLLUTION` | Unsafe `Object.assign(target, userInput)`, `merge(obj, input)`, `__proto__` manipulation, recursive merge without prototype check |
| `OBFUSCATION_INDICATOR` | `eval(atob(...))`, hex-encoded strings, heavily minified code in source (not dist), `unescape(...)`, unusually encoded payloads — malware red flag |
| `DEPENDENCY_CVE` | Known CVEs in packages listed in the scanned package's own `dependencies`/`devDependencies`/`requirements.txt`/`go.mod` |

---

## 3. Source code fetching improvements

### 3.1 New file priority list (`githubSource.ts` + `unpkg.ts`)

Expand from 5 → up to **8 files**, adding highest-risk file types:

| Priority | File type | Why |
|---|---|---|
| 1 | README.md | Capture claims to compare against code |
| 2 | package.json / setup.py / go.mod / Cargo.toml | Manifest: postinstall scripts, dependencies, scripts |
| **3 (NEW)** | `.github/workflows/*.yml` OR `Dockerfile` OR `docker-compose.yml` | CI/CD pipelines exfiltrating secrets, privilege escalation in containers |
| 4 | Main entry point | Core behavior |
| **5 (NEW)** | Any file named `*telemetry*`, `*analytics*`, `*track*`, `*beacon*`, `*collect*` | Direct telemetry/tracking code |
| 6 | Security-sensitive file (auth/crypto/token/secret) | Credential handling |
| **7 (NEW)** | Any file named `*install*`, `*setup*`, `*postinstall*`, `*hook*` | Install-time code execution |
| 8 | Common entry fallback | Catch-all |

### 3.2 Fetch `.github/workflows/` directory listing
- After fetching root contents, also fetch `https://api.github.com/repos/{owner}/{repo}/contents/.github/workflows`
- Take the first `.yml` file found and include it
- Workflow files can exfiltrate secrets via `curl $GITHUB_TOKEN` or misconfigured `env:` blocks

### 3.3 Parse `package.json` for `scripts` block explicitly
- When fetching npm packages, extract and **prominently label** the `scripts` section
- Flag any `postinstall`, `preinstall`, `prepare`, `install` keys as `POSTINSTALL_RISK` candidates for the LLM

---

## 4. Dependency CVE scan (new: `fetchDependencyCVEs`)

### What
- Parse `package.json` (or `requirements.txt`, `go.mod`) from the fetched source code
- Extract listed dependencies (capped at 25 to avoid rate limiting)
- Run OSV batch queries for each dependency
- Return as `dependencyVulnerabilities: DependencyVuln[]` added to the data sent to LLM

### Type
```typescript
export interface DependencyVuln {
  dependencyName: string;
  dependencyVersion: string; // "*" if not pinned
  vulnerabilityCount: number;
  highestSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  topCVEs: string[]; // up to 3 CVE/GHSA IDs
}
```

### Flow
```
fetchGitHubRepoSourceCode() or fetchPackageSourceCode()
  → parse manifest from fetched files
  → scanDependencies(manifestDeps[])  ← new function in osv.ts
  → return DependencyVuln[]
```

The LLM then has this data and can generate `DEPENDENCY_CVE` findings for the top offenders.

---

## 5. New LLM output fields

### Add `securityFindings` array to the JSON response

```typescript
export interface SecurityFinding {
  category: 
    | 'README_CODE_MISMATCH'
    | 'SILENT_TELEMETRY'
    | 'THIRD_PARTY_DATA_EXFILTRATION'
    | 'INSECURE_TRANSMISSION'
    | 'SENSITIVE_OUTBOUND'
    | 'BACKGROUND_PROCESS'
    | 'POSTINSTALL_RISK'
    | 'EXCESSIVE_PERMISSIONS'
    | 'HARDCODED_SECRET'
    | 'DANGEROUS_API_USAGE'
    | 'PROTOTYPE_POLLUTION'
    | 'OBFUSCATION_INDICATOR'
    | 'DEPENDENCY_CVE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;           // Short headline (max ~10 words)
  description: string;     // What was found and why it matters
  evidence: string;        // Specific file path + line reference or code snippet
  recommendation: string;  // Concrete action developer should take
  confirmed: boolean;      // true = directly observed in code, false = inferred/suspected
}
```

### Updated JSON schema in prompt (additive — keeps existing fields)
Add `"securityFindings"` array between `codeReview` and `communityAssessment`.

---

## 6. New UI: `SecurityFindingsPanel` component

Replace the current plain `CodeReviewPanel` with two parts:

### Part A: Narrative review (kept, rendered as markdown)
Same as today — the LLM's `codeReview` field summarising what the code actually does.

### Part B: `SecurityFindingsPanel` — structured finding cards

**Layout:**
- Summary header bar: "X findings — N critical, N high, N medium" with color-coded counts
- Filter tabs: ALL | CRITICAL | HIGH | MEDIUM | INFO
- Cards grid (2 columns on desktop, 1 on mobile)

**Each card shows:**
- Severity badge (color: CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=blue, INFO=zinc)
- Category tag (e.g. "SILENT TELEMETRY", "POSTINSTALL RISK")
- Title (bold)
- Description (2-3 lines)
- Evidence block: monospace grey box with the code reference
- Recommendation (indented italic)
- "Confirmed" vs "Suspected" indicator

---

## 7. Updated `CodeReviewPanel` → split into two panels

The current `CodeReviewPanel` becomes the narrative section. `SecurityFindingsPanel` is a **separate panel placed directly below it** in `ReportContainer`.

---

## 8. Export updates

### Markdown export
Add a "## 🔍 Security Findings" section after the code review, with a severity-sorted table:

```markdown
| Severity | Category | Title | Confirmed |
|---|---|---|---|
| CRITICAL | POSTINSTALL_RISK | postinstall script downloads and executes remote binary | ✓ |
| HIGH | INSECURE_TRANSMISSION | HTTP endpoint used for API calls | ✓ |
```

Followed by full details for each finding.

### JSON export  
`securityFindings[]` is already part of the report object, included automatically.

---

## 9. Files to change

| File | Change |
|---|---|
| `src/types/analysis.ts` | Add `SecurityFinding` interface and `DependencyVuln` interface; add `securityFindings?: SecurityFinding[]` and `dependencyVulnerabilities?: DependencyVuln[]` to `AnalysisReport` and `PackageAnalysisData` |
| `src/lib/fetchers/githubSource.ts` | Add CI/CD workflow fetch, telemetry/tracking file detection, postinstall/hook file detection; expand to 8 files |
| `src/lib/fetchers/unpkg.ts` | Fetch `scripts` block from package.json explicitly; include postinstall risk |
| `src/lib/fetchers/osv.ts` | Add `scanDependencies(deps: {name: string, version: string, ecosystem: string}[])` function |
| `src/lib/fetchers/orchestrator.ts` | After source fetch, parse manifest and call `scanDependencies`; add result to enriched data |
| `src/lib/llm/prompts.ts` | Expand `buildAnalysisPrompt` system prompt with all 13 finding categories and structured output schema; add `securityFindings[]` to JSON response |
| `src/components/report/CodeReviewPanel.tsx` | Rename to also show a "narrative review" section only |
| `src/components/report/SecurityFindingsPanel.tsx` | **New component** — structured findings card grid |
| `src/components/report/ReportContainer.tsx` | Add `SecurityFindingsPanel` below `CodeReviewPanel` |
| `src/lib/export/ReportExporter.ts` | Add security findings table to markdown export |
| `current-implementation.md` | Append session changes |
| `future-improvements.md` | Append/update items |

---

## 10. What we deliberately do NOT do (scope limits)

- **No runtime sandbox execution** — we don't run the code; all analysis is static
- **No full transitive dep graph** — we scan direct deps (from manifest), not the full dep tree (would require deps.dev or similar)
- **No binary/compiled artifact analysis** — only source files
- **The LLM findings are AI-generated** — every finding is labelled `confirmed: true/false` to help users distinguish direct code observations from inferences

---

## 11. Implementation order

1. Add types (`SecurityFinding`, `DependencyVuln`) to `analysis.ts`
2. Expand `githubSource.ts` and `unpkg.ts` file fetching
3. Add `scanDependencies()` to `osv.ts`
4. Update `orchestrator.ts` to call dep scan
5. Expand LLM prompt with new categories + updated JSON schema
6. Create `SecurityFindingsPanel.tsx`
7. Update `CodeReviewPanel.tsx` (narrative-only)
8. Wire both panels into `ReportContainer.tsx`
9. Update `ReportExporter.ts` for markdown
10. Update `current-implementation.md` + `future-improvements.md`

---

*Ready to implement once reviewed.*
