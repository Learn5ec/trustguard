/**
 * Standalone full-analysis pipeline — same logic as analysisStore.startAnalysis()
 * but returns results directly instead of updating Zustand state.
 * Used by batchStore to run the complete pipeline (source fetch + scoring + LLM)
 * for each batch item, identically to how single-package analysis works.
 */
import type { PackageAnalysisData, AnalysisReport, TokenUsage, SecurityFinding, Ecosystem } from '../../types/analysis';
import { LLMClient } from '../llm/LLMClient';
import { buildAnalysisPrompt, buildChunkFindingsPrompt, buildSynthesisPrompt, SYSTEM_PROMPT } from '../llm/prompts';
import { analyzePackage, enrichWithDependencyVulns } from '../fetchers/orchestrator';
import { fetchPackageSourceCode } from '../fetchers/unpkg';
import { fetchGitHubRepoSourceChunks } from '../fetchers/githubSource';
import { calculateRiskScore } from '../scoring/riskScore';
import { calculateTrustScore } from '../scoring/trustScore';
import { calculateCost } from '../llm/tokenPricing';
import { globalLLMRateLimiter, LLMRateLimiter } from '../llm/rateLimiter';
import { now } from '../utils/timestamps';
import type { SourceChunk } from '../fetchers/types';
import {
  deduplicateFindings,
  extractFindingsFromResponse,
  parseFullJsonResponse,
} from './jsonUtils';

export interface FullAnalysisResult {
  packageData: Partial<PackageAnalysisData>;
  report: Partial<AnalysisReport> | null;
  tokenUsage: TokenUsage | null;
  statusMessages: string[];
}

/**
 * Collect a full LLM stream into a string buffer.
 * Wrapped in a function so the rate limiter can schedule it as a single unit.
 */
async function collectStream(
  llmProvider: string,
  llmModel: string,
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  _onUsage?: (u: TokenUsage) => void
): Promise<{ text: string; usage: TokenUsage | undefined }> {
  let text = '';
  let usage: TokenUsage | undefined;
  for await (const token of LLMClient.streamAnalysis(llmProvider, llmModel, apiKey, messages, u => { usage = u; })) {
    text += token;
  }
  return { text, usage };
}

