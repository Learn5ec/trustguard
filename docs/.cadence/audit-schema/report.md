# Schema Audit — TrustGuard AI

**Scope:** `/home/web-h-056/trustguard`
**Date:** 2026-07-07
**Skill:** cadence:audit-schema

## Verdict: No database/ORM schema surface exists in this codebase

TrustGuard is a client-side single-page application (React 19 + Vite + Zustand) that analyzes open-source package ecosystems (npm, pip, uv, pipx, hex, packagist, conda, etc.) and produces risk/trust reports. It is **not** a data-persistence application and has no schema-audit surface in the traditional sense (no migrations, no ORM models, no SQL, no database connection).

### Evidence gathered

1. **Dependencies** (`package.json`): no ORM, driver, or query-builder package present. Runtime deps are limited to React, Zustand, React Router, `@react-pdf/renderer`, `@iarna/toml`, `js-yaml`, `highlight.js`, markdown tooling. No `prisma`, `sequelize`, `typeorm`, `mongoose`, `knex`, `drizzle`, `pg`, `mysql2`, `sqlite3`, or similar.
2. **File-system scan**: no `migrations/`, `prisma/`, `*.sql`, `schema.prisma`, `models/`, or `db/` directories anywhere in the repo (excluding `node_modules`).
3. **Keyword grep** for `prisma|sequelize|typeorm|mongoose|knex|drizzle|sqlite|postgres|mysql|migration|\.sql\b` across `src/` and `package.json` returned only false positives — all matches are the unrelated business field `migrationDifficulty` (`'EASY'|'MODERATE'|'HARD'`), a UI label describing how hard it is to switch away from a risky package, defined in `src/types/analysis.ts:200` and consumed in `AlternativesPanel.tsx`, `ReportExporter.ts`, `PdfDocument.tsx`, `HtmlExporter.ts`, and produced by LLM prompt templates in `src/lib/llm/prompts.ts`. One hit in `src/lib/fetchers/githubSource.ts:81` is the literal string `'migrations'` used as a heuristic filename-exclusion token when scoring which GitHub source files to fetch — again unrelated to a database schema.
4. **Persistence check**: grepped for `localStorage`, `indexedDB`, and Zustand `persist(` middleware usage. No hits for actual usage — the only match is a comment in `src/components/layout/Header.tsx:308` explicitly stating API keys are "never written to disk, localStorage, or cookies." This confirms the app holds zero durable client-side or server-side state; everything lives in in-memory Zustand stores for the lifetime of the browser tab.
5. **State shape** (the closest analogue to "schema" in this app): three Zustand stores exist —
   - `src/store/analysisStore.ts` — single-package analysis results/UI state
   - `src/store/batchStore.ts` — batch analysis queue/results
   - `src/store/settingsStore.ts` — user settings (e.g., LLM provider/API key, in-memory only)
   These are TypeScript-typed in-memory objects (see `src/types/analysis.ts`), not backed by any storage engine, so there are no migrations, indexes, foreign keys, or transaction boundaries to review, and no N+1 query risk exists since there is no query layer at all.

### Why this audit does not apply

The cadence:audit-schema skill is designed to reverse-engineer a database schema from migrations + ORM models + query patterns, producing an ER diagram, index recommendations, N+1 candidate list, and transaction-boundary review. None of these inputs exist in this repository:

- No migrations to diff against models (no drift possible).
- No ORM models to cross-check.
- No query patterns (no DB client is imported or instantiated anywhere).
- No transactions, connection pools, or locking constructs.

### Recommendation

No schema-audit findings are applicable or fabricated for this repo. If TrustGuard later adds server-side persistence (e.g., a backend API with a database for saved reports, user accounts, or historical scan data), re-run `cadence:audit-schema` at that time — the skill will have real migrations/ORM models/queries to analyze.

## Findings

None. (0 findings — no schema surface exists to audit.)
