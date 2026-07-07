# TrustGuard AI — Bugs & Fixes Plan

**Date:** 2026-05-25  
**Author:** Claude Code (audit pass)

---

## 0. High-Level Goals

1. Fix all confirmed logic/data bugs found by testing real APIs
2. Make Risk and Trust scores transparent with always-visible breakdowns
3. Surface all LLM-generated sections that are currently computed but never rendered
4. Add richer developer-relevant metadata (commit frequency, author profile, dependents, latest safe version)
5. Upgrade the Secure Code Review Agent to read multiple real source files
6. Revamp the Trust Score to reflect real community signals
7. Clean up exports (remove broken HTML export, fix PDF print styles, improve Markdown)
8. Add user disclaimer
9. Clean up development scripts (hardcoded keys, wrong paths)

---

## 1. Confirmed Bugs

### B1 — Input parser: `npm:pkg@version` format breaks everything
**File:** `src/lib/validation.ts`, `src/components/input/SearchBar.tsx`  
**Problem:** The placeholder text shows `npm:lodash@4.17.21` but the code never strips the `npm:` prefix or parses the `@version` suffix. This means:
- `fetchNPMRegistry('npm:lodash')` → HTTP 404
- `fetchOSV('lodash@4.17.21', 'npm')` → 0 vulnerabilities (wrong name match)
- `fetchNPMRegistry('@types/node@18.0.0')` → HTTP 404  
**Fix:** In `validation.ts`, add a pre-processing step that:
  - Strips ecosystem prefixes: `npm:`, `pypi:`, `go:`, `maven:`, `nuget:`
  - Splits `pkg@version` → `{ name: pkg, version: version }`
  - Passes the clean name + version to `startAnalysis`
  - Updates `SearchBar.tsx` to pass the extracted version instead of always `'latest'`

### B2 — OSV query uses `'github'` as ecosystem (invalid)
**File:** `src/lib/fetchers/osv.ts`  
**Problem:** `mapToOsvEcosystem('github')` returns `'github'` which OSV rejects with `"Invalid ecosystem."` The error is silently swallowed.  
**Fix:** When `ecosystem === 'github'`, skip the OSV query entirely (return `[]`). OSV doesn't index raw GitHub repos — CVEs come through package managers.

### B3 — GitHub `.git` suffix passes validation but breaks API call
**File:** `src/lib/validation.ts`, `src/lib/fetchers/github.ts`  
**Problem:** The regex `[a-zA-Z0-9_.-]+` allows `express.git` as a repo name. GitHub API returns 404 for `repos/expressjs/express.git`.  
**Fix:** In `fetchGitHubStats` and `fetchGitHubRepoSourceCode`, strip `.git` suffix from the extracted repo name before the API call.

### B4 — Trust score penalises GitHub repos for "Low Adoption" (-20)
**File:** `src/lib/scoring/trustScore.ts`  
**Problem:** When ecosystem is `github`, there are no `packageStats`, so `weeklyDownloads = 0`, triggering the "Extremely low weekly downloads" penalty even for repos with 50k+ stars.  
**Fix:** Gate the download-based deductions on `ecosystem === 'npm' || ecosystem === 'pypi'`. For GitHub repos, substitute star/fork count as the community-adoption signal.

### B5 — Wrong fallback GitHub URL guess
**File:** `src/lib/fetchers/orchestrator.ts` line 49  
**Problem:** `fetchGitHubStats('https://github.com/${packageName}/${packageName}')` — this guesses `lodash/lodash` which only works by coincidence. Most packages are `owner/repo` not `name/name`.  
**Fix:** Remove the broken guess. If no GitHub URL is found from npm registry data, set `github` to `null` rather than attempting a wrong URL.

### B6 — `ecosystem.ts`: GitHub HTTPS URLs misclassified as `maven`
**File:** `src/lib/ecosystem.ts`  
**Problem:** `https://github.com/foo/bar` doesn't start with `@` and contains `/`, so it falls through to `if (input.includes(':')) return 'maven'` because the URL contains `:` (in `https:`).  
**Fix:** This code path is not reached for GitHub URLs because `validatePackageInput` catches them first. But as defensive fix, add a guard at the top: `if (input.startsWith('https://')) return 'github';`