export async function runFullAnalysis(
  packageName: string,
  version: string,
  ecosystem: Ecosystem,
  options: {
    llmProvider: string;
    llmModel: string;
    apiKey: string;
    onStatus?: (msg: string) => void;
    /** Sub-directory or file path within the repo to scope the source review to */
    subPath?: string;
    /** Branch/ref hint extracted from the GitHub tree/blob URL */
    gitBranch?: string;
  }
): Promise<FullAnalysisResult> {
  const { llmProvider, llmModel, apiKey, onStatus, subPath, gitBranch } = options;
  const statusMessages: string[] = [];
  const log = (msg: string) => { statusMessages.push(msg); onStatus?.(msg); };

  const scanStartedAt = now();

  // ── Step 1: Fetch registry metadata + source code ─────────────────────────
  log(`Fetching vulnerability data and metadata for ${packageName}...`);
  let fetchedData: Partial<PackageAnalysisData>;
  let sourceChunks: SourceChunk[] | null = null;

  try {
    fetchedData = await analyzePackage(packageName, version, ecosystem);

    // Propagate sub-path so exports and UI can surface it
    if (subPath) fetchedData.resolvedGithubSubPath = subPath;

    // Source code: use resolvedGithubUrl if available (set by registry lookup)
    const effectiveGithubUrl = fetchedData.resolvedGithubUrl || fetchedData.github?.url;

    if (effectiveGithubUrl && (fetchedData.ecosystem === 'github' || fetchedData.resolvedVia === 'registry_lookup' || fetchedData.resolvedVia === 'direct_url')) {
      const resolvedVersion = fetchedData.version && fetchedData.version !== 'latest' ? fetchedData.version : undefined;
      const subPathNote = subPath ? ` (sub-path: ${subPath})` : '';
      log(`Fetching source code (GitHub)${subPathNote}${resolvedVersion ? ` at tag for v${resolvedVersion}` : ''}...`);
      const sourceResult = await fetchGitHubRepoSourceChunks(effectiveGithubUrl, resolvedVersion, subPath, gitBranch);
      sourceChunks = sourceResult?.chunks ?? null;
      if (sourceResult?.resolvedRef) fetchedData.resolvedGitRef = sourceResult.resolvedRef;
      if (sourceChunks?.length) {
        fetchedData.sourceCode = sourceChunks.length === 1
          ? sourceChunks[0].content
          : sourceChunks.map(c => `=== SOURCE SECTION: ${c.label} ===\n${c.content}`).join('\n\n');
        if (sourceChunks.length > 1) {
          log(`Monorepo — ${sourceChunks.length} sections: ${sourceChunks.map(c => c.label).join(', ')}`);
        }
      }
    } else if (fetchedData.ecosystem === 'npm') {
      log('Fetching source code (npm/unpkg)...');
      const src = await fetchPackageSourceCode(packageName, fetchedData.version || version);
      if (src) {
        fetchedData.sourceCode = src;
        sourceChunks = [{ label: packageName, content: src }];
      }
    }

    if (fetchedData.sourceCode) {
      try {
        const depVulns = await enrichWithDependencyVulns(
          fetchedData.sourceCode,
          fetchedData.ecosystem || 'npm'
        );
        if (depVulns.length > 0) {
          fetchedData.dependencyVulnerabilities = depVulns;
          log(`Found CVEs in ${depVulns.length} direct dependenc${depVulns.length === 1 ? 'y' : 'ies'}.`);
        }
      } catch { /* non-fatal */ }
    }
  } catch (err: any) {
    log(`Warning: fetch error — ${err.message}. Continuing with partial data.`);
    fetchedData = { packageName, version, ecosystem, vulnerabilities: [] };
  }

  // ── Step 2: Compute risk + trust scores ───────────────────────────────────
  const riskResult  = calculateRiskScore(fetchedData);
  const trustResult = calculateTrustScore({ ...fetchedData, riskScore: riskResult.score });
  const enrichedData: Partial<PackageAnalysisData> = {
    ...fetchedData,
    scanStartedAt,
    riskScore:           riskResult.score,
    riskScoreBreakdown:  riskResult.breakdown,
    trustScore:          trustResult.score,
    trustScoreBreakdown: trustResult.breakdown,
  };
  log(`Scores: Risk ${riskResult.score}/100 · Trust ${trustResult.score}/100. ${fetchedData.vulnerabilities?.length || 0} CVEs found.`);

  // ── Step 3: LLM analysis — rate-limited, fully silent ─────────────────────
  let report: Partial<AnalysisReport> | null = null;
  let tokenUsage: TokenUsage | null = null;

  try {
    const isMultiPass = (sourceChunks?.length ?? 0) > 1;

    if (isMultiPass && sourceChunks) {
      // ── MULTI-PASS (monorepo) ──────────────────────────────────────────────
      const allChunkFindings: SecurityFinding[] = [];
      let accInput = 0, accOutput = 0;

      for (let i = 0; i < sourceChunks.length; i++) {
        const chunk = sourceChunks[i];
        log(`Scanning chunk ${i + 1}/${sourceChunks.length}: ${chunk.label}`);
        try {
          const msgs = [
            { role: 'system' as const, content: SYSTEM_PROMPT },
            { role: 'user'   as const, content: buildChunkFindingsPrompt(chunk.label, chunk.content) },
          ];
          // Rate-limited LLM call
          const { text: chunkText, usage: chunkUsage } = await globalLLMRateLimiter.scheduleRequest(
            () => collectStream(llmProvider, llmModel, apiKey, msgs)
          );
          if (chunkUsage) { accInput += chunkUsage.inputTokens; accOutput += chunkUsage.outputTokens; }
          const chunkFindings = extractFindingsFromResponse(chunkText);
          allChunkFindings.push(...chunkFindings);
          if (chunkFindings.length > 0) {
            log(`  → ${chunkFindings.length} finding${chunkFindings.length !== 1 ? 's' : ''} in ${chunk.label}.`);
          }
        } catch (e: any) {
          log(`  ⚠ Chunk scan failed (${chunk.label}): ${e.message}`);
          throw e; // re-throw so batchStore can detect rate-limit errors
        }
      }

      const mergedFindings = deduplicateFindings(allChunkFindings);
      log(`${mergedFindings.length} unique findings. Running synthesis pass...`);

      const { sourceCode: _sc, ...dataForSynth } = enrichedData as any;
      const synthMsgs = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user'   as const, content: buildSynthesisPrompt(dataForSynth, mergedFindings) },
      ];
      // Rate-limited synthesis pass
      const { text: synthBuffer, usage: synthUsage } = await globalLLMRateLimiter.scheduleRequest(
        () => collectStream(llmProvider, llmModel, apiKey, synthMsgs)
      );

      if (synthUsage) {
        const totalIn = accInput + synthUsage.inputTokens;
        const totalOut = accOutput + synthUsage.outputTokens;
        tokenUsage = {
          provider:         llmProvider,
          model:            llmModel,
          inputTokens:      totalIn,
          outputTokens:     totalOut,
          totalTokens:      totalIn + totalOut,
          estimatedCostUSD: calculateCost(llmProvider, llmModel, totalIn, totalOut),
          isEstimated:      synthUsage.isEstimated,
        };
        log(`Complete. Total tokens (${sourceChunks.length + 1} passes): ${tokenUsage.totalTokens.toLocaleString()}`);
      }

      try {
        const parsed = parseFullJsonResponse(synthBuffer);
        report = {
          ...parsed,
          securityFindings: mergedFindings.length > 0 ? mergedFindings : (parsed.securityFindings || []),
        };
      } catch {
        report = { securityFindings: mergedFindings };
      }

    } else {
      // ── SINGLE-PASS ────────────────────────────────────────────────────────
      log('Running single-pass AI analysis...');
      const msgs = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user'   as const, content: buildAnalysisPrompt(enrichedData) },
      ];
      // Rate-limited LLM call
      const { text: buffer, usage } = await globalLLMRateLimiter.scheduleRequest(
        () => collectStream(llmProvider, llmModel, apiKey, msgs)
      );

      tokenUsage = usage || null;
      if (tokenUsage) {
        log(`Complete. Tokens: ${tokenUsage.totalTokens.toLocaleString()}`);
      }

      try {
        const parsed = parseFullJsonResponse(buffer);
        report = parsed;
        if (parsed.securityFindings) enrichedData.securityFindings = parsed.securityFindings;
      } catch {
        report = {};
      }
    }

    // ── Post-LLM: enrich commercialModel from LLM report if unknown ──────────
    if (report && enrichedData.commercialModel === 'unknown') {
      const commercialUse = (report as any).licenseExplanation?.commercialUse;
      if (commercialUse === 'YES') {
        enrichedData.commercialModel = 'open-source';
        enrichedData.commercialUseClassification = 'allowed';
      } else if (commercialUse === 'NO') {
        enrichedData.commercialUseClassification = 'restricted';
      } else if (commercialUse === 'CONDITIONS') {
        enrichedData.commercialUseClassification = 'needs-permission';
      }
    }

    // Mirror security findings into packageData
    if (report && (report as any).securityFindings) {
      enrichedData.securityFindings = (report as any).securityFindings;
    }

  } catch (e: any) {
    log(`AI analysis failed: ${e.message}`);
    // Re-throw rate-limit errors so batchStore can handle retry
    if (LLMRateLimiter.isRateLimitError(e)) throw e;
  }

  const scanEndedAt = now();
  enrichedData.scanEndedAt = scanEndedAt;
  enrichedData.reportGeneratedAt = now();

  return {
    packageData: enrichedData,
    report,
    tokenUsage,
    statusMessages,
  };
}
