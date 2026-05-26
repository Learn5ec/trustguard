import type { AnalysisReport } from '../../types/analysis';
import type { AnalysisProgress } from '../../store/analysisStore';
import { AnalysisProgressBar } from './AnalysisProgressBar';

interface Props {
  executiveSummary?: string;
  communityAssessment?: string;
  developerVerdict?: AnalysisReport['developerVerdict'];
  isStreaming?: boolean;
  analysisProgress?: AnalysisProgress | null;
}

const verdictConfig = {
  USE: { label: '✓ USE', color: 'bg-green-900/50 text-green-400 border-green-700/50' },
  USE_WITH_CAUTION: { label: '⚠ USE WITH CAUTION', color: 'bg-yellow-900/50 text-yellow-400 border-yellow-700/50' },
  AVOID: { label: '✗ AVOID', color: 'bg-red-900/50 text-red-400 border-red-700/50' },
  REPLACE_SOON: { label: '↻ REPLACE SOON', color: 'bg-orange-900/50 text-orange-400 border-orange-700/50' },
};

export function ExecutiveSummaryPanel({ executiveSummary, communityAssessment, developerVerdict, isStreaming, analysisProgress }: Props) {
  if (!executiveSummary && !isStreaming) return null;

  const verdict = developerVerdict ? verdictConfig[developerVerdict] : null;

  return (
    <div className="bg-zinc-900 border border-indigo-800/40 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <span className="text-indigo-400">🛡️</span> Executive Summary
        </h3>
        {verdict && (
          <span className={`px-3 py-1 rounded-full border text-xs font-bold tracking-wide ${verdict.color}`}>
            {verdict.label}
          </span>
        )}
      </div>
      {executiveSummary ? (
        <p className="text-zinc-300 leading-relaxed">{executiveSummary}</p>
      ) : analysisProgress ? (
        <AnalysisProgressBar progress={analysisProgress} />
      ) : (
        <div className="text-zinc-500 italic text-sm animate-pulse">AI is synthesising findings...</div>
      )}
      {communityAssessment && (
        <p className="text-zinc-400 text-sm mt-3 pt-3 border-t border-zinc-800 leading-relaxed">
          <span className="text-zinc-500 font-medium">Community: </span>{communityAssessment}
        </p>
      )}
    </div>
  );
}