### B7 — Missing UI sections: executiveSummary, alternatives, remediationSteps, developerVerdict
**File:** `src/components/report/ReportContainer.tsx`  
**Problem:** The LLM generates `executiveSummary`, `alternatives[]`, `remediationSteps[]`, and `developerVerdict` — but **none of these are rendered in the UI**. Users never see the AI's key recommendations.  
**Fix:** Add four new panels to `ReportContainer.tsx`:
- `ExecutiveSummaryPanel` — the 2-3 sentence verdict at the top
- `DeveloperVerdictBadge` — USE / USE_WITH_CAUTION / AVOID / REPLACE_SOON badge in header
- `AlternativesPanel` — cards for each alternative package
- `RemediationPanel` — prioritised action items (IMMEDIATE / SHORT_TERM / LONG_TERM)

### B8 — npm weekly downloads always 0
**File:** `src/lib/fetchers/orchestrator.ts`, `src/lib/fetchers/npm.ts`  
**Problem:** `packageStats.weeklyDownloads` is hardcoded to `0`. The npm registry doesn't return download counts — there's a separate API for that.  
**Fix:** Add a call to `https://api.npmjs.org/downloads/point/last-week/{packageName}` in `fetchNPMRegistry` and populate `weeklyDownloads`.

### B9 — Hardcoded Mistral API key in dev script
**File:** `scripts/run_analysis.ts` line 26  
**Problem:** `const apiKey = 'KXT1hTkmQkJJ7nAp89CshHfZYZKl8PA8'` — a real API key is hardcoded.  
**Fix:** Move to `process.env.MISTRAL_API_KEY` with a clear error if missing.

### B10 — Wrong reports directory path in dev script  
**File:** `scripts/run_analysis.ts` line 17  
**Problem:** `path.join(__dirname, '../../reports')` resolves to `/home/web-h-056/reports` (outside the project). Should be `../reports` to land in `/home/web-h-056/trustguard/reports`.  
**Fix:** Change to `path.join(__dirname, '../reports')`.

### B11 — Hardcoded Gemini artifact path in dev script
**File:** `scripts/run_analysis.ts` line 262  
**Problem:** Absolute path to a personal Gemini workspace is hardcoded.  
**Fix:** Remove the artifact-copy block entirely.

### B12 — Markdown export is thin (missing alternatives, remediation, executive summary)
**File:** `src/lib/export/ReportExporter.ts`  
**Problem:** `generateMarkdown()` only outputs threat model and license as raw objects (not formatted), misses alternatives and remediation steps.  
**Fix:** Replace the generateMarkdown implementation with the rich format already used in `scripts/run_analysis.ts`'s `generateFullMarkdown`.

### B13 — HTML export is broken (no real CSS, raw JS object output for nested fields)
**File:** `src/lib/export/ReportExporter.ts`, `src/components/report/ReportContainer.tsx`  
**Fix:** Remove the HTML export button and `generateHTML` method entirely.

---

## 2. Score Transparency

### S1 — Risk Score breakdown always visible (not just on hover tooltip)
**Current:** Score factors are in a hover-only tooltip.  
**Fix:** Replace the tooltip with a persistent expandable breakdown panel below each score gauge showing:
- Each factor name, its numeric contribution (+X points), and 1-line reason
- Total formula: `Risk = Vulns(0-40) + Maintenance(0-25) + Archived(+20) + IssueBacklog(+5) + Scorecard(0-20) + License(0-10) + TransitiveRisks(0-5)`
- A "What is Risk Score?" link/tooltip explaining the methodology

### S2 — Trust Score breakdown always visible
**Current:** Same hover-only tooltip.  
**Fix:** Same treatment as S1. Show breakdown panel with:
- Each deduction/bonus and why
- Total formula: `Trust = 100 - RiskMirror(0-40) ± Scorecard(varies) - Downloads/Stars penalty - UnsignedReleases(-10) - RecentCriticalCVE(-15)`
- "What is Trust Score?" methodology note

---

## 3. New Developer Metadata

### M1 — Commit frequency (last 30/90 days)
**Source:** `GET /repos/{owner}/{repo}/commits?since=<date>&per_page=1` with `Link` header to count  
**Alternative (lighter):** Fetch `/repos/{owner}/{repo}/commits?per_page=100&since=90days` and count results  
**Display:** "~X commits in last 90 days" badge on RepoMetadataPanel

### M2 — Author/org profile: repo count + follower count
**Source:** `GET /users/{login}` → `public_repos`, `followers`  
**Display:** Row in RepoMetadataPanel below owner name: "X public repos • Y followers"

### M3 — Contributor count (actual, not 0)
**Source:** `GET /repos/{owner}/{repo}/contributors?per_page=1` with `Link: ...; rel="last"` header gives total page count → multiply by per_page  
**Alternative:** `GET /repos/{owner}/{repo}/contributors?anon=1&per_page=100` and count  
**Display:** Add "Contributors" card to the 4-card grid in RepoMetadataPanel

