# TrustGuard AI ? Dependency Security & Threat Analysis Tool
## Complete Build Specification for Claude Code

> **Purpose of this document:** Hand this file directly to Claude Code. It contains the full product vision, architecture, data sources, processing pipeline, security requirements, LLM provider integrations, UI/UX spec, export system, file ingestion spec, and every implementation detail needed to build TrustGuard AI from scratch.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [LLM Provider Integration](#4-llm-provider-integration)
5. [Data Sources & APIs](#5-data-sources--apis)
6. [File Ingestion System](#6-file-ingestion-system)
7. [Analysis Pipeline](#7-analysis-pipeline)
8. [Report Structure](#8-report-structure)
9. [Export System](#9-export-system)
10. [UI/UX Specification](#10-uiux-specification)
11. [Security & DevSecOps Requirements](#11-security--devsecops-requirements)
12. [Environment & Configuration](#12-environment--configuration)
13. [Project File Structure](#13-project-file-structure)
14. [Implementation Phases](#14-implementation-phases)
15. [Testing Requirements](#15-testing-requirements)

---

## 1. Project Overview

### What is TrustGuard AI?

TrustGuard AI is a **stateless, client-rendered web application** that allows developers to analyse any npm package, PyPI package, GitHub repository, or a dependency manifest file (e.g. `package-lock.json`, `requirements.txt`) and receive a comprehensive security and risk report ? covering threat modelling, vulnerability data, maintenance health, licensing, and recommended alternatives.

### Core Principles

- **Stateless:** No backend database, no user accounts, no stored data. Every analysis session is ephemeral.
- **Fast:** Results should begin streaming within 3?5 seconds of submission. Use parallel API calls wherever possible.
- **Developer-first:** The report must contain everything a developer needs to make an informed "use / avoid / replace" decision.
- **Secure by design:** The tool itself must follow all DevSecOps best practices; it must not introduce vulnerabilities while scanning for them.
- **Multi-LLM:** Users can bring their own API key for any supported LLM provider. Keys are stored only in `sessionStorage` and never sent to any server other than the chosen LLM provider.

### What a User Can Scan

| Input Type | Examples |
|---|---|
| npm package | `lodash`, `express@4.18.2`, `@babel/core` |
| PyPI package | `requests`, `django==4.2`, `numpy` |
| GitHub repo / tool | `https://github.com/org/repo` |
| Ruby gem | `rails`, `devise` |
| Go module | `github.com/gin-gonic/gin` |
| Rust crate | `serde`, `tokio` |
| Maven artifact | `com.google.guava:guava` |
| Dependency file | `package.json`, `package-lock.json`, `requirements.txt`, `Pipfile.lock`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `go.sum`, `Cargo.lock`, `pom.xml`, `build.gradle`, `composer.lock`, `pyproject.toml` |

---

## 2. Tech Stack

### Frontend (Primary Application)

```
Framework:        React 18 + TypeScript
Build Tool:       Vite 5
Styling:          Tailwind CSS v3 (JIT)
State:            Zustand (lightweight, no Redux complexity)
Routing:          React Router v6 (single page, minimal routes)
HTTP Client:      Native fetch() with AbortController ? no axios (reduces supply chain risk)
Markdown Render:  react-markdown + remark-gfm + rehype-highlight
PDF Export:       @react-pdf/renderer (client-side, no server)
HTML Export:      Native DOM serialisation
Syntax Highlight: highlight.js (loaded on demand)
Icons:            lucide-react
Linting:          ESLint + eslint-plugin-security
Formatting:       Prettier
Type Check:       TypeScript strict mode
```

### No Backend Required

All API calls are made **directly from the browser** to:
- Public REST APIs (OSV, NIST NVD, GitHub, NPM Registry, PyPI, etc.)
- The user's chosen LLM provider

There is no Node.js/Express/FastAPI server to maintain, deploy, or secure.

### Hosting

Deploy as a **static site** to any CDN:
- Vercel (preferred, zero-config)
- Netlify
- GitHub Pages
- Cloudflare Pages

---

## 3. Architecture

```
???????????????????????????????????????????????????????????????????
?                        Browser (Client)                          ?
?                                                                   ?
?  ???????????????    ????????????????????    ??????????????????  ?
?  ?  Input UI   ??????  Analysis Engine ??????  Report View   ?  ?
?  ?             ?    ?  (orchestrator)  ?    ?                ?  ?
?  ? - text box  ?    ?                  ?    ? - Threat Model ?  ?
?  ? - file drop ?    ?  ??????????????  ?    ? - Vulns        ?  ?
?  ? - LLM setup ?    ?  ? Data Layer ?  ?    ? - License      ?  ?
?  ???????????????    ?  ? (parallel  ?  ?    ? - Maintenance  ?  ?
?                     ?  ?  fetchers) ?  ?    ? - Alternatives ?  ?
?                     ?  ??????????????  ?    ? - Score        ?  ?
?                     ?  ??????????????  ?    ??????????????????  ?
?                     ?  ? LLM Layer  ?  ?            ?            ?
?                     ?  ? (analysis  ?  ?    ??????????????????  ?
?                     ?  ? + synthesis?  ?    ? Export Engine  ?  ?
?                     ?  ??????????????  ?    ? MD/HTML/PDF/   ?  ?
?                     ????????????????????    ? JSON           ?  ?
?                                             ??????????????????  ?
???????????????????????????????????????????????????????????????????
         ?                    ?                    ?
         ?                    ?                    ?
   Public APIs           LLM APIs           (no backend)
   - OSV.dev             - OpenAI
   - NIST NVD            - Anthropic Claude
   - GitHub REST         - Mistral
   - NPM Registry        - GLM (Zhipu AI)
   - PyPI JSON           - z.ai
   - Snyk Advisor        - Groq
   - deps.dev            - Together AI
   - OpenSSF Scorecard   - Local Ollama
```

### State Flow

```
IDLE ? INPUT_RECEIVED ? RESOLVING_PACKAGE ? FETCHING_DATA (parallel) 
     ? LLM_ANALYZING ? STREAMING_RESULTS ? COMPLETE ? EXPORT_READY
```

All state lives in Zustand. No localStorage, no server sessions.

---

## 4. LLM Provider Integration

### Why LLM?

Raw API data (CVEs, metadata, scores) needs to be synthesised into:
- A coherent **threat narrative** a developer can understand
- **Risk severity judgements** with reasoning
- **Plain-English license explanations**
- **Contextualised alternatives** (not just a list, but why each one fits)
- A **threat model** in structured format

### Provider Abstraction Layer

Create a single `LLMProvider` interface so any provider can be swapped:

```typescript
// src/lib/llm/types.ts
interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: LLMModel[];
  supportsStreaming: boolean;
  buildHeaders: (apiKey: string) => Record<string, string>;
  buildBody: (messages: ChatMessage[], model: string, stream: boolean) => object;
  parseStreamChunk: (chunk: string) => string | null;
  parseFullResponse: (data: unknown) => string;
}
```

### Supported Providers

Implement ALL of the following providers in `src/lib/llm/providers/`:

#### 4.1 OpenAI
```typescript
{
  id: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  supportsStreaming: true,
  // Standard OpenAI chat completions format
}
```

#### 4.2 Anthropic Claude
```typescript
{
  id: 'anthropic',
  name: 'Anthropic Claude',
  baseUrl: 'https://api.anthropic.com/v1/messages',
  models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  supportsStreaming: true,
  // Requires: 'x-api-key' header, 'anthropic-version: 2023-06-01'
  // Uses messages[] format with max_tokens required
}
```

#### 4.3 Mistral AI
```typescript
{
  id: 'mistral',
  name: 'Mistral AI',
  baseUrl: 'https://api.mistral.ai/v1/chat/completions',
  models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mixtral-8x22b', 'codestral-latest'],
  supportsStreaming: true,
  // OpenAI-compatible format with Bearer token
}
```

#### 4.4 GLM / Zhipu AI
```typescript
{
  id: 'zhipu',
  name: 'GLM (Zhipu AI)',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  models: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
  supportsStreaming: true,
  // OpenAI-compatible format
  // API key format: {id}.{secret} ? requires JWT generation
  // Implement JWT builder: header.payload.signature with HS256
}
```

GLM JWT generation:
```typescript
function buildZhipuJWT(apiKey: string): string {
  const [id, secret] = apiKey.split('.');
  const now = Date.now();
  const header = btoa(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }));
  const payload = btoa(JSON.stringify({ api_key: id, exp: now + 3600000, timestamp: now }));
  // Sign with HMAC-SHA256 using secret
  // Use SubtleCrypto (Web Crypto API) ? no external jwt library needed
}
```

#### 4.5 z.ai
```typescript
{
  id: 'zai',
  name: 'z.ai',
  baseUrl: 'https://api.z.ai/v1/chat/completions',
  models: ['z1', 'z1-mini'],  // Update model list from z.ai docs
  supportsStreaming: true,
  // OpenAI-compatible format
}
```

#### 4.6 Groq
```typescript
{
  id: 'groq',
  name: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  supportsStreaming: true,
  // OpenAI-compatible, extremely fast inference
}
```

#### 4.7 Together AI
```typescript
{
  id: 'together',
  name: 'Together AI',
  baseUrl: 'https://api.together.xyz/v1/chat/completions',
  models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'Qwen/Qwen2-72B-Instruct'],
  supportsStreaming: true,
}
```

#### 4.8 Google Gemini
```typescript
{
  id: 'gemini',
  name: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
  supportsStreaming: true,
  // Different URL structure: /models/{model}:streamGenerateContent?key={apiKey}
  // Different body format: { contents: [{ parts: [{ text }] }] }
}
```

#### 4.9 Ollama (Local)
```typescript
{
  id: 'ollama',
  name: 'Ollama (Local)',
  baseUrl: 'http://localhost:11434/api/chat',
  models: [], // Dynamically fetched from /api/tags
  supportsStreaming: true,
  // No API key required
  // OpenAI-compatible via /v1/chat/completions also available
}
```

### LLM Key Storage

```typescript
// NEVER localStorage ? use sessionStorage only
// Keys are NEVER sent anywhere except the provider's own API endpoint
// Keys are NEVER logged, NEVER included in error reports

class LLMKeyManager {
  private static PREFIX = 'trustguard_key_';
  
  static save(providerId: string, key: string): void {
    sessionStorage.setItem(this.PREFIX + providerId, key);
  }
  
  static get(providerId: string): string | null {
    return sessionStorage.getItem(this.PREFIX + providerId);
  }
  
  static clear(providerId: string): void {
    sessionStorage.removeItem(this.PREFIX + providerId);
  }
  
  static clearAll(): void {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(this.PREFIX))
      .forEach(k => sessionStorage.removeItem(k));
  }
}
```

### LLM Usage Strategy

**Do NOT use LLM for data retrieval.** LLM is used ONLY for:

1. **Threat modelling synthesis** ? given structured vulnerability and metadata JSON, produce a STRIDE-based threat model narrative
2. **License plain-English explanation** ? given SPDX license ID + text, explain in 3?5 bullet points what a developer can/cannot do
3. **Alternative recommendations** ? given package purpose + ecosystem, recommend 3?5 alternatives with comparison
4. **Executive summary** ? one paragraph "should I use this?" verdict
5. **Remediation advice** ? actionable steps to mitigate identified risks

**System prompt for all LLM calls** (insert before user prompt):
```
You are a senior application security engineer and open source expert.
You analyse software dependencies and produce structured, accurate, developer-friendly security reports.
Be concise, factual, and practical. When uncertain, say so explicitly.
Never invent CVE IDs, GitHub stats, or version numbers ? only use data provided to you in the context.
Respond only with valid JSON when JSON is requested. No markdown fences around JSON.
```

---

## 5. Data Sources & APIs

All data fetching must be done **in parallel** using `Promise.allSettled()`. A failure in one source must never block the others.

### 5.1 Vulnerability Data

#### OSV.dev (Primary ? Free, no key required)
```
POST https://api.osv.dev/v1/query
Body: { "package": { "name": "lodash", "ecosystem": "npm" } }

Also supports batch:
POST https://api.osv.dev/v1/querybatch
Body: { "queries": [...] }
```
Returns: CVE IDs, severity scores, affected versions, fix versions, aliases.

#### NIST NVD (Secondary ? free, rate-limited; optional API key improves limits)
```
GET https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch={package}&resultsPerPage=20
Headers: { 'apiKey': userNvdKey }  // optional
```
Returns: CVSS v3 scores, CWE IDs, description, references.

#### GitHub Advisory Database (via GraphQL)
```
POST https://api.github.com/graphql
Query: securityAdvisories(first: 10, ecosystem: NPM, package: "lodash")
Headers: { 'Authorization': 'Bearer {githubToken}' }  // optional, public data has rate limits
```

### 5.2 Package Metadata

#### npm Registry
```
GET https://registry.npmjs.org/{package}
GET https://registry.npmjs.org/{package}/{version}
```
Returns: description, keywords, maintainers, version history, dependencies, dist-tags, homepage, repository, license, weekly downloads (via npm API).

#### npm Download Stats
```
GET https://api.npmjs.org/downloads/point/last-week/{package}
GET https://api.npmjs.org/downloads/point/last-month/{package}
```

#### PyPI
```
GET https://pypi.org/pypi/{package}/json
GET https://pypi.org/pypi/{package}/{version}/json
```
Returns: metadata, classifiers (license, python version support), download URLs, requires-dist, project URLs.

#### deps.dev (Google ? multi-ecosystem)
```
GET https://api.deps.dev/v3/systems/{system}/packages/{package}
GET https://api.deps.dev/v3/systems/{system}/packages/{package}/versions/{version}
```
Systems: npm, pypi, go, maven, cargo, nuget
Returns: licenses, dependencies, dependents count, security advisories, version timeline.

#### Repology (cross-ecosystem metadata)
```
GET https://repology.org/api/v1/project/{package}
```

### 5.3 Repository Health

#### GitHub REST API
```
GET https://api.github.com/repos/{owner}/{repo}
Returns: stars, forks, open issues, watchers, pushed_at (last commit), archived, disabled, license

GET https://api.github.com/repos/{owner}/{repo}/commits?per_page=1
Returns: last commit date

GET https://api.github.com/repos/{owner}/{repo}/releases?per_page=5
Returns: latest releases, release dates

GET https://api.github.com/repos/{owner}/{repo}/contributors?per_page=10
Returns: contributor count, top contributors

GET https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=1
Header: returns X-Total-Count via Link header trick or use search API

GET https://api.github.com/repos/{owner}/{repo}/pulls?state=open&per_page=1
```

**GitHub token:** Optional but strongly recommended (unauthenticated: 60 req/hr, authenticated: 5000 req/hr). User provides their own token, stored in sessionStorage.

#### OpenSSF Scorecard (Critical for OSS trust)
```
GET https://api.securityscorecards.dev/projects/github.com/{owner}/{repo}
```
Returns: overall score (0?10), individual check scores:
- Binary-Artifacts, Branch-Protection, CI-Best-Practices, Code-Review
- Contributors, Dangerous-Workflow, Dependency-Update-Tool
- Fuzzing, License, Maintained, Packaging, Pinned-Dependencies
- SAST, Security-Policy, Signed-Releases, Token-Permissions, Vulnerabilities

### 5.4 License Data

#### SPDX License List
```
GET https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json
Cache this locally in the app bundle (update quarterly)
```

#### deps.dev license endpoint (above)

#### GitHub license detection
```
GET https://api.github.com/repos/{owner}/{repo}/license
Returns: license SPDX ID, content (base64 encoded)
```

### 5.5 Ecosystem-Specific Sources

| Ecosystem | Registry API |
|---|---|
| Ruby gems | `https://rubygems.org/api/v1/gems/{name}.json` |
| Go modules | `https://proxy.golang.org/{module}/@latest` + `https://pkg.go.dev` (scraping discouraged ? use deps.dev) |
| Rust crates | `https://crates.io/api/v1/crates/{name}` |
| Maven | `https://search.maven.org/solrsearch/select?q=g:{group}+AND+a:{artifact}&rows=1&wt=json` |
| NuGet | `https://api.nuget.org/v3/registration5/{package}/index.json` |
| Composer (PHP) | `https://repo.packagist.org/p2/{vendor}/{package}.json` |

### 5.6 No MCP / No Browser Automation

After careful evaluation: **do not use MCP or browser automation** in this tool. Reasons:
- All required data is available via stable REST APIs
- MCP adds latency, complexity, and a dependency on a running MCP server
- Browser automation would break the stateless constraint
- The public APIs listed above cover 100% of the data needed

If a future version needs real-time CVE data not yet indexed by OSV (rare edge case), add a note in the report rather than spinning up a browser.

---

## 6. File Ingestion System

### Supported Manifest Files

```typescript
type ManifestType =
  | 'package.json'
  | 'package-lock.json'
  | 'yarn.lock'
  | 'pnpm-lock.yaml'
  | 'npm-shrinkwrap.json'
  | 'requirements.txt'
  | 'requirements-dev.txt'
  | 'Pipfile'
  | 'Pipfile.lock'
  | 'pyproject.toml'
  | 'poetry.lock'
  | 'Gemfile'
  | 'Gemfile.lock'
  | 'go.mod'
  | 'go.sum'
  | 'Cargo.toml'
  | 'Cargo.lock'
  | 'pom.xml'
  | 'build.gradle'
  | 'build.gradle.kts'
  | 'composer.json'
  | 'composer.lock'
  | '.csproj'         // .NET
  | 'packages.config' // .NET legacy
  | 'mix.exs'         // Elixir
  | 'mix.lock';       // Elixir
```

### Parsers

Implement a parser for each file type in `src/lib/parsers/`. Each parser must implement:

```typescript
interface ManifestParser {
  canParse: (filename: string) => boolean;
  parse: (content: string) => ParsedDependency[];
}

interface ParsedDependency {
  name: string;
  version: string;            // Exact version if available, else constraint
  exactVersion?: string;      // Resolved/locked version
  ecosystem: Ecosystem;
  isDev: boolean;
  isPeer?: boolean;
  isOptional?: boolean;
  depth?: number;             // 0 = direct, 1+ = transitive
}
```

#### Parser Implementations

**package.json:**
```typescript
// Parse dependencies, devDependencies, peerDependencies, optionalDependencies
// Extract: name, version constraint (^1.0.0), classify isDev/isPeer/isOptional
// Also extract: engines.node, packageManager field
```

**package-lock.json (npm v2/v3):**
```typescript
// v2: packages["node_modules/pkg"] ? version, resolved, integrity, dev
// v3: same structure but nested
// Extract resolved (exact) versions
// Map to direct vs transitive (check if in top-level packages)
```

**yarn.lock:**
```typescript
// Parse yarn.lock format:
// "package@^1.0.0":
//   version "1.2.3"
//   resolved "https://..."
//   dependencies: { ... }
// Use regex: /^"?([^@\n"]+)@([^":\n]+)"?:/
```

**pnpm-lock.yaml:**
```typescript
// YAML parse: importers['.'].dependencies / devDependencies
// packages section: resolved versions
// Use js-yaml for parsing
```

**requirements.txt:**
```typescript
// Lines: package==1.0.0, package>=1.0.0, package~=1.0.0
// Skip: comments (#), options (-r, --index-url)
// Handle: extras [security], environment markers ; python_version
// Regex: /^([A-Za-z0-9_\-\.]+)(\[.*?\])?\s*([><=!~]+\s*[\d\.]+)?/
```

**pyproject.toml:**
```typescript
// Parse TOML: [project].dependencies array
// [tool.poetry.dependencies] section
// Also: [tool.poetry.dev-dependencies]
// Use @iarna/toml for parsing
```

**Cargo.toml / Cargo.lock:**
```typescript
// Cargo.toml: [dependencies], [dev-dependencies], [build-dependencies]
// Cargo.lock: [[package]] entries with name, version, checksum
```

**go.mod:**
```typescript
// require block: module version pairs
// exclude / replace directives (flag these as noteworthy)
```

**pom.xml:**
```typescript
// Use DOMParser in browser
// Extract <dependency> elements: groupId, artifactId, version, scope
// scope: compile (default), test, provided, runtime ? maps to isDev
```

**Gemfile.lock:**
```typescript
// GEM section: name (version) entries
// DEPENDENCIES section: direct deps
```

### Batch Analysis Mode

When a manifest file is uploaded with multiple packages:

1. Parse all dependencies ? list of `ParsedDependency[]`
2. Deduplicate by name+ecosystem
3. Show user a **dependency table** with checkboxes (all checked by default)
4. User can deselect packages to skip
5. Set a configurable limit (default: 20 packages per batch to stay within API rate limits)
6. Run analysis in **batches of 5 packages** in parallel
7. Show a **progress bar** and per-package status (pending / scanning / done / failed)
8. Produce a **batch report** with:
   - Overall risk heatmap (table with risk score per package)
   - Individual collapsible sections per package
   - Aggregate stats: total CVEs, high-risk count, outdated count
   - Most critical issues surfaced to the top

### File Size Limits

- Max file size: **2MB** (manifests are always small; reject anything larger)
- Client-side validation only ? no server upload

---

## 7. Analysis Pipeline

### 7.1 Single Package Analysis

```
Step 1: RESOLVE
  - Detect ecosystem from input format
  - Resolve exact package name and version from registry
  - Extract GitHub repo URL from package metadata

Step 2: FETCH (all parallel via Promise.allSettled)
  - fetch_vulnerabilities()     ? OSV.dev + NVD
  - fetch_package_metadata()    ? registry-specific API
  - fetch_github_stats()        ? GitHub REST API
  - fetch_openssf_scorecard()   ? scorecard.dev
  - fetch_license_data()        ? SPDX + GitHub license endpoint
  - fetch_deps_dev()            ? deps.dev API
  - fetch_download_stats()      ? registry download counts

Step 3: ENRICH
  - Merge and deduplicate vulnerability data (CVE IDs may appear in both OSV and NVD)
  - Calculate maintenance health score
  - Identify direct vs transitive vulnerabilities
  - Classify license type and compatibility

Step 4: SCORE
  - Calculate composite Risk Score (0?100, higher = riskier)
  - Calculate Trust Score (0?100, higher = more trustworthy)

Step 5: LLM SYNTHESIS (streaming)
  - Call LLM with structured JSON context (all fetched data)
  - Stream: threat model ? license explanation ? alternatives ? executive summary

Step 6: RENDER
  - Stream LLM output into report sections
  - Render static sections (vuln table, metadata, scorecard) immediately
```

### 7.2 Risk Scoring Algorithm

```typescript
function calculateRiskScore(data: PackageAnalysisData): number {
  let score = 0;

  // Vulnerability component (0?40 points)
  const criticalCount = data.vulnerabilities.filter(v => v.severity === 'CRITICAL').length;
  const highCount = data.vulnerabilities.filter(v => v.severity === 'HIGH').length;
  const medCount = data.vulnerabilities.filter(v => v.severity === 'MEDIUM').length;
  score += Math.min(40, criticalCount * 15 + highCount * 8 + medCount * 3);

  // Maintenance component (0?25 points)
  const daysSinceLastCommit = daysBetween(data.github.lastCommitDate, new Date());
  if (daysSinceLastCommit > 730) score += 25;       // >2 years: critical
  else if (daysSinceLastCommit > 365) score += 15;  // >1 year: high
  else if (daysSinceLastCommit > 180) score += 8;   // >6 months: medium
  if (data.github.archived) score += 20;
  if (data.github.openIssues > 500) score += 5;

  // OpenSSF Scorecard component (0?20 points)
  if (data.scorecard?.score !== undefined) {
    score += Math.round((10 - data.scorecard.score) * 2); // invert: 0/10 = 20pts risk
  }

  // License component (0?10 points)
  const licenseRisk = getLicenseRiskPoints(data.license?.spdxId);
  score += licenseRisk;

  // Dependency depth component (0?5 points)
  const transitiveVulnCount = data.vulnerabilities.filter(v => v.isTransitive).length;
  score += Math.min(5, transitiveVulnCount * 2);

  return Math.min(100, score);
}

function getLicenseRiskPoints(spdxId?: string): number {
  if (!spdxId) return 5;                           // Unknown license: risky
  if (['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'].includes(spdxId)) return 8;  // Copyleft: high
  if (['LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0'].includes(spdxId)) return 4; // Weak copyleft
  if (['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'].includes(spdxId)) return 0;
  if (spdxId === 'UNLICENSED' || spdxId === 'NONE') return 10;
  return 3; // Unknown SPDX: minor risk
}
```

### 7.3 Trust Score

```typescript
function calculateTrustScore(data: PackageAnalysisData): number {
  let score = 100;

  // Deduct for vulnerabilities (mirroring risk, capped)
  score -= Math.min(40, data.riskScore * 0.4);

  // Add for OpenSSF (high scorecard = more trust)
  if (data.scorecard?.score) score = score * (data.scorecard.score / 10) * 0.4 + score * 0.6;

  // Deduct for low downloads (unpopular = less battle-tested)
  const weeklyDownloads = data.packageStats?.weeklyDownloads ?? 0;
  if (weeklyDownloads < 100) score -= 20;
  else if (weeklyDownloads < 10000) score -= 10;
  else if (weeklyDownloads < 100000) score -= 5;

  // Deduct for no signed releases
  if (data.scorecard?.checks?.['Signed-Releases']?.score === 0) score -= 10;

  // Deduct for recent major vulnerability (< 90 days since disclosure)
  const recentCritical = data.vulnerabilities.some(v =>
    v.severity === 'CRITICAL' && daysBetween(new Date(v.publishedDate), new Date()) < 90
  );
  if (recentCritical) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}
```

### 7.4 LLM Prompt Construction

```typescript
function buildAnalysisPrompt(data: PackageAnalysisData): string {
  return `
Analyse the following software package data and produce a security threat model report.
Return a JSON object with EXACTLY this structure (no extra fields):

{
  "executiveSummary": "string (2-3 sentences, plain language verdict)",
  "threatModel": {
    "spoofing": "string",
    "tampering": "string",
    "repudiation": "string",
    "informationDisclosure": "string",
    "denialOfService": "string",
    "elevationOfPrivilege": "string",
    "overallThreatLevel": "CRITICAL|HIGH|MEDIUM|LOW|MINIMAL"
  },
  "licenseExplanation": {
    "summary": "string (1 sentence what license is)",
    "canYou": ["string", ...],     // things you CAN do (max 5)
    "cannotYou": ["string", ...],  // things you CANNOT do (max 5)
    "mustYou": ["string", ...],    // obligations (max 5)
    "commercialUse": "YES|NO|CONDITIONS",
    "modifyAndDistribute": "YES|NO|CONDITIONS",
    "patentProtection": "YES|NO|UNCLEAR",
    "riskLevel": "HIGH|MEDIUM|LOW",
    "plainEnglish": "string (2-3 sentence plain English summary)"
  },
  "alternatives": [
    {
      "name": "string",
      "ecosystem": "string",
      "description": "string (1-2 sentences)",
      "whyBetter": "string (vs scanned package)",
      "license": "string (SPDX)",
      "weeklyDownloads": "string (approx)",
      "githubStars": "string (approx)",
      "maintenanceStatus": "ACTIVE|MAINTAINED|SLOW|ABANDONED",
      "migrationDifficulty": "EASY|MODERATE|HARD",
      "notableFeatures": ["string", ...]
    }
  ],
  "remediationSteps": [
    {
      "priority": "IMMEDIATE|SHORT_TERM|LONG_TERM",
      "action": "string",
      "rationale": "string"
    }
  ],
  "developerVerdict": "USE|USE_WITH_CAUTION|AVOID|REPLACE_SOON"
}

PACKAGE DATA:
${JSON.stringify(data, null, 2)}
  `.trim();
}
```

---

## 8. Report Structure

The report is divided into clearly labelled sections. Implement each as a React component in `src/components/report/`.

### 8.1 Report Header

```
???????????????????????????????????????????????????????????????????
?  ? lodash  v4.17.21  npm                                        ?
?  Risk Score: 72/100 [??????????] HIGH                           ?
?  Trust Score: 41/100 [??????????] LOW                           ?
?  Verdict: ??  USE WITH CAUTION                                   ?
?  Report generated: 25 May 2026 14:32 UTC                        ?
?                           [Export ?]                             ?
???????????????????????????????????????????????????????????????????
```

### 8.2 Executive Summary

LLM-generated 2?3 sentence plain-language verdict. Rendered as the first section.

### 8.3 Package Metadata

| Field | Value |
|---|---|
| Full name | lodash |
| Version scanned | 4.17.21 |
| Latest version | 4.17.21 |
| Up to date | ? Yes |
| Published | 10 Feb 2021 |
| Description | A modern JavaScript utility library |
| Ecosystem | npm |
| Weekly downloads | 48,234,019 |
| Monthly downloads | 198,412,006 |
| Total versions | 114 |
| Homepage | https://lodash.com |
| Repository | https://github.com/lodash/lodash |
| Author / Maintainers | John-David Dalton + 4 others |
| Funding | ? |
| Keywords | modules, stdlib, util |

### 8.4 Maintenance Health

```
Last commit:        847 days ago  ??  (> 2 years)
Last release:       4 Feb 2021
Open issues:        682           ??
Open pull requests: 205           ??
Contributors:       310
Stars:              59,400
Forks:              7,100
Is archived:        No
Is deprecated:      No  (but de facto unmaintained)
Dependents:         >20,000,000 packages
Successor package:  (none official)
```

**Maintenance Rating:** `UNMAINTAINED` / `SLOW` / `ACTIVE` / `VERY ACTIVE`

### 8.5 Known Security Vulnerabilities

Render as a sortable, filterable table:

| CVE ID | Severity | CVSS | Title | Affects Versions | Fixed In | Disclosed | Source |
|---|---|---|---|---|---|---|---|
| CVE-2021-23337 | HIGH | 7.2 | Command injection via template | <4.17.21 | 4.17.21 | 2021-02-15 | OSV |
| CVE-2020-8203 | HIGH | 7.4 | Prototype pollution | <4.17.19 | 4.17.19 | 2020-07-15 | NVD |

Fields per vulnerability:
- `id`: CVE/GHSA/OSV ID (link to advisory)
- `severity`: CRITICAL / HIGH / MEDIUM / LOW / UNKNOWN
- `cvssScore`: CVSS v3.1 base score
- `cvssVector`: CVSS vector string
- `title`: Short description
- `description`: Full description (expandable)
- `affectedVersions`: Version range
- `fixedInVersion`: First fixed version
- `publishedDate`: Disclosure date
- `modifiedDate`: Last updated
- `cweIds`: CWE classifications
- `references`: Links to advisories, patches, PoC
- `isTransitive`: Whether from a dependency of the package
- `source`: OSV / NVD / GitHub Advisory

### 8.6 Threat Model (STRIDE)

LLM-generated, structured:

```
SPOOFING
The package does not implement or rely on authentication mechanisms. Risk: 
packages published under the lodash namespace could theoretically be 
typosquatted (e.g. "lodahs"). The npm package is owned by a single 
maintainer account with no MFA enforcement verified.

TAMPERING
No release signing verified (OpenSSF Signed-Releases score: 0). 
Supply chain injection risk if the maintainer account is compromised. 
No SLSA provenance attestations detected.

[... remaining STRIDE categories ...]

Overall Threat Level: MEDIUM
```

### 8.7 OpenSSF Scorecard

Display as a visual scorecard with individual check results:

```
Overall Score: 5.2 / 10

? License              10/10  ? License file found
? CI-Best-Practices     8/10  ? GitHub Actions detected
??  Maintained           2/10  ? 1 commit in last 90 days
? Signed-Releases       0/10  ? No release signing
? Fuzzing               0/10  ? No fuzzing detected
??  Branch-Protection    3/10  ? No branch protection rules
? Security-Policy      10/10  ? SECURITY.md found
? SAST                  0/10  ? No SAST tool detected
...
```

### 8.8 License Analysis

```
License: MIT
SPDX ID: MIT

? Commercial use        ? Modify               ? Distribute
? Sublicense            ? Private use          ? Trademark use
? Liability             ? Warranty             ? Patent use (implicit)

? Plain English:
The MIT license is one of the most permissive open source licenses. You can 
use this package in commercial products, modify it, and redistribute it ? 
even without sharing your changes. You just need to include the original 
copyright notice and license text. This is a very developer-friendly license.

??  Obligations:
  ? Include copyright notice in distributions
  ? Include the MIT license text

License Risk: LOW
```

### 8.9 Dependency Tree

Render a visual tree (expandable):
```
lodash@4.17.21
  (no dependencies)    ? great, no transitive risk

[For packages with deps, show:]
express@4.18.2
  ??? accepts@1.3.8
  ?   ??? mime-types@2.1.35
  ?       ??? mime-db@1.52.0
  ??? array-flatten@1.1.1
  ??? body-parser@1.20.1   ?? 1 vulnerability
  ?   ??? bytes@3.1.2
  ?   ??? ...
```

### 8.10 Recommended Alternatives

Card-based layout, 3?5 alternatives:

```
????????????????????????????????????????????????????????????
?  radash                                          REPLACE  ?
?  Modern, type-safe utility library for TypeScript         ?
?  License: MIT  ? 3.4k  ? 180k/week  ? ACTIVE           ?
?  Why better: actively maintained, TypeScript-first,       ?
?  tree-shakeable, no prototype pollution issues            ?
?  Migration: EASY ? most methods are drop-in replacements  ?
????????????????????????????????????????????????????????????
```

### 8.11 Remediation Steps

Prioritised action list:
```
? IMMEDIATE
  1. Audit all uses of _.template() in your codebase for untrusted input (CVE-2021-23337)
  2. Enable dependabot/renovate to track future advisories

? SHORT TERM
  3. Evaluate migration to radash or native ES2024 methods
  4. Pin version to 4.17.21 in lockfile to prevent accidental downgrade

? LONG TERM
  5. Remove lodash entirely; replace with native array/object methods where possible
```

### 8.12 Raw Data Tab

Collapsible JSON viewer showing all raw API responses (for power users / audit purposes).

---

## 9. Export System

All exports are generated **client-side**. No server involved.

### 9.1 Markdown Export

```typescript
function exportMarkdown(report: AnalysisReport): string {
  // Template literal with all sections
  // Use proper heading hierarchy (# ## ###)
  // Tables use GitHub Flavored Markdown pipe syntax
  // Code blocks for CVE IDs, version strings
  // Emoji for visual severity indicators (?? ? ?)
  return markdownString;
}

// Trigger download:
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Filename: `trustguard-{package-name}-{version}-{date}.md`

### 9.2 JSON Export

```typescript
function exportJSON(report: AnalysisReport): string {
  // Export the complete structured report object
  // Include: metadata, vulnerabilities[], threatModel, license,
  //          scorecard, alternatives[], remediationSteps[], scores
  // ISO 8601 timestamps
  // SPDX identifiers for licenses
  // CVSS vectors as strings
  return JSON.stringify(report, null, 2);
}
```

Filename: `trustguard-{package-name}-{version}-{date}.json`

Schema version field: `"schemaVersion": "1.0"` for future compatibility.

### 9.3 HTML Export

```typescript
function exportHTML(report: AnalysisReport): string {
  // Self-contained HTML file
  // Inline all CSS (Tailwind utilities as literal CSS, not CDN)
  // No external dependencies ? file must work offline
  // Include the full report with interactive collapsible sections (vanilla JS)
  // Print-optimised CSS (@media print)
  // Include TrustGuard AI branding and report metadata in <head>
}
```

Filename: `trustguard-{package-name}-{version}-{date}.html`

### 9.4 PDF Export

Use `@react-pdf/renderer` to generate PDF client-side:

```typescript
// src/lib/export/pdf.tsx
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// Define a clean PDF layout with:
// - Cover page: package name, scores, verdict, date
// - Executive Summary page
// - Vulnerability table (paginated if many CVEs)
// - Threat Model (STRIDE) narrative
// - License section
// - Alternatives (card-style)
// - Remediation checklist
// - Raw scorecard data
// - Footer: "Generated by TrustGuard AI on {date}" + URL

async function exportPDF(report: AnalysisReport): Promise<void> {
  const doc = <ReportPDFDocument report={report} />;
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trustguard-${report.packageName}-${report.version}-${formatDate(new Date())}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 9.5 Export Button UI

```
[ Export Report ? ]
  ??? ? Markdown (.md)
  ??? ? JSON (.json)
  ??? ? HTML (.html)
  ??? ? PDF (.pdf)
```

Show a loading spinner during PDF generation (can take 1?3 seconds).

---

## 10. UI/UX Specification

### 10.1 Design Principles

- **Dark-first** with a light mode toggle (respect `prefers-color-scheme`)
- **Monochrome base** with semantic color only for risk levels (red/amber/green)
- **Dense but breathable** ? developer tools can pack information, but need visual hierarchy
- **No unnecessary animations** ? only purposeful transitions (result streaming, progress)
- **Mobile-responsive** ? report must be readable on mobile (stack cards vertically)

### 10.2 Color System

```css
/* Risk levels ? use consistently everywhere */
--risk-critical: #dc2626;   /* red-600 */
--risk-high:     #ea580c;   /* orange-600 */
--risk-medium:   #ca8a04;   /* yellow-600 */
--risk-low:      #16a34a;   /* green-600 */
--risk-minimal:  #2563eb;   /* blue-600 */
--risk-unknown:  #6b7280;   /* gray-500 */

/* Verdict colors */
--verdict-use:            #16a34a;
--verdict-caution:        #ca8a04;
--verdict-avoid:          #dc2626;
--verdict-replace-soon:   #ea580c;
```

### 10.3 Page Layout

```
????????????????????????????????????????????????????????????????????
? [? TrustGuard AI]                        [?? Settings] [? Theme]    ?
????????????????????????????????????????????????????????????????????
?                                                                    ?
?              Analyse any package, repo, or dependency file         ?
?                                                                    ?
?  ???????????????????????????????????????????????????????????     ?
?  ?  ? npm:lodash@4.17.21  or  https://github.com/org/repo  ?     ?
?  ???????????????????????????????????????????????????????????     ?
?  [ ? Upload manifest file ]     [ ? Analyse ]                   ?
?                                                                    ?
?  LLM: [Claude ?]  [sk-ant-?????????????]  [Test ?]              ?
?                                                                    ?
????????????????????????????????????????????????????????????????????
? [RESULTS AREA ? report renders here as analysis completes]        ?
????????????????????????????????????????????????????????????????????
```

### 10.4 Settings Panel

Accessible via ?? icon ? slide-out drawer (not modal):

```
LLM Provider
  [Provider selector dropdown]
  [API Key input ? password type, masked]
  [Model selector]
  [Test Connection button]

API Keys (Optional ? improves rate limits)
  GitHub Personal Access Token: [________________]
  NVD API Key:                  [________________]

Analysis Options
  ? Include transitive dependencies
  ? Scan dependency files recursively
  ? Show raw API data tab
  ? Verbose threat model (longer LLM output)
  Max packages per batch: [20]

Privacy
  ? All API keys stored in session only (cleared on tab close)
  [Clear all stored keys]
```

### 10.5 Results Streaming UX

Show results **progressively** as each data source returns:

```
Analysing lodash@4.17.21...

? Package metadata fetched         (0.3s)
? Vulnerability data loaded        (0.8s)  ? 8 advisories found
? GitHub repository scanned        (1.1s)
? OpenSSF Scorecard loading...
? License identified: MIT           (1.2s)
? deps.dev data loaded             (1.4s)
? OpenSSF Scorecard loaded         (2.1s)
? AI analysis running...

[Report sections render below as each completes]
```

### 10.6 Batch Analysis UX

```
? Parsing package.json... found 47 dependencies

[ Select all ]  [ Deselect all ]  [ Direct only ]

? react           18.2.0    (direct)
? react-dom       18.2.0    (direct)
? lodash          4.17.21   (direct)
? axios           1.6.0     (direct)
? @types/react    18.2.0    (dev)    [deselected]
...

[22 selected]  [Analyse selected ? estimated 2-3 min]

????????????????????????????????????????? 14/22 packages

react           ? Done ? Trust: 94  Risk: 12
lodash          ??  Done ? Trust: 41  Risk: 72
axios           ? Scanning...
...
```

---

## 11. Security & DevSecOps Requirements

### 11.1 Dependency Security (The Tool Must Practice What It Preaches)

```json
// package.json constraints
{
  "engines": { "node": ">=20.0.0" },
  "overrides": {
    // Pin any transitive deps with known vulnerabilities
  }
}
```

**Dependency selection rules:**
- Prefer **zero-dependency** packages for parsers where possible
- For each dependency, document why it was chosen (in `DEPENDENCIES.md`)
- Use `npm audit` / `pnpm audit` in CI ? fail on HIGH or CRITICAL
- Use **Dependabot** or **Renovate** config (`.github/dependabot.yml`)
- Lock file must be committed (`package-lock.json` or `pnpm-lock.yaml`)
- Use exact versions in `package.json` for production deps where appropriate

**Approved dependencies (pre-vetted):**
```
react, react-dom          ? Meta, widely audited
react-router-dom          ? Remix team
zustand                   ? Tiny, zero deps
tailwindcss               ? Build-time only
vite                      ? Build-time only
typescript                ? Build-time only
react-markdown            ? Content rendering only
remark-gfm                ? Markdown plugin
rehype-highlight          ? Syntax highlighting
highlight.js              ? No eval() usage
lucide-react              ? Icon library, SVG only
@react-pdf/renderer       ? Client-side PDF
js-yaml                   ? YAML parsing (Pipfile.lock, pnpm)
@iarna/toml               ? TOML parsing (pyproject.toml)
eslint-plugin-security    ? Dev dependency, linting
```

**Do NOT use:**
- `axios` (use native `fetch`)
- `moment.js` (use `date-fns` or `Temporal`)
- `lodash` (ironic, but also avoid ? use native methods)
- Any package with known vulnerabilities
- Any package not actively maintained (last commit > 1 year)
- Any package that evaluates strings as code (`eval`, `new Function`)

### 11.2 Content Security Policy

In `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src 
    'self'
    https://api.osv.dev
    https://services.nvd.nist.gov
    https://api.github.com
    https://registry.npmjs.org
    https://api.npmjs.org
    https://pypi.org
    https://api.deps.dev
    https://api.securityscorecards.dev
    https://rubygems.org
    https://crates.io
    https://api.mistral.ai
    https://api.openai.com
    https://api.anthropic.com
    https://open.bigmodel.cn
    https://api.z.ai
    https://api.groq.com
    https://api.together.xyz
    https://generativelanguage.googleapis.com
    http://localhost:11434;
  img-src 'self' data: https:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'none';
">
```

> **Note:** Update the `connect-src` list if new LLM providers are added. `unsafe-inline` for styles is required by Tailwind; consider using a nonce or hashing approach in production.

### 11.3 Input Validation & Sanitisation

```typescript
// src/lib/validation.ts

const PACKAGE_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const VERSION_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?(?:\+[a-zA-Z0-9.]+)?$/;
const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;
const MAX_INPUT_LENGTH = 500;

export function validatePackageInput(input: string): ValidationResult {
  if (!input || input.trim().length === 0) return { valid: false, error: 'Input required' };
  if (input.length > MAX_INPUT_LENGTH) return { valid: false, error: 'Input too long' };
  
  const trimmed = input.trim();
  
  // Detect and validate input type
  if (trimmed.startsWith('https://github.com/')) {
    return GITHUB_URL_REGEX.test(trimmed)
      ? { valid: true, type: 'github', value: trimmed }
      : { valid: false, error: 'Invalid GitHub URL format' };
  }
  
  // npm: package or package@version or @scope/package@version
  // (additional parsing logic here)
  
  // Sanitise: strip any HTML/script injection attempts
  if (/<|>|script|javascript:/i.test(trimmed)) {
    return { valid: false, error: 'Invalid characters in input' };
  }
  
  return { valid: true, type: detectEcosystem(trimmed), value: trimmed };
}

// File upload validation
export function validateUploadedFile(file: File): ValidationResult {
  const ALLOWED_FILENAMES = new Set([
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'requirements.txt', 'Pipfile', 'Pipfile.lock', 'pyproject.toml',
    'poetry.lock', 'Gemfile', 'Gemfile.lock', 'go.mod', 'go.sum',
    'Cargo.toml', 'Cargo.lock', 'pom.xml', 'build.gradle',
    'composer.json', 'composer.lock', 'mix.exs', 'mix.lock'
  ]);
  
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: 'File too large (max 2MB)' };
  if (!ALLOWED_FILENAMES.has(file.name) && !file.name.endsWith('.csproj')) {
    return { valid: false, error: `Unsupported file: ${file.name}` };
  }
  
  return { valid: true };
}
```

### 11.4 API Key Security

```typescript
// NEVER do any of these:
console.log(apiKey);                          // ?
fetch(url, { headers: { 'X-Key': apiKey }})   // ? (unless it's the provider endpoint)
localStorage.setItem('key', apiKey);          // ?
Sentry.captureException(err, { extra: { apiKey } }); // ?

// Mask keys in UI:
function maskKey(key: string): string {
  if (key.length <= 8) return '?'.repeat(key.length);
  return key.slice(0, 4) + '?'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
}

// Rate limit LLM calls ? prevent accidental spend:
const llmCallQueue = new RateLimiter({ maxCalls: 10, windowMs: 60000 });
```

### 11.5 Error Handling

```typescript
// Never expose raw API error messages to users (may contain sensitive headers, internal URLs)
function sanitiseError(err: unknown): string {
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return 'Network error ? check your connection or CORS settings';
  }
  if (err instanceof Response) {
    // Don't forward the raw error body
    return `API error (${err.status}) ? check your API key and quota`;
  }
  return 'An unexpected error occurred';
}
```

### 11.6 CI/CD Security Pipeline

Create `.github/workflows/security.yml`:

```yaml
name: Security Checks

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npx eslint . --ext .ts,.tsx --plugin security
      - run: npx tsc --noEmit

  scorecard:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: ossf/scorecard-action@v2.3.1
        with:
          results_format: sarif
          publish_results: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

### 11.7 Additional Security Headers (via Vercel/Netlify config)

`vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

---

## 12. Environment & Configuration

### 12.1 Environment Variables (Build-time only)

```bash
# .env.example ? commit this, not .env
# These are OPTIONAL defaults ? users always override via UI

# GitHub token for higher rate limits (optional ? users can provide their own)
VITE_DEFAULT_GITHUB_TOKEN=

# NVD API key (optional)
VITE_DEFAULT_NVD_KEY=

# App version (injected by Vite at build time)
VITE_APP_VERSION=

# Analytics (optional ? privacy-respecting, e.g. Plausible)
VITE_PLAUSIBLE_DOMAIN=
```

> **Never** put LLM API keys in environment variables. Users must always supply their own key via the UI.

### 12.2 Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,           // Don't expose source in production
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'pdf-export': ['@react-pdf/renderer'],
          'markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight'],
        }
      }
    }
  },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    }
  }
});
```

---

## 13. Project File Structure

```
trustguard/
??? .github/
?   ??? workflows/
?   ?   ??? security.yml          # npm audit, ESLint security, TypeScript
?   ?   ??? deploy.yml            # Deploy to Vercel on main push
?   ?   ??? codeql.yml            # GitHub CodeQL analysis
?   ??? dependabot.yml            # Weekly dependency updates
?   ??? SECURITY.md               # Responsible disclosure policy
?
??? public/
?   ??? favicon.svg
?   ??? robots.txt
?
??? src/
?   ??? main.tsx                  # App entry point
?   ??? App.tsx                   # Router setup
?   ?
?   ??? components/
?   ?   ??? layout/
?   ?   ?   ??? Header.tsx
?   ?   ?   ??? SettingsDrawer.tsx
?   ?   ?   ??? ThemeToggle.tsx
?   ?   ?
?   ?   ??? input/
?   ?   ?   ??? SearchBar.tsx     # Package name / URL input
?   ?   ?   ??? FileDropzone.tsx  # Drag-and-drop manifest upload
?   ?   ?   ??? EcosystemBadge.tsx
?   ?   ?   ??? LLMSelector.tsx   # Provider + key + model picker
?   ?   ?
?   ?   ??? report/
?   ?   ?   ??? ReportContainer.tsx
?   ?   ?   ??? ReportHeader.tsx      # Scores + verdict banner
?   ?   ?   ??? ExecutiveSummary.tsx
?   ?   ?   ??? PackageMetadata.tsx
?   ?   ?   ??? MaintenanceHealth.tsx
?   ?   ?   ??? VulnerabilityTable.tsx
?   ?   ?   ??? ThreatModel.tsx       # STRIDE breakdown
?   ?   ?   ??? ScorecardPanel.tsx
?   ?   ?   ??? LicensePanel.tsx
?   ?   ?   ??? DependencyTree.tsx
?   ?   ?   ??? Alternatives.tsx
?   ?   ?   ??? RemediationSteps.tsx
?   ?   ?   ??? RawDataViewer.tsx
?   ?   ?
?   ?   ??? batch/
?   ?   ?   ??? DependencySelector.tsx
?   ?   ?   ??? BatchProgress.tsx
?   ?   ?   ??? BatchSummary.tsx
?   ?   ?
?   ?   ??? shared/
?   ?       ??? RiskBadge.tsx
?   ?       ??? ScoreGauge.tsx
?   ?       ??? CollapsibleSection.tsx
?   ?       ??? LoadingSpinner.tsx
?   ?       ??? ErrorBoundary.tsx
?   ?       ??? CopyButton.tsx
?   ?
?   ??? lib/
?   ?   ??? llm/
?   ?   ?   ??? types.ts
?   ?   ?   ??? LLMClient.ts          # Unified streaming client
?   ?   ?   ??? prompts.ts            # All system + user prompts
?   ?   ?   ??? providers/
?   ?   ?       ??? openai.ts
?   ?   ?       ??? anthropic.ts
?   ?   ?       ??? mistral.ts
?   ?   ?       ??? zhipu.ts          # GLM ? includes JWT builder
?   ?   ?       ??? zai.ts
?   ?   ?       ??? groq.ts
?   ?   ?       ??? together.ts
?   ?   ?       ??? gemini.ts
?   ?   ?       ??? ollama.ts
?   ?   ?
?   ?   ??? fetchers/
?   ?   ?   ??? types.ts
?   ?   ?   ??? orchestrator.ts       # Promise.allSettled coordinator
?   ?   ?   ??? osv.ts
?   ?   ?   ??? nvd.ts
?   ?   ?   ??? github.ts
?   ?   ?   ??? scorecard.ts
?   ?   ?   ??? npm.ts
?   ?   ?   ??? pypi.ts
?   ?   ?   ??? depsDev.ts
?   ?   ?   ??? rubygems.ts
?   ?   ?   ??? cratesio.ts
?   ?   ?   ??? maven.ts
?   ?   ?   ??? nuget.ts
?   ?   ?
?   ?   ??? parsers/
?   ?   ?   ??? types.ts
?   ?   ?   ??? detector.ts           # Detect manifest type from filename
?   ?   ?   ??? packageJson.ts
?   ?   ?   ??? packageLockJson.ts
?   ?   ?   ??? yarnLock.ts
?   ?   ?   ??? pnpmLock.ts
?   ?   ?   ??? requirementsTxt.ts
?   ?   ?   ??? pipfileLock.ts
?   ?   ?   ??? pyprojectToml.ts
?   ?   ?   ??? poetryLock.ts
?   ?   ?   ??? gemfileLock.ts
?   ?   ?   ??? goMod.ts
?   ?   ?   ??? cargoToml.ts
?   ?   ?   ??? pomXml.ts
?   ?   ?   ??? gradleBuild.ts
?   ?   ?   ??? composerJson.ts
?   ?   ?
?   ?   ??? scoring/
?   ?   ?   ??? riskScore.ts
?   ?   ?   ??? trustScore.ts
?   ?   ?   ??? licenseRisk.ts
?   ?   ?
?   ?   ??? export/
?   ?   ?   ??? markdown.ts
?   ?   ?   ??? json.ts
?   ?   ?   ??? html.ts
?   ?   ?   ??? pdf.tsx
?   ?   ?
?   ?   ??? validation.ts
?   ?   ??? ecosystem.ts              # Ecosystem detection logic
?   ?   ??? rateLimiter.ts
?   ?   ??? keyManager.ts
?   ?
?   ??? store/
?   ?   ??? analysisStore.ts          # Zustand: current analysis state
?   ?   ??? settingsStore.ts          # Zustand: user preferences
?   ?   ??? batchStore.ts             # Zustand: batch analysis state
?   ?
?   ??? types/
?   ?   ??? analysis.ts               # Core domain types
?   ?   ??? vulnerability.ts
?   ?   ??? license.ts
?   ?   ??? scorecard.ts
?   ?   ??? report.ts
?   ?
?   ??? styles/
?       ??? globals.css               # Tailwind directives + custom vars
?
??? DEPENDENCIES.md                   # Why each dependency was chosen
??? SECURITY.md                       # Security policy + disclosure
??? .env.example
??? .eslintrc.json
??? .prettierrc
??? tailwind.config.ts
??? tsconfig.json
??? vite.config.ts
??? vercel.json
??? package.json
```

---

## 14. Implementation Phases

### Phase 1 ? Foundation (Week 1)

1. Project scaffolding with Vite + React + TypeScript + Tailwind
2. ESLint + security plugin + Prettier setup
3. Core type definitions (`src/types/`)
4. Settings store + LLM key manager
5. LLM provider implementations (all 9 providers)
6. Basic search bar UI + ecosystem detection

**Deliverable:** User can configure LLM provider and test connection

### Phase 2 ? Data Layer (Week 2)

1. All fetchers implemented with proper error handling
2. Orchestrator (`Promise.allSettled` coordinator)
3. Scoring algorithms (risk + trust)
4. Risk badge and score gauge components

**Deliverable:** Raw data fetched and scored for any npm/PyPI package

### Phase 3 ? Report UI (Week 3)

1. All report section components
2. Streaming LLM output into report sections
3. Progressive loading UX (per-source status indicators)
4. Threat model and license panel
5. Vulnerability table (sortable, filterable)

**Deliverable:** Full single-package report rendered

### Phase 4 ? File Ingestion (Week 4)

1. All manifest parsers
2. Drag-and-drop file upload UI
3. Dependency selector (checkbox table)
4. Batch analysis orchestrator with progress tracking
5. Batch summary report

**Deliverable:** Upload `package-lock.json` and get batch report

### Phase 5 ? Export & Polish (Week 5)

1. Markdown export
2. JSON export
3. HTML export (self-contained)
4. PDF export (`@react-pdf/renderer`)
5. Mobile responsiveness pass
6. Dark/light mode
7. Accessibility audit (keyboard navigation, ARIA labels, screen reader testing)

**Deliverable:** All exports working, production-ready UI

### Phase 6 ? Security Hardening & Deploy (Week 6)

1. CSP headers
2. CI/CD pipeline (GitHub Actions)
3. `npm audit` integration
4. OpenSSF Scorecard for the repo itself
5. Dependabot config
6. Deploy to Vercel
7. Custom domain + HSTS

**Deliverable:** Production deployment

---

## 15. Testing Requirements

### Unit Tests (`vitest`)

```
src/lib/parsers/          ? 100% coverage (parsers are pure functions)
src/lib/scoring/          ? 100% coverage
src/lib/validation.ts     ? 100% coverage
src/lib/llm/providers/    ? Mock API responses, test parsing
src/lib/export/           ? Snapshot tests for markdown/JSON output
```

### Integration Tests

```
Analysis flow: mock all external APIs ? assert complete report structure
Batch flow: mock manifest + APIs ? assert all packages processed
LLM streaming: mock SSE stream ? assert correct accumulation
```

### Security Tests

```
Input validation: fuzz test validatePackageInput with injection payloads
File upload: attempt XML bombs, huge files, binary files, path traversal names
API key masking: assert keys never appear in rendered DOM or console
CSP: use browser test to verify no blocked resources + no inline script violations
```

### Test Fixtures

Provide fixture files in `src/__fixtures__/`:
- Real-world manifest files (package-lock.json, requirements.txt, etc.)
- Mock API responses from all data sources
- Known-vulnerable package data for testing risk scoring

---

## Appendix A ? Known Limitations & Future Scope

| Limitation | Notes |
|---|---|
| No SBOM generation | CycloneDX / SPDX SBOM export is a natural next feature |
| No container image scanning | Would require a backend (Trivy, Grype) |
| No PR integration | GitHub App to comment on PRs is future work |
| Rate limits without auth | GitHub: 60 req/hr unauthenticated ? always encourage users to add token |
| LLM hallucination risk | System prompt instructs "do not invent data" ? but always verify CVE IDs |
| No real-time CVE alerting | Stateless app can't alert ? suggest pairing with Dependabot |
| Transitive dep depth | We scan direct deps' vulnerabilities; full transitive graph requires deeper API work |

## Appendix B ? SPDX License Risk Classification

| Risk | Licenses |
|---|---|
| LOW (permissive) | MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, CC0-1.0, Unlicense, 0BSD |
| MEDIUM (weak copyleft) | LGPL-2.0, LGPL-2.1, LGPL-3.0, MPL-2.0, CDDL-1.0, EPL-1.0, EPL-2.0 |
| HIGH (strong copyleft) | GPL-2.0, GPL-3.0, AGPL-3.0, OSL-3.0, EUPL-1.2 |
| VERY HIGH | SSPL-1.0, BUSL-1.1 (Business Source), proprietary/commercial |
| CRITICAL | UNLICENSED, no license found, custom restrictive |

## Appendix C ? Ecosystem Detection Rules

```typescript
function detectEcosystem(input: string): Ecosystem {
  if (input.startsWith('@') || input.includes('/') === false) return 'npm';
  if (input.match(/^[a-z][a-z0-9-]+$/)) return 'npm';                    // default
  if (input.includes('==') || input.includes('>=')) return 'pypi';        // requirements syntax
  if (input.startsWith('github.com/') && input.split('/').length === 3) return 'go';
  if (input.match(/^[a-z_]+$/)) return 'pypi';                           // Python naming
  if (input.includes(':')) return 'maven';                                // group:artifact
  if (input.match(/^[A-Z][a-zA-Z]+$/)) return 'nuget';                   // PascalCase
  return 'npm';
}
```

---

*End of TrustGuard AI Build Specification ? v1.0 ? 25 May 2026*
*Generated for use with Claude Code. All implementation decisions in this document are deliberate and security-reviewed.*