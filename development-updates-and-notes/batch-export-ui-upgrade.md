# Batch Analysis — UI Overhaul + Multi-Format Export

## 0. Background & Scope

The current batch analysis view (`BatchProgress.tsx`) renders every selected package as an
equal-sized card in a 3-column grid.  That layout breaks down completely at 50+ packages and
becomes unusable at 200+: the page becomes a wall of identically-sized cards that the user
must scroll through without any way to sort, filter, or navigate.

This plan delivers three things:

1. **Redesigned RUNNING view** — a live "risk feed" that surfaces dangerous packages the
   moment they are found, rather than making the user hunt through a static grid.
2. **Redesigned COMPLETE view** — a sortable, filterable, searchable table with expandable
   detail rows and a summary dashboard; designed to remain usable at 200+ rows.
3. **Multi-format export** — Markdown, PDF, and an improved JSON format, each structured so a
   human reader can navigate a 200-package report without losing context.

> **Scope boundary.** Batch analysis currently runs metadata-only scans
> (`analyzePackage()` — OSV.dev + GitHub + registry stats).  It does **not** call the LLM for
> each package (that would mean 200+ LLM calls, which is impractical and expensive).  Batch
> reports therefore contain: risk score, trust score, known CVEs, GitHub/registry stats, and
> licence data — but no AI-generated executive summary, security findings, or threat model.
> The LLM-rich single-package view remains the place to deep-dive into one dependency.

---

## 1. UI/UX Design

### 1.1  RUNNING state — Live Risk Feed

**Core principle:** surface danger immediately; don't make the user scroll 200 cards to find
out that lodash is CRITICAL.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  🔍  Batch Scan — package-lock.json · 200 packages selected                  │
│                                                                               │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░  83 / 200   (42%)   ⏱ ~3 min left │
│                                                                               │
│  Live tally:  2 ⛔ CRITICAL  ·  6 🔴 HIGH  ·  19 🟡 MEDIUM  ·  56 ✅ done  │
└───────────────────────────────────────────────────────────────────────────────┘

┌── 🚨  High-Risk Alerts  (auto-surfaced as packages complete) ─────────────────┐
│  ⛔ lodash@4.17.20    npm   Risk 94/100   3 CVEs   ← just found               │
│  ⛔ jquery@2.0.0      npm   Risk 91/100   5 CVEs                              │
│  🔴 axios@0.21.1      npm   Risk 78/100   2 CVEs                              │
│  🔴 minimist@1.2.5    npm   Risk 74/100   1 CVE                               │
└───────────────────────────────────────────────────────────────────────────────┘

┌── ✅  Completed — Low & Safe  (compact, newest first)  [show all 52 ▾] ───────┐
│  react@18.2.0         Risk 12   Trust 92   0 CVEs                            │
│  typescript@5.0.4     Risk  8   Trust 95   0 CVEs                            │
│  eslint@8.50.0        Risk 15   Trust 89   0 CVEs                            │
│  … 49 more completed packages                                                  │
└───────────────────────────────────────────────────────────────────────────────┘

┌── ⏳  Scanning Queue  (5 in parallel at any time) ────────────────────────────┐
│  ⟳ webpack@5.88.0   ⟳ babel-core@7.22.1   ⟳ moment@2.29.4                │
│  ⟳ express@4.18.2   ⟳ uuid@9.0.0                                           │
│  ● chalk@5.3.0  ● commander@11.0.0  ● dotenv@16.3.1  (+112 pending)         │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Design rules for the RUNNING view:**

- **Progress bar** is sticky at the top of the batch container (not the page header) so it is
  always visible while the user reads partial results below.
- **Live tally** updates in real-time: counts of CRITICAL/HIGH completed so far.  This is the
  most important single line — the user can decide to cancel and act immediately if they see
  "5 CRITICAL" before all 200 are done.
- **High-Risk Alerts section** appears only when the first CRITICAL or HIGH package is found
  (≥ 60 risk score).  New entries slide in at the top of this section (newest first).
  The section is always fully expanded — no pagination — because the number of CRITICAL/HIGH
  packages should normally be small (< 20).
- **Completed / Low-Safe section** is collapsed by default (shows 3 rows + "show all N ▾")
  to keep the viewport focused on risk.  The user can expand it if they want to browse
  completed clean packages while scanning continues.
