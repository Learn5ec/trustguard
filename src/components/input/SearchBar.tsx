import { Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { validatePackageInput } from '../../lib/validation';
import { useAnalysisStore } from '../../store/analysisStore';
import { useBatchStore } from '../../store/batchStore';
import { getParserForFile } from '../../lib/parsers/detector';

export function SearchBar() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const startAnalysis = useAnalysisStore(state => state.startAnalysis);
  const startBatch = useBatchStore(state => state.startBatch);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validatePackageInput(input);

    if (!result.valid) {
      setError(result.error || 'Invalid input');
      return;
    }

    setError(null);
    startAnalysis(result.value!, result.version || 'latest', result.type as string);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const parser = getParserForFile(file.name);
    if (!parser) {
      alert(`Unsupported file format: ${file.name}. \n\nNote: Docker image scanning requires backend support and is planned for future versions.`);
      return;
    }

    try {
      const content = await file.text();
      const deps = parser.parse(content);
      startBatch(deps);
    } catch (err) {
      alert(`Error reading file: ${(err as Error).message}`);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-zinc-100 mb-4">Analyse any package, repo, or dependency file</h2>
        <p className="text-zinc-400">npm, PyPI, Go, Rust, Maven, Pub • GitHub URLs • package.json, requirements.txt, pubspec.yaml, pyproject.toml</p>
      </div>

      <form onSubmit={handleSearch} className="relative">
        <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <div className="pl-4 text-zinc-400">
            <Search className="w-5 h-5" />
          </div>
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="lodash, lodash@4.17.11, @types/node, https://github.com/org/repo"
            className="flex-1 bg-transparent py-4 px-4 text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button 
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-4 px-6 transition-colors"
          >
            Analyse
          </button>
        </div>
        {error && <p className="absolute -bottom-6 left-0 text-red-500 text-sm">{error}</p>}
      </form>

      <div className="mt-8 flex justify-center">
        <label className="flex items-center space-x-2 px-4 py-2 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors text-zinc-300 cursor-pointer">
          <Upload className="w-4 h-4" />
          <span>Upload manifest file</span>
          <input 
            type="file" 
            className="hidden" 
            accept=".json,.txt,.lock,.yaml,.toml,.xml,.gradle,.exs"
            onChange={handleFileUpload}
          />
        </label>
      </div>
    </div>
  );
}
