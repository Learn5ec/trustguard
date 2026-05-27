import { create } from 'zustand';
import type { ParsedDependency } from '../lib/parsers/types';
import type { PackageAnalysisData, AnalysisReport, TokenUsage } from '../types/analysis';
import { runFullAnalysis } from '../lib/analysis/runFullAnalysis';
import { useSettingsStore } from './settingsStore';
import { LLMKeyManager } from '../lib/keyManager';
import { LLMRateLimiter } from '../lib/llm/rateLimiter';

export type BatchStatus = 'IDLE' | 'SELECTING' | 'RUNNING' | 'RETRYING' | 'COMPLETE';

export interface BatchItem extends ParsedDependency {
  selected: boolean;
  status: 'PENDING' | 'SCANNING' | 'DONE' | 'FAILED';
  result?: Partial<PackageAnalysisData>;
  report?: Partial<AnalysisReport> | null;
  tokenUsage?: TokenUsage | null;
  statusMessages?: string[];
  error?: string;
  /** true when the item was processed without an API key (metadata-only) */
  metadataOnly?: boolean;
  /** Retry tracking for rate-limit failures */
  retryCount?: number;
  retryStatus?: 'pendingRetry' | 'retrying' | 'retryFailed';
  failureReason?: 'rate_limit' | 'other';
}

interface BatchState {
  status: BatchStatus;
  items: BatchItem[];

  startBatch: (dependencies: ParsedDependency[]) => void;
  toggleSelection: (index: number, selected: boolean) => void;
  toggleAll: (selected: boolean) => void;
  runAnalysis: () => Promise<void>;
  resetBatch: () => void;
}