### M4 — npm dependents count (how many packages depend on this)
**Source:** `https://registry.npmjs.org/-/v1/search?text=dependencies:${name}&size=1` → `total` field  
**Display:** "Used by ~X packages" signal in Trust Score and metadata panel

### M5 — Latest stable version + latest secure version
**Source (npm):** Already in `dist-tags.latest`. Latest secure = latest version without any open CVEs  
**Source (GitHub):** `GET /repos/{owner}/{repo}/releases/latest` → `tag_name`  
**Display:** Header banner shows: `Latest: v1.2.3` and `Latest Secure: v1.2.1 ✓` (if different from latest due to CVE)

### M6 — Repo popularity signal (relative to ecosystem)
**Display:** Computed label based on stars:
- < 100 stars → "Niche"
- 100–1k → "Small community"
- 1k–10k → "Established"
- 10k–50k → "Popular"
- 50k+ → "Industry Standard"

---

## 4. Trust Score Revamp

### T1 — Factor: Community Adoption (replaces broken download-only approach)
**Signals (weighted):**
- npm weekly downloads: < 1k → −15, 1k–100k → −5, 100k–1M → 0, > 1M → +5
- GitHub stars: < 50 → −10, 50–1k → −5, 1k–10k → 0, > 10k → +5
- Dependents count: < 10 → −5, > 1k → +5

### T2 — Factor: Contributor health
- Single maintainer (contributors ≤ 1) → −10 ("bus factor 1")
- 2–5 contributors → 0
- > 10 contributors → +5

### T3 — Factor: Commit frequency
- No commits in 12 months → −15 (already covered by risk maintenance score but reflected in trust too)
- Active (≥ 1 commit/month last 90 days) → +5

### T4 — Scorecard/community signals from LLM
The LLM prompt will be given the community metadata and asked to synthesise a "community trust assessment" sentence reflecting user sentiment, blog reputation, etc.  
This is surfaced in the Executive Summary, not the numeric score.

---

## 5. Secure Code Review Agent Upgrade

### C1 — Read multiple files, not just one entry point
**Current:** Fetches only `pkgJson.main` or the first code file.  
**Fix (`src/lib/fetchers/githubSource.ts`):** Fetch up to **5 key files**:
1. `README.md` — surface what it claims
2. Main entry point (from `package.json` `main`/`module`)
3. `index.js` / `index.ts` / `main.py` / etc.
4. Any file named `auth`, `crypto`, `eval`, `exec` (security-sensitive names)
5. `package.json` / `setup.py` / `go.mod` (dependency manifest)

Concatenate with clear `--- FILE: path ---` separators, truncate total to 30k chars.

### C2 — Instruction to LLM: do not just summarise README
**Current prompt instruction:** `"perform a Secure Code Review"`  
**Fix:** Strengthen the instruction: 
> "Read the provided source files literally — not the README marketing text. Identify: (1) what the code actually does at runtime, (2) any use of `eval`/`exec`/`Function()`, (3) outbound network calls, (4) file system access, (5) hardcoded credentials or tokens, (6) dangerous patterns like prototype pollution, command injection, path traversal. State findings as facts from the code, not assumptions."

---

## 6. Export Cleanup

### E1 — Remove HTML export
Delete `generateHTML()` from `ReportExporter.ts` and remove the "Export HTML" button from `ReportContainer.tsx`.

### E2 — Fix PDF export (Print to PDF)
Add a `<style media="print">` block in `index.css` / `index.html` that:
- Sets white background, black text
- Prints all sections (no truncation)
- Removes the header/nav buttons
- Formats tables properly
- Shows score numbers prominently

### E3 — Fix Markdown export
Replace thin `generateMarkdown()` with the rich version from `run_analysis.ts`, including:
- Executive Summary
- Score breakdown
- Repository metadata
- STRIDE threat model table
- License analysis
- Vulnerability table
- Alternatives (with all fields)
- Remediation steps

---

## 7. Frontend Disclaimer

### D1 — Disclaimer on LandingPage
Add a dismissible banner at the bottom of the landing page:
> "⚠️ Disclaimer: TrustGuard AI is a research and due-diligence tool for developers. All analysis is automated and may be incomplete. The misuse of security information obtained through this tool is entirely the responsibility of the user. Do not use TrustGuard AI to target systems you do not own or have explicit permission to analyse."

