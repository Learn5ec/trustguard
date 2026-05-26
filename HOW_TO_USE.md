# How to Use TrustGuard AI

This guide outlines the workflows and features available in the TrustGuard AI platform.

---

## 🔑 Setup: AI and GitHub API Keys

To get started with deep analysis and code reviews:

1. Open the **Settings Drawer** by clicking the gear icon (⚙) in the top-right header.
2. Select your preferred LLM provider (e.g. Gemini, OpenAI, Anthropic Claude, Mistral, or local Ollama).
3. Paste your API key.
   > *Security note: Use API keys with the shortest viable expiry and minimum required permissions.*
4. *(Optional)* Provide a **GitHub Personal Access Token** to raise the GitHub API rate limit from 60 → 5,000 requests/hour. Required for scanning private repos.

---

## 🔍 Scanning Dependencies

You can scan dependencies in three ways:

### 1. By Package Name / Ecosystem
Enter a package identifier in the format `<ecosystem>:<package_name>@<version>`.

Examples:
- `npm:lodash@4.17.21`
- `pypi:requests@2.28.1`
- `lodash` *(ecosystem defaults to npm if omitted)*

### 2. By GitHub Repository URL
Paste a public or private GitHub repository URL:
- `https://github.com/langwatch/langwatch`
- `https://github.com/your-org/private-repo` *(requires GitHub token in Settings)*

**Monorepo handling:** If the repository is a monorepo (detected via `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, `nx.json`, `turbo.json`, or `workspaces` in `package.json`), TrustGuard AI automatically splits the source into multiple chunks — one per security-relevant workspace directory — and runs a separate LLM scan on each. Findings are merged and deduplicated before the final report is generated. Status messages in the analysis panel show which section is currently being scanned (e.g. *"Scanning code section 2 of 4: langwatch"*).

### 3. By Manifest File Upload
Drag and drop or click to upload a dependency manifest file. This triggers a **batch scan** of all detected dependencies.

Supported manifest formats: `package.json`, `package-lock.json`, `requirements.txt`, `.lock`, `.yaml`, `.toml`, `.xml`, `.gradle`, `.exs`

---

## ⏳ During Analysis: Progress Indicators

While the AI is generating the report, each panel shows a live progress bar:

- **Multi-pass (monorepo):** a determinate filling bar with a percentage counter — e.g. `Scanning code section 2 of 4 · 43%`. You can see exactly how far through the chunked scan you are.
- **Single-pass (simple repo / npm package):** a shimmering indeterminate bar — the AI is streaming its response and total time is not known in advance.

The status message log on the left side of the page provides additional detail at each stage (fetch → scoring → LLM scan → parse).

---

## 📊 Reviewing the Security Report

Once scanning completes, you receive a multi-tiered report:

### Risk & Trust Scores
Two animated gauges at the top of the report:
- **Risk Score (0–100):** Higher = more dangerous. Always shown in red — a low-risk score is informational, not a "green light". Click the breakdown table to see which factors contributed.
- **Trust Score (0–100):** Higher = more trustworthy. Colour-coded green→red. Based on adoption, activity, contributor health, and security signals.

### Security Findings (Secure Code Review Agent)
A structured card grid of findings produced by analysing the actual source code — not the README marketing text. Each finding includes:
- **Category** (e.g. `POSTINSTALL_RISK`, `SILENT_TELEMETRY`, `HARDCODED_SECRET`)
- **Severity** (CRITICAL / HIGH / MEDIUM / LOW / INFO)
- **Evidence** — exact file path and line/snippet reference
- **Recommendation** — concrete action to take
- **Confirmed / Suspected** flag — `✓ Confirmed` means directly observed in code; `? Suspected` means inferred

Use the severity filter tabs (ALL / CRITICAL / HIGH / MEDIUM / LOW) to focus on the most urgent findings.

### Code Review — Narrative Analysis
A 2–3 paragraph narrative describing what the code actually does, any security concerns, and the LLM's assessment — distinct from the structured findings panel above.

### Repository Metadata
Detailed stats: author profile, creation date, last push, last release, stars, forks, watchers, open issues, commit frequency, contributor count, weekly downloads, and dependents.

### STRIDE Threat Model
Six-dimension threat classification: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege — with an overall threat level (CRITICAL / HIGH / MEDIUM / LOW / MINIMAL).

### License Audit
Plain-English explanation of what you **can**, **cannot**, and **must** do under the package's license, plus commercial use status and risk level.

### Known Vulnerabilities
Table of CVEs from OSV.dev with severity, description, and affected version ranges. Also includes a separate **Dependency CVEs** section showing CVEs found in the package's own direct dependencies.

### Alternatives
Suggested alternative packages with stars, weekly downloads, migration difficulty, maintenance status, and notable features.

### Remediation Roadmap
Prioritised action list: IMMEDIATE → SHORT_TERM → LONG_TERM.

---

## 📦 Batch Analysis

Upload a manifest file (e.g. `package.json` or `requirements.txt`) to analyse all dependencies at once:

1. The dependency selector shows all detected packages — toggle individual items or use "Select All / Deselect All".
2. Click **Run Analysis** to start scanning (5 packages in parallel).
3. A progress bar and per-package status cards show real-time progress.
4. When complete, export results as JSON using the **Export Batch JSON** button.

> Note: Batch mode runs metadata-only scans (CVE data, GitHub stats, risk/trust scores). Full LLM code analysis is available in single-package mode only.

---

## 💾 Exporting Reports

Use the **Export Report** dropdown in the header to download in three formats:

| Format | Contents |
|--------|----------|
| **JSON** | Full machine-readable data — all package fields, security findings, token usage |
| **Markdown** | Human-readable document — all sections including CVE tables, findings, alternatives with stars/downloads/features, metadata |
| **PDF** | Print-ready document via `@react-pdf/renderer` — same content as Markdown in a formatted layout |

> HTML export is not available. Use Markdown (renders in GitHub, VS Code, Obsidian) or PDF for sharing.

---

## 🔒 Security & Privacy

- **No data retention:** TrustGuard AI makes all LLM calls directly from your browser to the provider's API. No data passes through TrustGuard AI's servers.
- **API keys:** Stored in `sessionStorage` only — automatically cleared when the browser tab is closed; never written to disk, localStorage, or cookies.
- **GitHub token:** Same sessionStorage treatment; only ever sent to `api.github.com`.
- **Misuse responsibility:** Any misuse of security information obtained via TrustGuard AI is entirely the responsibility of the user. This tool must not be used to target systems without explicit authorisation.