- **Scanning Queue** shows the 5 currently active packages with a spinning indicator and the
  remaining pending packages as a compact inline list with a "+N pending" overflow label.
  No individual cards.  This section's purpose is solely to show that progress is happening.
- The **CRITICAL** / **HIGH** risk boundary is defined as risk score ≥ 70 for CRITICAL
  (mapped from `RiskBadge`'s existing thresholds), ≥ 50 for HIGH.
- **No individual expandable cards during RUNNING.** Detail is reserved for the COMPLETE view.

---

### 1.2  COMPLETE state — Summary Dashboard + Smart Table

The COMPLETE view is the primary deliverable.  It must be usable as a standalone report for
a developer or security engineer reviewing a project's full dependency tree.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  📊  Batch Report — 200 packages analysed from package-lock.json             │
│  Generated 2026-05-26                                                         │
│                                                                               │
│  [⬇ Export PDF]  [⬇ Export Markdown]  [⬇ Export JSON]  [← New Analysis]    │
└───────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────── Summary Dashboard ─────────────────────────────────────┐
│                                                                               │
│   2  ⛔ CRITICAL    8  🔴 HIGH    34  🟡 MEDIUM    87  🔵 LOW    69  ✅ SAFE  │
│   ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
│                                                                               │
│   Total known CVEs: 47    Packages with CVEs: 18    Ecosystems: npm, PyPI    │
│   Highest risk: lodash@4.17.20 (94/100)    Most trusted: react@18.2.0 (95)  │
└───────────────────────────────────────────────────────────────────────────────┘

┌─────────── Filters & Sort ────────────────────────────────────────────────────┐
│  [ALL 200]  [⛔ CRITICAL 2]  [🔴 HIGH 8]  [🟡 MEDIUM 34]  [LOW+ 156]       │
│                                                                               │
│  🔍 Search packages...   Sort: [Risk Score ▼]   Eco: [All ▼]               │
│  ☐ Has CVEs only   ☐ Has known vulnerabilities only   ☐ Failed only         │
└───────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────── Packages Table ───────────────────────────────┐
│  Package              Eco   Version   Risk  Trust  CVEs  License   ▸ Expand  │
├───────────────────────────────────────────────────────────────────────────────┤
│  ⛔ lodash            npm   4.17.20   94    42     3     MIT       ▸         │
│  ┌─ Expanded Detail ──────────────────────────────────────────────────────┐  │
│  │  CVEs: CVE-2021-23337 (HIGH), CVE-2019-10744 (HIGH), CVE-2018-16487   │  │
│  │  Risk breakdown: Vuln impact +40, Maintenance -8, Active dev +5        │  │
│  │  GitHub: 59k★  Last commit: 2023-09  Issues: 143  Contributors: 347   │  │
│  │  💡 Upgrade to 4.17.21 (latest secure)                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ⛔ jquery            npm   2.0.0     91    38     5     MIT       ▸         │
│  🔴 axios             npm   0.21.1    78    65     2     MIT       ▸         │
│  🔴 minimist          npm   1.2.5     74    58     1     MIT       ▸         │
│  …                                                                             │
│  ✅ react             npm   18.2.0    12    92     0     MIT       ▸         │
│                                                                               │
│  Showing 1–50 of 200   [< Prev]  [1] [2] [3] [4]  [Next >]                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Design rules for the COMPLETE view:**

#### Summary Dashboard
- The five risk-tier counts (CRITICAL / HIGH / MEDIUM / LOW / SAFE) are displayed as large
  coloured numbers, not badges.  Each is **clickable and acts as a filter** — clicking
  "CRITICAL 2" immediately filters the table to just those 2 rows.
- A proportional horizontal bar beneath the counts gives an instant at-a-glance sense of
  the portfolio's overall health.  Colour-coded segments: red / orange / yellow / blue / green.
- Three single-line stats below: total CVEs, total packages with CVEs, ecosystems seen.
- "Highest risk" and "Most trusted" quick facts.

#### Filter Bar
- **Risk tier tabs** (ALL / CRITICAL / HIGH / MEDIUM / LOW+) are the primary navigation
  tool.  Active tab shows count and has an accent underline.
- **Search box** filters by package name in real-time (debounced 150 ms); matching characters
  are highlighted in the table.
- **Sort** defaults to Risk Score descending (most dangerous first).  Other sort options:
  Trust Score, CVE Count, Package Name (A→Z), Ecosystem.
- **Ecosystem filter** is a dropdown.  Only ecosystems actually present in the batch appear
  as options (e.g. "npm", "PyPI", "github").
- **Checkbox filters:** "Has CVEs only" / "Failed only" narrow the table without changing
  the active tab.
- All filters are **composable** (e.g. "MEDIUM tab + PyPI filter + search 'boto'").
- Filter/sort state is preserved in the URL hash so the user can share a filtered link
  or use browser Back/Forward.

#### Packages Table
- **Columns:** Risk icon + Name (monospace, truncated at 30 chars with full name on hover),
  Ecosystem chip, Version, Risk Score (number, left-bar colour indicator), Trust Score,
  CVE Count (red if > 0), License, expand chevron.
- **Default sort:** Risk Score descending (CRITICAL rows at top).
- **Row colour coding:**
  - Left border: 3px red (CRITICAL ≥ 80), orange (HIGH 60–79), yellow (MEDIUM 40–59),
    blue (LOW 20–39), no border (safe < 20).
  - Row background: very subtle tint of the same colour at 5% opacity.
- **Failed rows** appear at the bottom with a grey "⚠ Scan failed" label and the error
  message in the expand section.
- **Pagination:** 50 rows per page.  Page selector shown when filtered set > 50 rows.
  "Show all" option available but discouraged (browser slowdown at 200 rows).

#### Expandable Row Detail
- Clicking the ▸ chevron (or anywhere on the row) toggles an inline detail panel
  **below that row** (not a modal, not a sidebar — inline keeps context).
- The detail panel shows:
  - **CVE list:** CVE-ID, severity badge, description (first 120 chars), "view on OSV.dev"
    link.
  - **Risk breakdown:** scored factors listed vertically (same ScoreBreakdownTable used in
    single-package view).
  - **Trust breakdown** (same pattern).
  - **GitHub/registry stats:** stars, forks, last commit, weekly downloads, dependents —
    in a compact two-column grid.
  - **License plain-English note** (one sentence from the licence type, e.g. "MIT —
    permissive, no restrictions on use or distribution").
  - **Recommended action:** if riskScore ≥ 60, a highlighted remediation suggestion
    ("Upgrade to 4.17.21 — latest secure version") or "No direct upgrade available —
    consider replacing with X" if no safe version exists in `latestSecureVersion`.
- Only **one row** can be expanded at a time (expanding a second row collapses the first).
  This keeps the page length manageable.
- The expand panel has a subtle slide-down animation (200 ms ease-out).

---

### 1.3  DependencySelector (SELECTING state) — minor polish only

The SELECTING state table is functional and doesn't need a redesign.  Two small improvements:
- Add a **risk preview column** (if a prior batch result exists for the same package) so the
  user can make informed exclusion decisions.
- Change the "Run Batch Analysis" button label to show the selected count:
  "Run Analysis on 187 packages" — makes the action feel concrete.

---

## 2. Export Formats

All three exports are triggered from the **COMPLETE view only** (not during RUNNING).

### 2.1  Markdown Export

Target reader: developer reviewing output in GitHub/GitLab, VS Code, or any Markdown renderer.

**Structure:**

```markdown
# TrustGuard AI Batch Report — 200 Packages
Generated: 2026-05-26 · Source: package-lock.json

## Executive Summary

| Tier       | Count | Packages                                |
|------------|-------|-----------------------------------------|
| ⛔ CRITICAL |     2 | lodash@4.17.20, jquery@2.0.0           |
| 🔴 HIGH     |     8 | axios@0.21.1, minimist@1.2.5, …        |
| 🟡 MEDIUM   |    34 | (see section below)                     |
| 🔵 LOW      |    87 | (see appendix)                          |
| ✅ SAFE     |    69 | (see appendix)                          |

**Total known CVEs:** 47 across 18 packages
**Action required:** 10 packages need immediate attention (CRITICAL + HIGH)

---

## 🚨 Critical Risk Packages (Risk Score ≥ 80)

### lodash@4.17.20 · npm · Risk: 94/100 · Trust: 42/100

**Known Vulnerabilities (3)**
| CVE ID | Severity | Title |
|--------|----------|-------|
| CVE-2021-23337 | HIGH | Command injection via template |
| CVE-2019-10744 | HIGH | Prototype pollution via defaultsDeep |
| CVE-2018-16487 | MEDIUM | Prototype pollution via merge |

**Risk Factors**
- Vulnerability impact: +40
- Unmaintained (last commit > 18 months): +20
- ...

**Recommendation:** Upgrade to `lodash@4.17.21` (latest secure version).

---

### jquery@2.0.0 · npm · Risk: 91/100 · Trust: 38/100
…

---

## 🔴 High Risk Packages (Risk Score 60–79)

### axios@0.21.1 · npm · Risk: 78/100 · Trust: 65/100
…

---

## 🟡 Medium Risk Packages (Risk Score 40–59)

(One subsection per package, same structure, less verbose)

---

## Appendix A — Low & Safe Packages

| Package | Ecosystem | Version | Risk | Trust | CVEs | License |
|---------|-----------|---------|------|-------|------|---------|
| react | npm | 18.2.0 | 12 | 92 | 0 | MIT |
| typescript | npm | 5.0.4 | 8 | 95 | 0 | Apache-2.0 |
…

---

## Appendix B — Failed Scans

| Package | Ecosystem | Version | Error |
|---------|-----------|---------|-------|
| some-private-pkg | npm | 1.0.0 | 404 Not found on registry |

---
*Report generated by TrustGuard AI · Results are automated analysis — verify critical findings independently.*
```

**Key decisions:**
- CRITICAL and HIGH packages get **full detail sections** (CVE table + risk factors +
  recommendation).
- MEDIUM packages get **condensed sections** (summary + CVE table, no full breakdown).
- LOW and SAFE packages go into **Appendix A as a compact table** — no individual sections.
  This keeps the main document readable while preserving all data.
- A **Table of Contents** is generated at the top (each package name is an H3 anchor that
  renders as a clickable link in GitHub Markdown).
- File name pattern: `trustguard-batch-YYYY-MM-DD.md`

---

### 2.2  PDF Export

Target reader: security engineer, team lead, or auditor who wants a printable/shareable
document.  Must look professional without requiring the user to scroll forever.

**Page structure:**

**Page 1 — Cover / Summary**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   TrustGuard AI Batch Security Report                              │
│   200 packages · npm · 2026-05-26                             │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  CRITICAL   HIGH   MEDIUM    LOW    SAFE              │    │
│   │     2        8       34      87      69               │    │
│   │  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   47 known CVEs across 18 packages                            │
│   10 packages require immediate action                        │
│                                                                │
│   Top risks:                                                   │
│     1. lodash@4.17.20    (CRITICAL, 3 CVEs)                   │
│     2. jquery@2.0.0      (CRITICAL, 5 CVEs)                   │
│     3. axios@0.21.1      (HIGH, 2 CVEs)                       │
│     4. minimist@1.2.5    (HIGH, 1 CVE)                        │
│     5. moment@2.29.4     (HIGH, 0 CVEs, deprecated)           │
└────────────────────────────────────────────────────────────────┘
```

**Page 2+ — Summary Table (multi-page)**
- A compact table: Package | Eco | Version | Risk | Trust | CVEs | License | Action
- One row per package.  Font size 8pt.  Row background tinted by risk tier.
- Fits ~40 rows per page.  For 200 packages = ~5 pages.
- A page header on every page: "TrustGuard AI Batch Report — packages 1–40 of 200"

**Subsequent pages — Detail sections (CRITICAL + HIGH only)**
- One package per half-page for CRITICAL; one per quarter-page for HIGH.
- Each detail card: package name (large), risk/trust gauges (small SVG), CVE list, risk
  breakdown, recommendation.
- MEDIUM, LOW, SAFE packages are **not given individual detail pages** — they appear only
  in the summary table.  This keeps the PDF to a reasonable length (< 30 pages for 200 deps).

**Footer on every page:** "TrustGuard AI Security Agent · Page N of M · Results are automated analysis"

**File name pattern:** `trustguard-batch-YYYY-MM-DD.pdf`

---

### 2.3  JSON Export (improved)

The current JSON export is a flat array.  The improved version adds a top-level summary
envelope so the file is self-describing and can be consumed by downstream tools.

```json
{
  "meta": {
    "tool": "TrustGuard AI",
    "generatedAt": "2026-05-26T10:32:00Z",
    "totalPackages": 200,
    "selectedPackages": 200,
    "doneCount": 198,
    "failedCount": 2
  },
  "summary": {
    "critical": 2,
    "high": 8,
    "medium": 34,
    "low": 87,
    "safe": 69,
    "totalCVEs": 47,
    "packagesWithCVEs": 18,
    "ecosystems": ["npm"]
  },
  "packages": [
    {
      "name": "lodash",
      "version": "4.17.20",
      "ecosystem": "npm",
      "status": "DONE",
      "riskScore": 94,
      "trustScore": 42,
      "cveCount": 3,
      "result": { /* full PackageAnalysisData */ },
      "error": null
    }
  ]
}
```

The `packages` array is **sorted by riskScore descending** (CRITICAL first) so a script
processing the file encounters the most dangerous packages first.

---

## 3. Technical Architecture

### 3.1  Files to Create

| File | Purpose |
|------|---------|
| `src/components/batch/BatchRunningView.tsx` | New RUNNING state layout (risk feed) |
| `src/components/batch/BatchCompleteView.tsx` | New COMPLETE state layout (table + dashboard) |
| `src/components/batch/BatchSummaryDashboard.tsx` | Summary statistics bar |
| `src/components/batch/BatchFilterBar.tsx` | Tabs + search + sort + ecosystem filter |
| `src/components/batch/BatchTable.tsx` | Sortable/filterable paginated table |
| `src/components/batch/BatchRowDetail.tsx` | Expandable detail panel per row |
| `src/lib/export/BatchReportExporter.ts` | Markdown + improved JSON generation |
| `src/lib/export/BatchPdfDocument.tsx` | react-pdf document for batch PDF |
| `src/lib/export/batchPdfExport.ts` | Thin wrapper (mirrors `pdfExport.ts` for single) |

### 3.2  Files to Modify

| File | Change |
|------|--------|
| `src/components/batch/BatchProgress.tsx` | Replace current body with `<BatchRunningView>` / `<BatchCompleteView>` based on `status` |
| `src/store/batchStore.ts` | Add derived helpers: `getSummary()`, sort-by-risk default; no new state required |
| `src/App.tsx` | No changes required — routing already handles RUNNING/COMPLETE |

### 3.3  Risk Tier Mapping (consistent across views and exports)

```typescript
function getRiskTier(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE' {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'SAFE';
}
```

This matches the existing `RiskBadge` thresholds so labels are consistent everywhere.

### 3.4  State additions to `batchStore.ts`

No new persisted state is strictly required.  All filter/sort/pagination state lives in the
`BatchCompleteView` component as local React state (URL hash sync is optional, Phase 2).

A single helper is worth adding to the store for convenience:

```typescript
getSummary: () => {
  const items = get().items.filter(i => i.selected);
  // returns { critical, high, medium, low, safe, totalCVEs, packagesWithCVEs, ecosystems }
}
```

### 3.5  PDF generation notes

- Use the same `@react-pdf/renderer` already in the project.
- The summary table (many rows, small font) uses `react-pdf`'s `<Table>` equivalent
  (nested `<View>` rows with flex — the same pattern already used in `PdfDocument.tsx`).
- No emoji in the PDF (existing constraint — use plain text alternatives: "CRITICAL" not "⛔").
- Risk tier colours in PDF use the same CSS custom properties already defined:
  `--risk-critical: #dc2626`, `--risk-high: #ea580c`, etc.
- The cover page's proportional risk bar is a sequence of `<View>` flex children with
  `flexGrow` proportional to their count.  No SVG required.
- For 200 packages the PDF will be ~20–25 pages.  Acceptable.  The `pdfExport.ts` wrapper
  should show a brief "Generating PDF (this may take 5–10 seconds)..." loading state in the
  button label to manage expectations.

---

## 4. Implementation Steps (ordered)

### Phase 1 — UI redesign (no export yet)

1. **Create `BatchRunningView.tsx`** implementing the live risk feed layout described in §1.1.
   - Progress header (sticky, shows pct + live tally).
   - High-Risk Alerts section (appears when first CRITICAL/HIGH found; newest first).
   - Completed/Low-Safe section (collapsed by default, max 3 preview rows, expand toggle).
   - Scanning Queue section (5 active chips + N pending label).
   - All data comes from `useBatchStore` — no new state needed.

2. **Create `BatchSummaryDashboard.tsx`** — the five-tier stat bar with proportional fill.

3. **Create `BatchFilterBar.tsx`** — risk tier tabs, search input, sort dropdown, ecosystem
   dropdown, checkbox filters.  Exposes callbacks `onFilterChange` / `onSortChange`.

4. **Create `BatchTable.tsx`** — paginated table (50/page) with left-border risk colouring,
   sortable columns, search highlight, single-row expand.

5. **Create `BatchRowDetail.tsx`** — inline expand panel: CVE list, risk/trust breakdown,
   GitHub stats, licence note, recommended action.

6. **Create `BatchCompleteView.tsx`** — composes the above three components.

7. **Update `BatchProgress.tsx`** — replace the current grid/card body:
   ```tsx
   return status === 'RUNNING'
     ? <BatchRunningView />
     : <BatchCompleteView />;
   ```
   Keep the outer container; replace only the inner content.

8. **Build check** — `npm run build` must pass with zero TS errors.

---

### Phase 2 — Exports

9. **Create `BatchReportExporter.ts`** with:
   - `generateJSON(items)` — returns the improved JSON structure (§2.3).
   - `generateMarkdown(items)` — returns the tiered Markdown document (§2.2).
   - `triggerDownload(content, filename, mime)` — reuse the same helper from `ReportExporter.ts`
     (extract to a shared `src/lib/export/downloadHelper.ts` if not already shared).

10. **Create `BatchPdfDocument.tsx`** — react-pdf document with cover page, summary table
    (multi-page), and per-package detail cards for CRITICAL/HIGH packages only (§2.2).

11. **Create `batchPdfExport.ts`** — thin async wrapper that calls
    `pdf(<BatchPdfDocument .../>).toBlob()` and triggers download.

12. **Wire export buttons into `BatchCompleteView.tsx`**:
    - "[⬇ Export PDF]" — calls `batchPdfExport` (same loading-label trick as single-package).
    - "[⬇ Export Markdown]" — calls `BatchReportExporter.generateMarkdown`.
    - "[⬇ Export JSON]" — calls `BatchReportExporter.generateJSON` (replaces current inline button).

13. **Build + manual test** against a real package-lock.json with ≥ 50 packages to verify
    layout, scroll performance, and all three export formats.

---

## 5. Acceptance Criteria

### UI
- [ ] RUNNING view shows High-Risk Alerts section within 1 second of the first CRITICAL/HIGH
      package completing.
- [ ] Live tally (CRITICAL N · HIGH N · …) updates without page jank at 5-per-batch cadence.
- [ ] COMPLETE view table renders 200 rows without visible lag; pagination loads instantly.
- [ ] Filtering by risk tier, searching by name, and sorting all work without refresh.
- [ ] Expanding a row shows CVE list + breakdown; expanding a second row collapses the first.
- [ ] Layout is comfortable on 1280px wide viewport (the typical developer laptop).

### Markdown Export
- [ ] CRITICAL/HIGH packages have full detail sections with CVE tables.
- [ ] MEDIUM packages have condensed sections.
- [ ] LOW/SAFE packages appear only in Appendix A table.
- [ ] Document renders correctly in GitHub Markdown preview and VS Code.

### PDF Export
- [ ] Cover page shows risk tier counts + proportional bar + top-5 highest risk packages.
- [ ] Summary table is multi-page, colour-tinted by risk tier.
- [ ] Detail cards appear for CRITICAL and HIGH packages only.
- [ ] PDF is ≤ 30 pages for a 200-package batch.
- [ ] No broken characters / no emoji (react-pdf Helvetica constraint respected).

### JSON Export
- [ ] Top-level `meta` and `summary` envelopes are present.
- [ ] `packages` array is sorted by riskScore descending.
- [ ] All `PackageAnalysisData` fields are present in each package's `result`.

---

## 6. Out of Scope (Future)

- LLM analysis per package in batch mode (too expensive at 200+ packages; users should
  use the single-package view for deep dives).
- CSV / XLSX export.
- URL-hash persistence of filter/sort state (nice-to-have but not blocking).
- "Open full single-package report" from within the batch table
  (would require routing changes — separate issue).
- Batch re-scan / incremental update of just failed packages.
