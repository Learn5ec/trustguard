import { Header } from './components/layout/Header';
import { LandingPage } from './components/layout/LandingPage';
import { ReportContainer } from './components/report/ReportContainer';
import { DependencySelector } from './components/batch/DependencySelector';
import { BatchProgress } from './components/batch/BatchProgress';
import { useAnalysisStore } from './store/analysisStore';
import { useBatchStore } from './store/batchStore';
import { useSettingsStore } from './store/settingsStore';
import { AlertTriangle, Settings } from 'lucide-react';

function App() {
  const { packageData, report, isAnalyzing, llmStream, statusMessages, needsApiKey, tokenUsage, reset } = useAnalysisStore();
  const { status: batchStatus } = useBatchStore();
  const { llmProvider } = useSettingsStore();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col font-sans">
      <Header />
      <main className="flex-1 w-full">
        {batchStatus === 'SELECTING' ? (
          <div className="px-6"><DependencySelector /></div>
        ) : batchStatus === 'RUNNING' || batchStatus === 'COMPLETE' ? (
          <div className="px-6"><BatchProgress /></div>
        ) : needsApiKey ? (
          <div className="w-full max-w-2xl mx-auto mt-16 px-6">
            <div className="bg-zinc-900 border border-amber-800/40 rounded-xl p-8 text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-amber-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>
              </div>
              
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">LLM Provider Not Configured</h2>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
                  To analyse <span className="font-mono text-indigo-400 font-semibold">{packageData?.packageName || 'this package'}</span>, 
                  you need to configure an API key for <span className="font-semibold text-zinc-200">{llmProvider}</span>.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-zinc-500 text-xs">
                  Click the <Settings className="w-3.5 h-3.5 inline-block mx-0.5 -mt-0.5" /> gear icon in the header to open settings, 
                  then paste your API key and select a model.
                </p>
                
                <button
                  onClick={reset}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                  ← Back to Search
                </button>
              </div>
            </div>
          </div>
        ) : !packageData && !isAnalyzing ? (
          <LandingPage />
        ) : (
          <div className="px-6">
            <ReportContainer
              data={packageData || {}}
              report={report}
              isLoading={isAnalyzing}
              llmStream={llmStream}
              statusMessages={statusMessages}
              tokenUsage={tokenUsage}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
