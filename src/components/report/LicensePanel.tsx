
import type { AnalysisReport } from '../../types/analysis';

interface LicensePanelProps {
  licenseExplanation?: AnalysisReport['licenseExplanation'];
}

export function LicensePanel({ licenseExplanation }: LicensePanelProps) {
  if (!licenseExplanation) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h3 className="text-xl font-semibold text-zinc-100 mb-4">License Analysis</h3>
      
      <p className="text-zinc-300 italic mb-6">"{licenseExplanation.summary}"</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="space-y-2">
          <h4 className="text-green-400 font-semibold text-sm">✓ You Can</h4>
          <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
            {licenseExplanation.canYou.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
        <div className="space-y-2">
          <h4 className="text-red-400 font-semibold text-sm">✗ You Cannot</h4>
          <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
            {licenseExplanation.cannotYou.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
        <div className="space-y-2">
          <h4 className="text-blue-400 font-semibold text-sm">! You Must</h4>
          <ul className="text-zinc-400 text-sm list-disc list-inside space-y-1">
            {licenseExplanation.mustYou.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
        <p className="text-zinc-400 text-sm leading-relaxed">
          <span className="font-semibold text-zinc-300">Plain English:</span> {licenseExplanation.plainEnglish}
        </p>
      </div>
    </div>
  );
}
