import type { AnalysisProgress } from '../../store/analysisStore';

interface Props {
  progress: AnalysisProgress;
}

function getPct(p: AnalysisProgress): number {
  const N = p.totalChunks;
  switch (p.phase) {
    case 'fetching':     return 8;
    case 'scoring':      return 15;
    case 'scanning':     return N > 0 ? Math.round(15 + (p.scanStep / (N + 1)) * 65) : 25;
    case 'synthesizing': return N > 0 ? Math.min(93, Math.round(15 + (N / (N + 1)) * 65 + 8)) : 80;
    case 'analyzing':    return 30;
    case 'parsing':      return 96;
    default:             return 50;
  }
}

function getLabel(p: AnalysisProgress): { main: string; sub?: string } {
  switch (p.phase) {
    case 'fetching':
      return { main: 'Fetching metadata & vulnerability data...' };
    case 'scoring':
      return { main: 'Computing risk & trust scores...' };
    case 'scanning':
      return p.totalChunks > 1
        ? { main: `Scanning code section ${p.scanStep} of ${p.totalChunks}`, sub: p.chunkLabel }
        : { main: 'Security agent scanning source code...' };
    case 'synthesizing':
      return { main: 'Synthesising findings — generating full report...' };
    case 'analyzing':
      return { main: 'AI analysing package (single-pass)...' };
    case 'parsing':
      return { main: 'Parsing AI response...' };
    default:
      return { main: 'Processing...' };
  }
}

/**
 * Compact animated progress bar shown inside report panels while the AI
 * analysis is still running.  Determinate (shows %) for multi-pass monorepo
 * scans; indeterminate shimmer for single-pass streaming.
 */
export function AnalysisProgressBar({ progress }: Props) {
  const pct = getPct(progress);
  const { main, sub } = getLabel(progress);
  const isIndeterminate = progress.phase === 'analyzing';

  return (
    <div className="space-y-2 w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-300 leading-snug">{main}</p>
          {sub && (
            <p className="text-[10px] text-zinc-500 mt-0.5 font-mono truncate">{sub}</p>
          )}
        </div>
        {!isIndeterminate && (
          <span className="text-sm font-mono font-semibold text-indigo-400 flex-shrink-0 tabular-nums">
            {pct}%
          </span>
        )}
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
        {isIndeterminate ? (
          <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-progress-slide" />
        ) : (
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
