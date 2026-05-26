# TrustGuard AI — Future Improvements & Roadmap

**Last Updated:** 2026-05-26

---

## Implemented (completed, no longer pending)

- [x] Real OSV.dev integration (live API calls)
- [x] GitHub API stats (stars, forks, commits, contributors, author profile)
- [x] NPM Registry + downloads API
- [x] Structured security findings (13 categories, SecurityFindingsPanel)
- [x] Dependency CVE scanner (OSV batch query on direct deps)
- [x] Token usage tracking + cost estimation for all 9 providers
- [x] PDF, Markdown, JSON export
- [x] Secure Code Review Agent with multi-file source fetching
- [x] Score breakdowns (risk + trust) always visible
- [x] ExecutiveSummaryPanel, AlternativesPanel, RemediationPanel
- [x] 9 LLM providers: OpenAI, Anthropic, Gemini, Groq, Mistral, Together, Ollama, Zai, Zhipu
- [x] **Monorepo source code analysis** — `githubSource.ts` rewritten to detect monorepos (pnpm-workspace, lerna, rush, nx, turbo, workspaces), score and select the top 4 most security-relevant workspace directories, fetch files from subdirectories within each, and scan each subpackage's own `package.json` for install-time scripts
- [x] **Multi-pass chunked LLM analysis** — large monorepos are analysed in N silent "chunk findings" passes followed by one streaming synthesis pass; findings are deduplicated across passes and token usage is combined
- [x] **Source code fetch covers subdirectories** — workspace dirs include their `src/` subdirectory; root-only scan bug fixed (was the root cause of missed findings in Phase 7 testing against langwatch/langwatch)
- [x] **Best workflow file selection** — `.github/workflows/*.yml` files are scored by security relevance (publish/release > codeql > deploy > install > ci); highest-scoring file is picked rather than alphabetical-first
- [x] **Export parity** — all fields shown on-screen are now present in Markdown and PDF exports (`popularityLabel`, `latestRelease`, `watchers`, `authorPublicRepos`, `authorFollowers`, `alt.githubStars`, `alt.weeklyDownloads`, `alt.notableFeatures`); `packageStats` structural orphan bug in Markdown fixed
- [x] **Analysis progress indicators** — `AnalysisProgressBar` component with determinate percentage bar (multi-pass) and indeterminate shimmer (single-pass) shown in Executive Summary, Security Findings, and Threat Model panels during AI generation
- [x] **Risk gauge always red** — the risk score gauge renders in red regardless of score value; low-risk packages no longer misleadingly show a green gauge

---

## Planned — High Priority (Next Sprint)

### Batch Analysis UI & Export Overhaul
> Full design plan saved at: `.claude/plans/batch-export-ui-upgrade.md`

- [ ] **Batch live risk feed (RUNNING view)** — replace the 3-column card grid with a prioritised layout: sticky progress header with live risk tally; "High-Risk Alerts" section that auto-surfaces CRITICAL/HIGH packages the moment they complete; compact scanning queue; collapsed "clean packages" section
- [ ] **Batch results table (COMPLETE view)** — replace cards with a sortable/filterable/paginated table (50 rows/page): risk-tier filter tabs, package name search, sort by risk/trust/CVE count, ecosystem filter, left-border risk colour coding, single-row expand for CVE list + breakdown + recommendation
- [ ] **Batch summary dashboard** — five risk-tier counts (CRITICAL/HIGH/MEDIUM/LOW/SAFE) as clickable filter shortcuts; proportional colour bar; total CVEs stat; highest-risk and most-trusted quick facts
- [ ] **Batch Markdown export** — tiered document: CRITICAL/HIGH get full detail sections (CVE table + breakdown + recommendation); MEDIUM get condensed sections; LOW/SAFE go into an appendix table; auto-generated Table of Contents with anchor links
- [ ] **Batch PDF export** — cover page with risk summary bar + top-5 highest-risk packages; multi-page compact summary table (all packages); individual detail cards for CRITICAL/HIGH only; ≤ 30 pages for 200 packages
- [ ] **Batch JSON export improvement** — adds top-level `meta` and `summary` envelopes; packages sorted by risk score descending; backward-compatible with existing consumers

### Other High Priority

- [ ] **Transitive dependency scanning** — currently only direct deps from the manifest are scanned for CVEs; use deps.dev API or npm `ls --all` to walk the full transitive graph (likely requires a backend worker or WASM)
- [ ] **OpenSSF Scorecard fetcher** — fetch real scorecard data via `api.securityscorecards.dev`; currently the score is referenced in risk/trust scoring but always 0 because no real data is fetched
- [ ] **NVD cross-reference** — supplement OSV findings with NVD for CVSS scores and CWE IDs (OSV often lacks CVSS vectors)
- [ ] **PyPI / Go / Rust / Ruby source code fetching** — `unpkg.ts` is npm-only; non-npm packages without a GitHub URL get no source code fetch; add PyPI warehouse API, Go module proxy, crates.io download

---

## Planned — Medium Priority

- [ ] **Security findings in batch analysis** — `SecurityFindingsPanel` is wired for single-package reports only; batch item results contain no per-package AI findings (batch mode is metadata-only; full LLM analysis per batch item is out of scope but a summary finding count could be added)
- [ ] **SBOM Generation** — CycloneDX or SPDX export from batch or single analysis results for compliance pipelines
- [ ] **PR/MR Integration** — GitHub Actions bot that auto-comments TrustGuard AI reports on PRs when new dependencies are added to `package.json`
- [ ] **Light Mode Toggle** — currently dark-mode only; add `prefers-color-scheme` + manual toggle
- [ ] **Security findings confidence scoring** — the current `confirmed: boolean` flag is binary; a multi-tier scale (confirmed / likely / possible / speculative) would give analysts better signal
- [ ] **Link evidence to raw GitHub line URLs** — when evidence references a file + line number, render it as a clickable `github.com/…/blob/…#L{n}` link
- [ ] **Per-chunk findings surfaced in real time** — in multi-pass mode, show a live findings counter per chunk as it completes scanning, before the synthesis pass begins

---

## Planned — Low Priority / Long-Term

- [ ] **Custom Prompt Templates** — let users override the security analysis prompt (useful for teams with custom security policies)
- [ ] **Analysis History** — optional localStorage-based history with opt-in flag
- [ ] **Comparison Mode** — side-by-side view of two packages on the same page
- [ ] **Dependency Graph Visualization** — D3.js or Mermaid tree of direct + transitive deps, colour-coded by CVE count
- [ ] **Rate Limiting Dashboard** — show remaining GitHub API quota, warn before exhaustion
- [ ] **Accessibility Audit** — full WCAG 2.1 AA pass; current UI uses colour as sole differentiator in some places
- [ ] **i18n** — multi-language support for non-English developer teams
- [ ] **"Open full single-package report" from batch table** — drill into a batch item to get the full single-package report view (requires routing changes)
- [ ] **Batch re-scan of failed items** — re-run just the packages that returned errors without restarting the entire batch

---

## Security Enhancements

- [ ] **Subresource Integrity (SRI)** — for any CDN-loaded assets in the built HTML
- [ ] **Content Security Policy Reporting** — CSP violation reporting endpoint (requires backend)
- [ ] **Supply Chain Attestation** — SLSA provenance for TrustGuard AI's own build artifacts
- [ ] **Automated Dependency Updates** — Dependabot or Renovate config for TrustGuard AI's own dependencies
- [ ] **Binary/minified artifact detection** — flag when `dist/` or `build/` artifacts are committed to the repo root (common in malicious packages); currently the fetcher cannot reliably distinguish source from compiled output
