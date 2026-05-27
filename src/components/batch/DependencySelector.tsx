import { useBatchStore } from '../../store/batchStore';
import { useSettingsStore } from '../../store/settingsStore';
import { LLMKeyManager } from '../../lib/keyManager';
import { CheckSquare, Square, Play, X, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function DependencySelector() {
  const { items, toggleSelection, toggleAll, runAnalysis, resetBatch } = useBatchStore();
  const settings = useSettingsStore();

  const selectedCount = items.filter(i => i.selected).length;

  // Pre-flight: check if an LLM API key is available
  const isOllama = settings.llmProvider === 'ollama';
  const apiKey   = isOllama ? 'local' : LLMKeyManager.get(settings.llmProvider);
  const hasKey   = Boolean(apiKey);

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
        <div>
          <h3 className="text-xl font-bold text-zinc-100">Found {items.length} unique dependencies</h3>
          <p className="text-zinc-400 text-sm mt-1">Select the packages you want to analyze.</p>
        </div>
        <button onClick={resetBatch} className="text-zinc-500 hover:text-red-400 transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* API key status banner */}
      {hasKey ? (
        <div className="px-6 py-3 bg-green-950/30 border-b border-green-900/40 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>
            Full AI analysis enabled — <span className="font-mono">{settings.llmProvider}/{settings.llmModel}</span>.
            Each package will receive an executive summary, STRIDE threat model, security findings, alternatives &amp; remediation steps.
          </span>
        </div>
      ) : (
        <div className="px-6 py-3 bg-amber-950/30 border-b border-amber-900/40 flex items-start gap-2 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            <strong>No API key configured</strong> — analysis will run in <strong>metadata-only mode</strong> (OSV CVEs + risk/trust scores only).
            No AI executive summary, STRIDE threat model, security findings, or remediation will be generated.
            Configure your key in <strong>Settings</strong> (⚙ top-right) before running for full AI reports.
          </span>
        </div>
      )}

      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex space-x-4">
        <button 
          onClick={() => toggleAll(true)}
          className="flex items-center space-x-2 text-sm text-zinc-300 hover:text-white"
        >
          <CheckSquare className="w-4 h-4" /> <span>Select All</span>
        </button>
        <button 
          onClick={() => toggleAll(false)}
          className="flex items-center space-x-2 text-sm text-zinc-300 hover:text-white"
        >
          <Square className="w-4 h-4" /> <span>Deselect All</span>
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 sticky top-0 text-zinc-400 z-10">
            <tr>
              <th className="px-4 py-3 w-12"></th>
              <th className="px-4 py-3 font-medium">Package</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.map((item, idx) => (
              <tr key={idx} className={`hover:bg-zinc-800/50 transition-colors ${!item.selected ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <input 
                    type="checkbox" 
                    checked={item.selected} 
                    onChange={(e) => toggleSelection(idx, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 text-indigo-600 focus:ring-indigo-600 bg-zinc-800 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 font-mono text-zinc-300">{item.name}</td>
                <td className="px-4 py-3 font-mono text-zinc-400">{item.version}</td>
                <td className="px-4 py-3">
                  {item.isDev ? (
                    <span className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-400">Dev</span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-indigo-900/30 text-indigo-400 border border-indigo-800/50">Direct</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-between items-center">
        <div className="text-zinc-400">
          <span className="text-zinc-100 font-semibold">{selectedCount}</span> packages selected
        </div>
        <button 
          onClick={runAnalysis}
          disabled={selectedCount === 0}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded transition-colors"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Run Batch Analysis</span>
        </button>
      </div>
    </div>
  );
}
