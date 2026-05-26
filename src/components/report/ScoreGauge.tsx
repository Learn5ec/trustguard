

export interface ScoreGaugeProps {
  score: number;
  type: 'risk' | 'trust';
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreGauge({ score, type, size = 'md' }: ScoreGaugeProps) {
  const radius = size === 'sm' ? 16 : size === 'md' ? 24 : 36;
  const strokeWidth = size === 'sm' ? 4 : size === 'md' ? 6 : 8;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let colorClass = 'text-zinc-500';

  if (type === 'risk') {
    // Risk gauge is always red — a high risk score is always bad regardless of value
    colorClass = 'text-red-500';
  } else {
    // Trust is inverse
    if (score >= 80) colorClass = 'text-green-500';
    else if (score >= 60) colorClass = 'text-yellow-500';
    else if (score >= 40) colorClass = 'text-orange-500';
    else colorClass = 'text-red-500';
  }

  const dimensions = size === 'sm' ? 40 : size === 'md' ? 60 : 80;
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dimensions, height: dimensions }}>
      <svg height={dimensions} width={dimensions} className="transform -rotate-90">
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={dimensions / 2}
          cy={dimensions / 2}
          className="text-zinc-800"
        />
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={dimensions / 2}
          cy={dimensions / 2}
          className={colorClass}
        />
      </svg>
      <div className={`absolute font-bold text-zinc-100 ${textSize}`}>
        {score}
      </div>
    </div>
  );
}
