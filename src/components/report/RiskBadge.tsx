

export interface RiskBadgeProps {
  score: number;
  label?: string;
}

export function RiskBadge({ score, label = 'Risk Score' }: RiskBadgeProps) {
  let riskLevel = 'UNKNOWN';
  let colorClass = 'bg-zinc-800 text-zinc-400';

  if (score >= 80) {
    riskLevel = 'CRITICAL';
    colorClass = 'bg-red-900/50 text-red-400 border-red-700/50';
  } else if (score >= 60) {
    riskLevel = 'HIGH';
    colorClass = 'bg-orange-900/50 text-orange-400 border-orange-700/50';
  } else if (score >= 40) {
    riskLevel = 'MEDIUM';
    colorClass = 'bg-yellow-900/50 text-yellow-400 border-yellow-700/50';
  } else if (score >= 20) {
    riskLevel = 'LOW';
    colorClass = 'bg-green-900/50 text-green-400 border-green-700/50';
  } else {
    riskLevel = 'MINIMAL';
    colorClass = 'bg-blue-900/50 text-blue-400 border-blue-700/50';
  }

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full border ${colorClass}`}>
      <span className="font-semibold text-sm mr-2">{label}: {score}/100</span>
      <span className="text-xs tracking-wider font-bold">[{riskLevel}]</span>
    </div>
  );
}