### D2 — Footer note on report page
Small text at bottom of every report:
> "Report generated by TrustGuard AI on {date}. Automated analysis — verify critical findings independently."

---

## 8. Implementation Order

| Priority | Item | Files Affected |
|---|---|---|
| 🔴 CRITICAL | B1 — Input prefix/version parsing | `validation.ts`, `SearchBar.tsx` |
| 🔴 CRITICAL | B2 — Skip OSV for GitHub | `osv.ts` |
| 🔴 CRITICAL | B7 — Render missing UI sections | `ReportContainer.tsx` + 3 new components |
| 🔴 CRITICAL | B3 — Strip `.git` suffix | `github.ts`, `githubSource.ts` |
| 🟠 HIGH | B4 — Trust score GitHub bias | `trustScore.ts` |
| 🟠 HIGH | B5 — Remove wrong fallback GitHub URL | `orchestrator.ts` |
| 🟠 HIGH | B8 — Fetch real npm downloads | `npm.ts`, `orchestrator.ts` |
| 🟠 HIGH | S1/S2 — Score breakdown visible | `ReportContainer.tsx` |
| 🟠 HIGH | M5 — Latest version display | `types/analysis.ts`, `orchestrator.ts`, `github.ts` |
| 🟡 MEDIUM | M1–M4 — New metadata fetches | `github.ts`, `npm.ts`, `orchestrator.ts`, `types/analysis.ts` |
| 🟡 MEDIUM | T1–T3 — Trust score revamp | `trustScore.ts` |
| 🟡 MEDIUM | C1–C2 — Multi-file code review | `githubSource.ts`, `unpkg.ts`, `prompts.ts` |
| 🟡 MEDIUM | E1 — Remove HTML export | `ReportExporter.ts`, `ReportContainer.tsx` |
| 🟡 MEDIUM | E2/E3 — Fix PDF + Markdown | `index.css`, `ReportExporter.ts` |
| 🟡 MEDIUM | D1/D2 — Disclaimer | `LandingPage.tsx`, `ReportContainer.tsx` |
| 🟢 LOW | B6 — `ecosystem.ts` HTTPS guard | `ecosystem.ts` |
| 🟢 LOW | B9–B11 — Script cleanup | `scripts/run_analysis.ts` |
| 🟢 LOW | B12/B13 — Export cleanup | `ReportExporter.ts` |

---

## 9. Files to Create (New)

| File | Purpose |
|---|---|
| `src/components/report/ExecutiveSummaryPanel.tsx` | Renders AI executive summary + verdict badge |
| `src/components/report/AlternativesPanel.tsx` | Cards for alternative packages |
| `src/components/report/RemediationPanel.tsx` | Prioritised remediation steps |
| `src/components/report/ScoreBreakdownPanel.tsx` | Always-visible score factor table (replaces tooltip-only) |

## 10. Files to Modify (Existing)

| File | Changes |
|---|---|
| `src/lib/validation.ts` | Add prefix stripping + @version parsing |
| `src/components/input/SearchBar.tsx` | Pass extracted version, not hardcoded 'latest' |
| `src/lib/fetchers/osv.ts` | Skip GitHub ecosystem, silence invalid ecosystem error |
| `src/lib/fetchers/github.ts` | Strip .git, fetch contributor count + commits + author profile + releases |
| `src/lib/fetchers/githubSource.ts` | Multi-file fetch (5 files, 30k char limit) |
| `src/lib/fetchers/unpkg.ts` | Fetch multiple files for npm packages |
| `src/lib/fetchers/npm.ts` | Add downloads API call |
| `src/lib/fetchers/orchestrator.ts` | Remove wrong fallback URL, add version resolution |
| `src/lib/scoring/trustScore.ts` | Add contributor/commits/dependents/stars signals |
| `src/lib/scoring/riskScore.ts` | Minor: improve descriptions |
| `src/lib/llm/prompts.ts` | Stronger code review instruction, include new metadata |
| `src/lib/export/ReportExporter.ts` | Remove generateHTML, enrich generateMarkdown |
| `src/types/analysis.ts` | Add fields: latestVersion, latestSecureVersion, contributorsCount (fix), commitFrequency, authorPublicRepos, authorFollowers, dependentsCount, popularityLabel |
| `src/components/report/ReportContainer.tsx` | Add new panels, score breakdowns, disclaimer |
| `src/components/layout/LandingPage.tsx` | Add disclaimer banner |
| `src/index.css` | Add print styles |
| `scripts/run_analysis.ts` | Remove hardcoded key/path |

---

*This plan covers all bugs and feature additions discussed. Implementation follows this document.*
