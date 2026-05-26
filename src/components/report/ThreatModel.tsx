
import type { AnalysisReport } from '../../types/analysis';
import type { AnalysisProgress } from '../../store/analysisStore';
import { AnalysisProgressBar } from './AnalysisProgressBar';

interface ThreatModelProps {
  threatModel?: AnalysisReport['threatModel'];
  isStreaming: boolean;
  streamedText: string;
  analysisProgress?: AnalysisProgress | null;
}

export function ThreatModel({ threatModel, isStreaming, analysisProgress }: ThreatModelProps) {
  if (isStreaming && !threatModel) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse flex-shrink-0"></span>
          STRIDE Threat Model
        </h3>
        {analysisProgress ? (
          <AnalysisProgressBar progress={analysisProgress} />
        ) : (
          <div className="text-zinc-500 italic text-sm animate-pulse">Building threat model...</div>
        )}
      </div>
    );
  }

  if (!threatModel) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-zinc-100">STRIDE Threat Model</h3>
        <span className={`px-3 py-1 text-xs rounded-full font-bold
          ${threatModel.overallThreatLevel === 'CRITICAL' ? 'bg-red-900/50 text-red-400' : 
            threatModel.overallThreatLevel === 'HIGH' ? 'bg-orange-900/50 text-orange-400' : 
            threatModel.overallThreatLevel === 'MEDIUM' ? 'bg-yellow-900/50 text-yellow-400' : 
            'bg-green-900/50 text-green-400'}`}>
          Overall Level: {threatModel.overallThreatLevel}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(threatModel).filter(([k]) => k !== 'overallThreatLevel').map(([key, value]) => (
          <div key={key} className="bg-zinc-950 p-4 rounded border border-zinc-800">
            <h4 className="text-zinc-300 font-bold uppercase tracking-wider text-xs mb-2">{key.replace(/([A-Z])/g, ' $1').trim()}</h4>
            <p className="text-zinc-400 text-sm leading-relaxed">{value as string}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
