import type { AnalysisReport } from '../../types/analysis';

interface Props {
  alternatives?: AnalysisReport['alternatives'];
}

const maintenanceColors: Record<string, string> = {
  ACTIVE: 'text-green-400',
  MAINTAINED: 'text-blue-400',
  SLOW: 'text-yellow-400',
  ABANDONED: 'text-red-400',
};

const difficultyColors: Record<string, string> = {
  EASY: 'text-green-400',
  MODERATE: 'text-yellow-400',
  HARD: 'text-red-400',
};

export function AlternativesPanel({ alternatives }: Props) {
  if (!alternatives || alternatives.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-zinc-100 mb-5 flex items-center gap-2">
        <span>🔄</span> Suggested Alternatives
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {alternatives.map((alt, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-zinc-100 font-semibold">{alt.name}</span>
                <span className="ml-2 text-xs text-zinc-500 font-mono bg-zinc-800 px-1.5 py-0.5 rounded">{alt.ecosystem}</span>
              </div>
              <span className={`text-xs font-bold ${maintenanceColors[alt.maintenanceStatus] || 'text-zinc-400'}`}>
                {alt.maintenanceStatus}
              </span>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">{alt.description}</p>
            <p className="text-indigo-300 text-xs">↑ {alt.whyBetter}</p>
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-zinc-500">
              <span>📄 {alt.license}</span>
              <span>⭐ {alt.githubStars}</span>
              <span>⬇ {alt.weeklyDownloads}/wk</span>
              <span className={difficultyColors[alt.migrationDifficulty] || 'text-zinc-400'}>
                Migration: {alt.migrationDifficulty}
              </span>
            </div>
            {alt.notableFeatures?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {alt.notableFeatures.slice(0, 3).map((f, j) => (
                  <span key={j} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