const BATCH_SIZE = 5;
const RETRY_DELAY_MS = 15_000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const useBatchStore = create<BatchState>((set, get) => ({
  status: 'IDLE',
  items: [],

  startBatch: (dependencies) => {
    const uniqueMap = new Map<string, ParsedDependency>();
    dependencies.forEach(d => uniqueMap.set(`${d.ecosystem}:${d.name}`, d));

    const items: BatchItem[] = Array.from(uniqueMap.values()).map(d => ({
      ...d,
      version: d.version.replace('^', ''),
      selected: true,
      status: 'PENDING',
    }));

    set({ status: 'SELECTING', items });
  },

  toggleSelection: (index, selected) => {
    const items = [...get().items];
    if (items[index]) {
      items[index].selected = selected;
      set({ items });
    }
  },

  toggleAll: (selected) => {
    set({ items: get().items.map(item => ({ ...item, selected })) });
  },

  runAnalysis: async () => {
    set({ status: 'RUNNING' });

    const settings = useSettingsStore.getState();
    const apiKey = settings.llmProvider === 'ollama'
      ? 'local'
      : LLMKeyManager.get(settings.llmProvider);

    const items = [...get().items];
    const selectedItems = items.filter(i => i.selected && i.status === 'PENDING');

    // ── Phase A: Main Run (5 concurrent) ─────────────────────────────────────
    for (let i = 0; i < selectedItems.length; i += BATCH_SIZE) {
      const batch = selectedItems.slice(i, i + BATCH_SIZE);

      // Mark batch as scanning
      batch.forEach(item => { item.status = 'SCANNING'; });
      set({ items: [...items] });

      await Promise.all(batch.map(async (item) => {
        try {
          if (apiKey) {
            console.log("looking_for_batch-1", item.version)
            // Full pipeline: same agents/tools as single-package analysis
            const result = await runFullAnalysis(
              item.name,
              item.version,
              item.ecosystem,
              {
                llmProvider: settings.llmProvider,
                llmModel: settings.llmModel,
                apiKey,
                onStatus: (msg) => {
                  item.statusMessages = [...(item.statusMessages || []), `[${item.name}] ${msg}`];
                  set({ items: [...items] });
                },
              }
            );
            item.result = result.packageData;
            item.report = result.report;
            item.tokenUsage = result.tokenUsage;
            item.statusMessages = result.statusMessages;
            item.metadataOnly = false;

            if (!result.report) {
              const lastMsg = result.statusMessages?.slice().reverse().find(m => m.includes('failed') || m.includes('error'));
              if (lastMsg) item.error = `AI analysis incomplete — ${lastMsg.replace(/^.*?AI analysis failed: /, '')}`;
            }
          } else {
            // No API key — metadata-only
            item.statusMessages = [...(item.statusMessages || []),
              '⚠ No API key configured — running metadata-only (CVE scan + scoring only, no AI analysis).'];
            set({ items: [...items] });

            const { analyzePackage } = await import('../lib/fetchers/orchestrator');
            const { calculateRiskScore } = await import('../lib/scoring/riskScore');
            const { calculateTrustScore } = await import('../lib/scoring/trustScore');

            const fetched = await analyzePackage(item.name, item.version, item.ecosystem);
            const riskResult = calculateRiskScore(fetched);
            const trustResult = calculateTrustScore({ ...fetched, riskScore: riskResult.score });
            item.result = {
              ...fetched,
              riskScore: riskResult.score,
              riskScoreBreakdown: riskResult.breakdown,
              trustScore: trustResult.score,
              trustScoreBreakdown: trustResult.breakdown,
            };
            item.report = null;
            item.tokenUsage = null;
            item.metadataOnly = true;
          }
          item.status = 'DONE';
        } catch (e: any) {
          if (LLMRateLimiter.isRateLimitError(e)) {
            // Mark for retry — do NOT mark as FAILED yet
            item.failureReason = 'rate_limit';
            item.retryStatus = 'pendingRetry';
            item.retryCount = 0;
            item.status = 'SCANNING'; // keep scanning state — retry will change it
            item.error = `Rate limited — scheduled for retry (up to ${MAX_RETRIES} attempts).`;
          } else {
            item.error = e.message;
            item.status = 'FAILED';
            item.failureReason = 'other';
          }
        }
        set({ items: [...items] });
      }));
    }

    // ── Phase B: Retry Loop ───────────────────────────────────────────────────
    const hasRetryItems = items.some(i => i.retryStatus === 'pendingRetry');
    if (hasRetryItems && apiKey) {
      set({ status: 'RETRYING' });

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const retryItems = items.filter(i => i.retryStatus === 'pendingRetry');
        if (retryItems.length === 0) break;

        // Wait 15 seconds before each retry attempt
        await sleep(RETRY_DELAY_MS);

        for (const item of retryItems) {
          item.retryStatus = 'retrying';
          item.retryCount = attempt;
          item.statusMessages = [...(item.statusMessages || []),
          `[${item.name}] Retrying (attempt ${attempt}/${MAX_RETRIES}) after rate limit...`];
          set({ items: [...items] });

          try {
            console.log("looking_for_batch-2", item.version)
            const result = await runFullAnalysis(
              item.name,
              item.version,
              item.ecosystem,
              {
                llmProvider: settings.llmProvider,
                llmModel: settings.llmModel,
                apiKey,
                onStatus: (msg) => {
                  item.statusMessages = [...(item.statusMessages || []), `[${item.name}] ${msg}`];
                  set({ items: [...items] });
                },
              }
            );
            item.result = result.packageData;
            item.report = result.report;
            item.tokenUsage = result.tokenUsage;
            item.status = 'DONE';
            item.retryStatus = undefined;
            item.error = undefined;
            item.metadataOnly = false;
          } catch (e: any) {
            if (attempt < MAX_RETRIES && LLMRateLimiter.isRateLimitError(e)) {
              // Still rate limited — will retry in next loop iteration
              item.retryStatus = 'pendingRetry';
              item.error = `Rate limited — retry ${attempt}/${MAX_RETRIES} failed. Retrying again...`;
            } else {
              // Final attempt failed or non-rate-limit error
              item.status = 'FAILED';
              item.retryStatus = 'retryFailed';
              item.error = LLMRateLimiter.isRateLimitError(e)
                ? `Analysis failed after ${MAX_RETRIES} retries due to API rate limiting.`
                : e.message;
            }
          }
          set({ items: [...items] });
        }
      }

      // Any still-pendingRetry after all attempts → FAILED
      items.forEach(item => {
        if (item.retryStatus === 'pendingRetry') {
          item.status = 'FAILED';
          item.retryStatus = 'retryFailed';
          item.error = `Analysis failed after ${MAX_RETRIES} retries due to API rate limiting.`;
        }
      });
      set({ items: [...items] });
    }

    set({ status: 'COMPLETE' });
  },

  resetBatch: () => {
    set({ status: 'IDLE', items: [] });
  },
}));
