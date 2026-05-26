import { Shield, Settings, X, Info } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import type { LLMProviderId } from '../../store/settingsStore';
import { LLMKeyManager } from '../../lib/keyManager';
import { useAnalysisStore } from '../../store/analysisStore';
import { useBatchStore } from '../../store/batchStore';

const PROVIDER_OPTIONS: { id: LLMProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'mistral', label: 'Mistral AI' },
  { id: 'zhipu', label: 'GLM (Zhipu AI)' },
  { id: 'zai', label: 'z.ai' },
  { id: 'groq', label: 'Groq' },
  { id: 'together', label: 'Together AI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'ollama', label: 'Ollama (Local)' },
];

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [privateRepoTipOpen, setPrivateRepoTipOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  
  const { 
    llmProvider, 
    llmModel, 
    setLLMProvider, 
    setLLMModel, 
    githubToken, 
    setGithubToken,
    availableModels,
    isLoadingModels,
    modelsError,
    fetchAvailableModels
  } = useSettingsStore();
  
  const resetAnalysis = useAnalysisStore(state => state.reset);
  const resetBatch = useBatchStore(state => state.resetBatch);

  const hasKey = llmProvider === 'ollama' ? true : !!LLMKeyManager.get(llmProvider);

  // Fetch available models whenever settings drawer opens or selected provider changes
  useEffect(() => {
    if (settingsOpen) {
      fetchAvailableModels(llmProvider);
    }
  }, [settingsOpen, llmProvider]);

  const handleSaveKey = () => {
    const key = apiKeyInput.trim();
    if (key) {
      LLMKeyManager.save(llmProvider, key);
      setApiKeyInput('');
      setSaved(true);
      fetchAvailableModels(llmProvider, key);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleHome = () => {
    resetAnalysis();
    resetBatch();
  };

  return (
    <>
      <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-4 flex items-center justify-between relative z-50">
        <button onClick={handleHome} className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
          <Shield className="w-8 h-8 text-indigo-500" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">TrustGuard AI</h1>
        </button>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-xs text-zinc-500">{llmProvider}/{llmModel}</span>
          </div>
          <button 
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Settings Drawer Overlay */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSettingsOpen(false)}></div>
          <div className="relative w-96 bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-zinc-100">Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-zinc-400 hover:text-zinc-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* LLM Provider */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">LLM Provider</label>
                <select 
                  value={llmProvider}
                  onChange={(e) => {
                    const id = e.target.value as LLMProviderId;
                    setLLMProvider(id, ''); // Triggers model fetch in settingsStore
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  {PROVIDER_OPTIONS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Model Selection */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-zinc-300">Model</label>
                  {isLoadingModels && (
                    <span className="text-xs text-indigo-400 animate-pulse">Loading live models...</span>
                  )}
                </div>
                <select 
                  value={llmModel}
                  onChange={(e) => setLLMModel(e.target.value)}
                  disabled={isLoadingModels || availableModels.length === 0}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {modelsError && (
                  <p className="text-xs text-amber-500 mt-1.5 bg-amber-950/20 border border-amber-900/30 rounded p-1.5">
                    {modelsError}
                  </p>
                )}
              </div>

              {/* API Key */}
              {llmProvider !== 'ollama' ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    API Key for {llmProvider}
                    {hasKey && <span className="ml-2 text-green-400 text-xs">(configured ✓)</span>}
                  </label>
                  <div className="flex space-x-2">
                    <input 
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={hasKey ? '••••••••••' : 'Paste your API key'}
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <button 
                      onClick={handleSaveKey}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-md transition-colors font-medium"
                    >
                      {saved ? '✓' : 'Save'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {llmProvider === 'zhipu' 
                      ? 'Format: APIKeyID.APIKeySecret (e.g. 1a2b3c4d5e.f6g7h8i9j)'
                      : 'Stored in sessionStorage only. Never persisted to disk.'}
                  </p>
                  
                  {/* Security Warning */}
                  <div className="mt-3 bg-amber-950/30 border border-amber-900/50 rounded p-2.5">
                    <p className="text-xs text-amber-500 flex items-start">
                      <span className="mr-1.5 mt-0.5">⚠️</span>
                      <span><strong>Security Best Practice:</strong> Ensure you keep the life of this token as short as possible, or restrict its scope to prevent abuse.</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-md p-3">
                  <p className="text-xs text-zinc-400">
                    Ollama runs locally on <code className="text-indigo-400">http://localhost:11434</code>. No API Key required.
                  </p>
                </div>
              )}

              <hr className="border-zinc-800" />

              {/* GitHub Token */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-300">
                    GitHub Token <span className="text-zinc-500">(optional)</span>
                  </label>
                  {/* Private repo info tooltip */}
                  <div className="relative" ref={tipRef}>
                    <button
                      type="button"
                      onMouseEnter={() => setPrivateRepoTipOpen(true)}
                      onMouseLeave={() => setPrivateRepoTipOpen(false)}
                      onFocus={() => setPrivateRepoTipOpen(true)}
                      onBlur={() => setPrivateRepoTipOpen(false)}
                      onClick={() => setPrivateRepoTipOpen(v => !v)}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      aria-label="How to scan a private repo"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Private repo?</span>
                    </button>

                    {privateRepoTipOpen && (
                      <div className="absolute right-0 top-6 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-[200] p-4 text-xs text-zinc-400 space-y-3">
                        {/* Arrow */}
                        <div className="absolute -top-1.5 right-3 w-3 h-3 bg-zinc-900 border-l border-t border-zinc-700 rotate-45" />

                        <p className="font-semibold text-zinc-200 text-sm">Scanning a private repo</p>

                        <div className="space-y-2.5">
                          <div className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold text-[10px]">1</span>
                            <div>
                              <p className="text-zinc-300 font-medium">Generate a GitHub PAT</p>
                              <p className="text-zinc-500 mt-0.5 leading-relaxed">
                                GitHub → Settings → Developer settings → Personal access tokens.
                                Use a <span className="text-indigo-300">fine-grained PAT</span> with <span className="font-mono text-zinc-300">Contents: Read-only</span> on just your repo, or a classic PAT with the <span className="font-mono text-zinc-300">repo</span> scope.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold text-[10px]">2</span>
                            <div>
                              <p className="text-zinc-300 font-medium">Paste the token here</p>
                              <p className="text-zinc-500 mt-0.5 leading-relaxed">
                                Paste it into the field below. It's stored in <span className="text-zinc-300">sessionStorage</span> only — cleared when you close the tab, never sent anywhere except GitHub's API.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold text-[10px]">3</span>
                            <div>
                              <p className="text-zinc-300 font-medium">Search using the full URL</p>
                              <p className="text-zinc-500 mt-0.5 leading-relaxed">
                                Paste the repo URL into the search bar, e.g.
                              </p>
                              <code className="block mt-1 bg-zinc-950 text-indigo-300 px-2 py-1 rounded text-[10px] break-all">
                                https://github.com/you/private-repo
                              </code>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-zinc-800 pt-2 text-[10px] text-zinc-600 leading-relaxed">
                          Use the shortest-lived token possible. Revoke it on GitHub once you're done scanning.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <input
                  type="password"
                  value={githubToken || ''}
                  onChange={(e) => setGithubToken(e.target.value || null)}
                  placeholder="ghp_..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Increases GitHub API rate limit from 60 → 5,000 req/hour. Required for private repos.
                </p>
              </div>

              <hr className="border-zinc-800" />

              {/* Security Notice */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-md p-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Security Notice</h4>
                <ul className="text-xs text-zinc-500 space-y-1 list-disc list-inside">
                  <li>API keys are stored in sessionStorage (cleared on tab close)</li>
                  <li>Keys are never written to disk, localStorage, or cookies</li>
                  <li>Keys are sent directly to the LLM provider's API endpoint</li>
                  <li>No server-side proxy — all requests are client-side</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
