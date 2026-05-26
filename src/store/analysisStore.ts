import { create } from 'zustand';
import type { PackageAnalysisData, AnalysisReport, TokenUsage, SecurityFinding } from '../types/analysis';
import { LLMClient } from '../lib/llm/LLMClient';
import { useSettingsStore } from './settingsStore';
import { buildAnalysisPrompt, buildChunkFindingsPrompt, buildSynthesisPrompt, SYSTEM_PROMPT } from '../lib/llm/prompts';
import { LLMKeyManager } from '../lib/keyManager';
import { analyzePackage, enrichWithDependencyVulns } from '../lib/fetchers/orchestrator';
import { fetchPackageSourceCode } from '../lib/fetchers/unpkg';
import { fetchGitHubRepoSourceChunks } from '../lib/fetchers/githubSource';
import { calculateRiskScore } from '../lib/scoring/riskScore';
import { calculateTrustScore } from '../lib/scoring/trustScore';
import { calculateCost } from '../lib/llm/tokenPricing';
import type { SourceChunk } from '../lib/fetchers/types';
import type { Ecosystem } from '../types/analysis';

// ── Finding deduplication ─────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4
};

/**
 * Merge findings gathered across multiple chunk passes.
 * Two findings are considered duplicates when they share the same category
 * and the first 40 characters of their lowercased title match.
 * When duplicates exist we keep the one with the higher severity and, as a
 * tiebreaker, the one that is `confirmed`.
 */
function deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const map = new Map<string, SecurityFinding>();
  for (const f of findings) {
    const key = `${f.category}::${f.title.toLowerCase().slice(0, 40)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, f);
    } else {
      const existingRank = SEVERITY_RANK[existing.severity] ?? 4;
      const newRank = SEVERITY_RANK[f.severity] ?? 4;
      // Replace if new finding has higher severity, or same severity but confirmed
      if (newRank < existingRank || (newRank === existingRank && f.confirmed && !existing.confirmed)) {
        map.set(key, f);
      }
    }
  }
  return Array.from(map.values());
}

// ── LLM JSON utilities ───────────────────────────────────────────────────────

/**
 * Strip markdown code fences that some LLM providers wrap around JSON responses
 * despite being instructed not to.
 */
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
}

/**
 * Extract the first balanced JSON *object* `{...}` from arbitrary text using
 * bracket counting.  More reliable than a greedy `\{[\s\S]*\}` regex, which
 * over-matches when the LLM adds explanatory text after the closing brace.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape)              { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"')          { inString = !inString; continue; }
    if (inString)            { continue; }
    if (ch === '{')          { depth++; }
    else if (ch === '}')     { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null; // unbalanced / not found
}

/**
 * Extract the first balanced JSON *array* `[...]` starting at `startPos`.
 */
function extractBalancedArray(text: string, startPos: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];
    if (escape)              { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"')          { inString = !inString; continue; }
    if (inString)            { continue; }
    if (ch === '[')          { depth++; }
    else if (ch === ']')     { depth--; if (depth === 0) return text.slice(startPos, i + 1); }
  }
  // If the array was never closed (truncated response), return everything we have
  return depth > 0 ? text.slice(startPos) + ']'.repeat(depth) : null;
}

/**
 * Apply lightweight text-level repair to LLM-produced JSON:
 *   • Trailing commas before } or ]
 */
function repairJson(raw: string): string {
  return raw.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Extract individual JSON objects from array text, parsing each independently.
 * Used as last-resort when the array itself cannot be parsed as a whole.
 */
function extractObjectsFromArrayText(arrayText: string): any[] {
  const results: any[] = [];
  let i = 0;
  while (i < arrayText.length) {
    const nextBrace = arrayText.indexOf('{', i);
    if (nextBrace === -1) break;
    const objStr = extractFirstJsonObject(arrayText.slice(nextBrace));
    if (!objStr) { i = nextBrace + 1; continue; }
    try { results.push(JSON.parse(repairJson(objStr))); } catch { /* skip malformed */ }
    i = nextBrace + objStr.length;
  }
  return results;
}

/**
 * Robust 3-tier extraction of `securityFindings` from an LLM response that may:
 *   - Be wrapped in markdown code fences
 *   - Contain trailing commas
 *   - Have unescaped quotes / truncated JSON that breaks full-document parse
 *
 * Tier 1: standard JSON.parse of the top-level object
 * Tier 2: repairJson then parse
 * Tier 3: locate the securityFindings array via regex, extract balanced brackets,
 *          try array parse, fall back to per-object extraction
 */
function extractFindingsFromResponse(text: string): SecurityFinding[] {
  const clean = stripFences(text);

  // Tier 1 & 2 — try parsing the full top-level object
  const objStr = extractFirstJsonObject(clean);
  if (objStr) {
    for (const candidate of [objStr, repairJson(objStr)]) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed.securityFindings)) return parsed.securityFindings;
      } catch { /* fall through */ }
    }
  }

  // Tier 3 — find the securityFindings array and extract it independently
  const arrayKeyMatch = clean.match(/"securityFindings"\s*:\s*\[/);
  if (arrayKeyMatch && arrayKeyMatch.index !== undefined) {
    const bracketPos = clean.indexOf('[', arrayKeyMatch.index);
    if (bracketPos !== -1) {
      const arrayStr = extractBalancedArray(clean, bracketPos);
      if (arrayStr) {
        for (const candidate of [arrayStr, repairJson(arrayStr)]) {
          try {
            const arr = JSON.parse(candidate);
            if (Array.isArray(arr)) return arr;
          } catch { /* fall through */ }
        }
        // Last resort: parse each object individually
        return extractObjectsFromArrayText(arrayStr);
      }
    }
  }

  return [];
}

/**
 * Parse a full LLM response as a JSON object (for synthesis / single-pass).
 * Returns the parsed object or throws if all attempts fail.
 */
function parseFullJsonResponse(text: string): any {
  const clean = stripFences(text);
  const objStr = extractFirstJsonObject(clean);
  if (!objStr) throw new Error('No JSON object found in response');
  try { return JSON.parse(objStr); } catch { /* fall through */ }
  return JSON.parse(repairJson(objStr)); // throws if still broken
}

// ── Analysis progress ─────────────────────────────────────────────────────────

export interface AnalysisProgress {
  /** Which phase of the pipeline is currently running */
  phase: 'fetching' | 'scoring' | 'scanning' | 'synthesizing' | 'analyzing' | 'parsing';
  /** 1-based index of the chunk currently being scanned; 0 when not in scanning phase */
  scanStep: number;
  /** Total number of source chunks queued for scanning; 0 for single-pass analysis */
  totalChunks: number;
  /** Human-readable label for the chunk currently being scanned */
  chunkLabel: string;
}

// ── Store types ───────────────────────────────────────────────────────────────

interface AnalysisState {
  isAnalyzing: boolean;
  statusMessages: string[];
  packageData: Partial<PackageAnalysisData> | null;
  llmStream: string;
  report: Partial<AnalysisReport> | null;
  tokenUsage: TokenUsage | null;
  needsApiKey: boolean;
  analysisProgress: AnalysisProgress | null;

  startAnalysis: (packageName: string, version: string, ecosystem: string) => Promise<void>;
  addStatusMessage: (msg: string) => void;
  reset: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  isAnalyzing: false,
  statusMessages: [],
  packageData: null,
  llmStream: '',
  report: null,
  tokenUsage: null,
  needsApiKey: false,
  analysisProgress: null,

  reset: () => set({
    isAnalyzing: false,
    statusMessages: [],
    packageData: null,
    llmStream: '',
    report: null,
    tokenUsage: null,
    needsApiKey: false,
    analysisProgress: null,
  }),

  addStatusMessage: (msg) => set((state) => ({ statusMessages: [...state.statusMessages, msg] })),

  startAnalysis: async (packageName, version, ecosystem) => {
    const settings = useSettingsStore.getState();
    const apiKey = settings.llmProvider === 'ollama' ? 'local' : LLMKeyManager.get(settings.llmProvider);

    if (!apiKey) {
      set({
        isAnalyzing: false,
        needsApiKey: true,
        packageData: { packageName, version, ecosystem: ecosystem as Ecosystem },
        statusMessages: [
          `No API key configured for ${settings.llmProvider}.`,
          'Please open Settings (⚙) and add your API key to enable analysis.'
        ],
        llmStream: '',
        report: null,
        tokenUsage: null,
        analysisProgress: null,
      });
      return;
    }

    set({
      isAnalyzing: true,
      needsApiKey: false,
      statusMessages: [`Starting analysis for ${packageName}@${version}...`],
      packageData: { packageName, version, ecosystem: ecosystem as Ecosystem },
      llmStream: '',
      report: null,
      tokenUsage: null,
      analysisProgress: { phase: 'fetching', scanStep: 0, totalChunks: 0, chunkLabel: '' },
    });

    // ── Step 1: Fetch registry / GitHub metadata ──────────────────────────────
    get().addStatusMessage('Fetching vulnerability data from OSV.dev and GitHub...');

    let fetchedData: Partial<PackageAnalysisData>;
    let sourceChunks: SourceChunk[] | null = null;

    try {
      fetchedData = await analyzePackage(packageName, version, ecosystem as Ecosystem);

      // ── Source code fetching ────────────────────────────────────────────────
      if (fetchedData.ecosystem === 'github' && fetchedData.github?.url) {
        get().addStatusMessage('Fetching source code for Secure Code Review Agent...');
        sourceChunks = await fetchGitHubRepoSourceChunks(fetchedData.github.url);

        if (sourceChunks && sourceChunks.length > 0) {
          // Build the flat sourceCode string for exports / dep-scanner
          fetchedData.sourceCode = sourceChunks.length === 1
            ? sourceChunks[0].content
            : sourceChunks.map(c => `=== SOURCE SECTION: ${c.label} ===\n${c.content}`).join('\n\n');

          if (sourceChunks.length > 1) {
            get().addStatusMessage(
              `Monorepo detected — ${sourceChunks.length} code sections queued for analysis (${sourceChunks.map(c => c.label).join(', ')}).`
            );
          }
        }
      } else if (fetchedData.ecosystem === 'npm') {
        get().addStatusMessage('Fetching source code for Secure Code Review Agent...');
        const sourceCode = await fetchPackageSourceCode(packageName, fetchedData.version || version);
        if (sourceCode) {
          fetchedData.sourceCode = sourceCode;
          sourceChunks = [{ label: packageName, content: sourceCode }];
        }
      }

      // ── Dependency CVE scan ─────────────────────────────────────────────────
      if (fetchedData.sourceCode) {
        get().addStatusMessage('Scanning dependencies for known CVEs...');
        try {
          const depVulns = await enrichWithDependencyVulns(
            fetchedData.sourceCode,
            fetchedData.ecosystem || 'npm'
          );
          if (depVulns.length > 0) {
            fetchedData.dependencyVulnerabilities = depVulns;
            get().addStatusMessage(
              `Found CVEs in ${depVulns.length} direct dependenc${depVulns.length === 1 ? 'y' : 'ies'}.`
            );
          }
        } catch { /* non-fatal */ }
      }
    } catch (err: any) {
      get().addStatusMessage(`Warning: Data fetch error — ${err.message}. Continuing with partial data.`);
      fetchedData = { packageName, version, ecosystem: ecosystem as Ecosystem, vulnerabilities: [] };
    }

    // ── Step 2: Compute scores ────────────────────────────────────────────────
    get().addStatusMessage('Computing risk and trust scores...');
    set({ analysisProgress: { phase: 'scoring', scanStep: 0, totalChunks: 0, chunkLabel: '' } });
    const riskResult  = calculateRiskScore(fetchedData);
    const trustResult = calculateTrustScore({ ...fetchedData, riskScore: riskResult.score });

    const enrichedData: Partial<PackageAnalysisData> = {
      ...fetchedData,
      riskScore:          riskResult.score,
      riskScoreBreakdown: riskResult.breakdown,
      trustScore:         trustResult.score,
      trustScoreBreakdown: trustResult.breakdown,
    };

    set({ packageData: enrichedData });
    get().addStatusMessage(
      `Data aggregation complete. ${fetchedData.vulnerabilities?.length || 0} known CVEs. Starting AI analysis...`
    );

    // ── Step 3: LLM analysis ──────────────────────────────────────────────────
    const isMultiPass = (sourceChunks?.length ?? 0) > 1;

    try {
      if (isMultiPass && sourceChunks) {
        // ── MULTI-PASS MODE (monorepo) ──────────────────────────────────────
        // Pass A: scan each chunk for security findings (silent, no UI stream)
        const allChunkFindings: SecurityFinding[] = [];
        let accInputTokens  = 0;
        let accOutputTokens = 0;

        for (let i = 0; i < sourceChunks.length; i++) {
          const chunk = sourceChunks[i];
          get().addStatusMessage(
            `Scanning security findings: ${chunk.label} (section ${i + 1} of ${sourceChunks.length})...`
          );
          set({ analysisProgress: { phase: 'scanning', scanStep: i + 1, totalChunks: sourceChunks.length, chunkLabel: chunk.label } });

          try {
            let chunkText = '';
            let chunkUsage: TokenUsage | undefined;

            const chunkMessages = [
              { role: 'system' as const, content: SYSTEM_PROMPT },
              { role: 'user'   as const, content: buildChunkFindingsPrompt(chunk.label, chunk.content) }
            ];

            // Consume stream silently — UI stream stays empty during chunk passes
            for await (const token of LLMClient.streamAnalysis(
              settings.llmProvider,
              settings.llmModel,
              apiKey,
              chunkMessages,
              (u) => { chunkUsage = u; }
            )) {
              chunkText += token;
            }

            // Accumulate token usage across chunk passes
            if (chunkUsage) {
              accInputTokens  += chunkUsage.inputTokens;
              accOutputTokens += chunkUsage.outputTokens;
            }

            // Parse findings from this chunk — use robust 3-tier extractor
            // that handles fences, trailing commas, greedy regex over-matching,
            // and per-object fallback extraction for truncated/malformed JSON.
            const chunkFindings = extractFindingsFromResponse(chunkText);
            if (chunkFindings.length > 0) {
              allChunkFindings.push(...chunkFindings);
              get().addStatusMessage(
                `  → ${chunkFindings.length} finding${chunkFindings.length !== 1 ? 's' : ''} in ${chunk.label}.`
              );
            } else {
              console.warn(`Chunk "${chunk.label}" — no findings extracted (malformed JSON or clean section).`);
            }

          } catch (e: any) {
            get().addStatusMessage(`  ⚠ Chunk scan failed (${chunk.label}): ${e.message}`);
          }
        }

        // Deduplicate findings gathered across all chunk passes
        const mergedFindings = deduplicateFindings(allChunkFindings);

        get().addStatusMessage(
          `${mergedFindings.length} unique finding${mergedFindings.length !== 1 ? 's' : ''} identified across ${sourceChunks.length} code sections. Running synthesis pass...`
        );
        set({ analysisProgress: { phase: 'synthesizing', scanStep: sourceChunks.length, totalChunks: sourceChunks.length, chunkLabel: '' } });

        // Mirror findings into packageData immediately so the UI can show them
        // while the synthesis pass is still streaming
        if (mergedFindings.length > 0) {
          set(state => ({
            packageData: state.packageData
              ? { ...state.packageData, securityFindings: mergedFindings }
              : state.packageData
          }));
        }

        // Pass B: synthesis — stream the full narrative report to the UI
        // Source code is NOT included (already processed); findings are injected.
        const { sourceCode: _sc, ...dataForSynthesis } = enrichedData as any;
        const synthPrompt = buildSynthesisPrompt(dataForSynthesis, mergedFindings);

        const synthStream = LLMClient.streamAnalysis(
          settings.llmProvider,
          settings.llmModel,
          apiKey,
          [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: synthPrompt }
          ],
          (synthUsage) => {
            // Sum chunk tokens + synthesis tokens for the combined usage display
            const totalInput  = accInputTokens  + synthUsage.inputTokens;
            const totalOutput = accOutputTokens + synthUsage.outputTokens;
            const totalTokens = totalInput + totalOutput;
            set({
              tokenUsage: {
                provider:        synthUsage.provider,
                model:           synthUsage.model,
                inputTokens:     totalInput,
                outputTokens:    totalOutput,
                totalTokens,
                estimatedCostUSD: calculateCost(settings.llmProvider, settings.llmModel, totalInput, totalOutput),
                isEstimated:     synthUsage.isEstimated,
              }
            });
            get().addStatusMessage(
              `Analysis complete. Total tokens (${sourceChunks!.length + 1} passes): ${totalTokens.toLocaleString()}${synthUsage.isEstimated ? ' (estimated)' : ''}`
            );
          }
        );

        let synthBuffer = '';
        for await (const token of synthStream) {
          synthBuffer += token;
          set({ llmStream: synthBuffer });
        }

        get().addStatusMessage('Parsing synthesis report...');

        try {
          const parsed = parseFullJsonResponse(synthBuffer);
          // securityFindings come from the pre-computed merged list, not the
          // synthesis pass (synthesis prompt intentionally omits them).
          const finalReport = {
            ...parsed,
            securityFindings: mergedFindings.length > 0
              ? mergedFindings
              : (parsed.securityFindings || []),
          };
          set({ report: finalReport });
          set(state => ({
            packageData: state.packageData
              ? { ...state.packageData, securityFindings: finalReport.securityFindings }
              : state.packageData
          }));
        } catch (e) {
          // Synthesis JSON unrecoverable — still surface findings so UI doesn't freeze
          console.error('Failed to parse synthesis JSON', e);
          get().addStatusMessage('Warning: synthesis JSON parse failed. Showing findings only.');
          set({ report: { securityFindings: mergedFindings } });
          set(state => ({
            packageData: state.packageData
              ? { ...state.packageData, securityFindings: mergedFindings }
              : state.packageData
          }));
        }

      } else {
        // ── SINGLE-PASS MODE (simple repo or npm package) ───────────────────
        const prompt = buildAnalysisPrompt(enrichedData);
        set({ analysisProgress: { phase: 'analyzing', scanStep: 0, totalChunks: 0, chunkLabel: '' } });

        const stream = LLMClient.streamAnalysis(
          settings.llmProvider,
          settings.llmModel,
          apiKey,
          [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: prompt }
          ],
          (usage) => {
            set({ tokenUsage: usage });
            get().addStatusMessage(
              `AI analysis complete. Tokens used: ${usage.totalTokens.toLocaleString()} (${usage.isEstimated ? 'estimated' : 'exact'})`
            );
          }
        );

        let buffer = '';
        for await (const chunk of stream) {
          buffer += chunk;
          set({ llmStream: buffer });
        }

        get().addStatusMessage('Parsing report...');

        try {
          const parsed = parseFullJsonResponse(buffer);
          set({ report: parsed });
          if (parsed.securityFindings) {
            set(state => ({
              packageData: state.packageData
                ? { ...state.packageData, securityFindings: parsed.securityFindings }
                : state.packageData
            }));
          }
        } catch (e) {
          // Truncated or malformed JSON — set empty report so the UI does not freeze
          console.error('Failed to parse final JSON', e);
          get().addStatusMessage('Warning: AI response JSON could not be parsed. Try a different model or re-run.');
          set({ report: {} });
        }
      }
    } catch (e: any) {
      get().addStatusMessage(`AI Analysis Failed: ${e.message}`);
    } finally {
      set({ isAnalyzing: false, analysisProgress: null });
    }
  }
}));
