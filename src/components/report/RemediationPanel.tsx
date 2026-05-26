import type { AnalysisReport } from '../../types/analysis';

interface Props {
  remediationSteps?: AnalysisReport['remediationSteps'];
}

const priorityConfig = {
  IMMEDIATE: { label: 'IMMEDIATE', color: 'border-red-700/60 bg-red-950/20', badge: 'bg-red-900/50 text-red-400', icon: '🚨' },
  SHORT_TERM: { label: 'SHORT TERM', color: 'border-yellow-700/60 bg-yellow-950/20', badge: 'bg-yellow-900/50 text-yellow-400', icon: '⚡' },
  LONG_TERM: { label: 'LONG TERM', color: 'border-zinc-700/60 bg-zinc-950/20', badge: 'bg-zinc-800 text-zinc-400', icon: '📋' },
};

export function RemediationPanel({ remediationSteps }: Props) {
  if (!remediationSteps || remediationSteps.length === 0) return null;

  const grouped = {
    IMMEDIATE: remediationSteps.filter(s => s.priority === 'IMMEDIATE'),
    SHORT_TERM: remediationSteps.filter(s => s.priority === 'SHORT_TERM'),
    LONG_TERM: remediationSteps.filter(s => s.priority === 'LONG_TERM'),
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-zinc-100 mb-5 flex items-center gap-2">
        <span>🛠️</span> Remediation Roadmap
      </h3>
      <div className="space-y-3">
        {(Object.keys(grouped) as Array<keyof typeof grouped>).map(priority => (
          grouped[priority].length > 0 && (
            <div key={priority} className={`rounded-lg border p-4 ${priorityConfig[priority].color}`}>
              <div className="flex items-center gap-2 mb-3">
                <span>{priorityConfig[priority].icon}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${priorityConfig[priority].badge}`}>
                  {priorityConfig[priority].label}
                </span>
              </div>
              <div className="space-y-3">
                {grouped[priority].map((step, i) => (
                  <div key={i} className="pl-2 border-l border-zinc-700">
                    <p className="text-zinc-200 text-sm font-medium">{step.action}</p>
                    <p className="text-zinc-500 text-xs mt-1 leading-relaxed">{step.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
