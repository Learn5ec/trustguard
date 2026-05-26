
import { useBatchStore } from '../../store/batchStore';
import { RiskBadge } from '../report/RiskBadge';

export function BatchProgress() {
  const { items, status, resetBatch } = useBatchStore();
  
  const selected = items.filter(i => i.selected);
  const doneCount = selected.filter(i => i.status === 'DONE' || i.status === 'FAILED').length;
  const progressPercent = selected.length > 0 ? (doneCount / selected.length) * 100 : 0;

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-8 pb-16">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden p-6">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Batch Analysis</h2>
            <p className="text-zinc-400 mt-1">
              {status === 'RUNNING' ? 'Analyzing packages in parallel...' : 'Analysis complete!'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-mono text-zinc-100">{doneCount}</span>
            <span className="text-zinc-500"> / {selected.length}</span>
          </div>
        </div>

        <div className="w-full bg-zinc-800 rounded-full h-3 mb-6 overflow-hidden">
          <div 
            className="bg-indigo-500 h-3 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {status === 'COMPLETE' && (
          <div className="flex justify-between items-center">
            <button onClick={resetBatch} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
              ← Start New Analysis
            </button>
            
            <button 
              onClick={() => {
                const results = items.filter(i => i.selected).map(i => ({ package: i.name, version: i.version, status: i.status, result: i.result, error: i.error }));
                const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `trustguard-batch-report.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded transition-colors"
            >
              Export Batch JSON
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {selected.map((item, idx) => (
          <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col h-full">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-mono font-semibold text-zinc-100 truncate pr-2" title={item.name}>{item.name}</h4>
              {item.status === 'PENDING' && <span className="text-zinc-500 text-xs uppercase tracking-wider">Pending</span>}
              {item.status === 'SCANNING' && <span className="text-indigo-400 text-xs uppercase tracking-wider animate-pulse flex items-center"><div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>Scanning</span>}
              {item.status === 'FAILED' && <span className="text-red-500 text-xs uppercase tracking-wider">Failed</span>}
              {item.status === 'DONE' && item.result && <RiskBadge score={item.result.riskScore ?? 0} />}
            </div>
            <div className="text-xs font-mono text-zinc-500 mb-4">{item.version} • {item.ecosystem}</div>
            
            <div className="mt-auto">
              {item.status === 'DONE' && item.result && (
                <div className="flex justify-between text-xs border-t border-zinc-800 pt-3">
                  <span className="text-zinc-400">Vulns: <span className={item.result.vulnerabilities?.length ? 'text-red-400' : 'text-green-400'}>{item.result.vulnerabilities?.length || 0}</span></span>
                  <span className="text-zinc-400">Trust: <span className="text-zinc-200">{item.result.trustScore || 0}/100</span></span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
