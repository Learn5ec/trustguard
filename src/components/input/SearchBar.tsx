import { Search, Upload, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { validatePackageInput } from '../../lib/validation';
import { useAnalysisStore } from '../../store/analysisStore';
import { useBatchStore } from '../../store/batchStore';
import { getParserForFile, detectEcosystemFromFilename } from '../../lib/parsers/detector';
import type { Ecosystem } from '../../types/analysis';

const ECOSYSTEM_OPTIONS: { value: Ecosystem; label: string }[] = [
  { value: 'npm',       label: 'npm' },
  { value: 'pypi',      label: 'PyPI' },
  { value: 'uv',        label: 'uv (Python)' },
  { value: 'pip',       label: 'pip (Python)' },
  { value: 'pipx',      label: 'pipx (Python CLI)' },
  { value: 'rust',      label: 'Crates.io (Rust)' },
  { value: 'go',        label: 'Go Modules' },
  { value: 'pub',       label: 'pub.dev (Dart/Flutter)' },
  { value: 'maven',     label: 'Maven Central' },
  { value: 'nuget',     label: 'NuGet (.NET)' },
  { value: 'ruby',      label: 'RubyGems' },
  { value: 'hex',       label: 'Hex.pm (Elixir)' },
  { value: 'packagist', label: 'Packagist (PHP)' },
  { value: 'conda',     label: 'Conda' },
];

export function SearchBar() {
  const [input, setInput] = useState('');
  const [selectedEcosystem, setSelectedEcosystem] = useState<Ecosystem | ''>('');
  const [isGithubUrl, setIsGithubUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startAnalysis = useAnalysisStore(state => state.startAnalysis);
  const startBatch = useBatchStore(state => state.startBatch);

  const handleInputChange = (value: string) => {
    setInput(value);
    const trimmed = value.trim();
    const isGH = trimmed.startsWith('https://github.com/') || trimmed.startsWith('http://github.com/');
    setIsGithubUrl(isGH);
    if (isGH) setSelectedEcosystem('');
    if (error) setError(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validatePackageInput(input);

    if (!result.valid) {
      setError(result.error || 'Invalid input');
      return;
    }

    // Ecosystem dropdown required when input is not a GitHub URL
    if (!isGithubUrl && !selectedEcosystem) {
      setError('Please select an ecosystem (npm, PyPI, etc.) for this package.');
      return;
    }

    setError(null);

    const ecosystem: string = isGithubUrl
      ? 'github'
      : selectedEcosystem || (result.type as string);

    startAnalysis(result.value!, result.version || 'latest', ecosystem, result.subPath, result.gitBranch);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto-detect ecosystem from filename — no dropdown needed
    const detectedEcosystem = detectEcosystemFromFilename(file.name);

    const parser = getParserForFile(file.name);
    if (!parser) {
      alert(`Unsupported file format: ${file.name}.\n\nSupported files: package.json, package-lock.json, requirements.txt, pubspec.yaml, pyproject.toml, Cargo.toml, Cargo.lock, Gemfile.lock, go.mod, go.sum, composer.json, composer.lock`);
      return;
    }

    try {
      const content = await file.text();
      const deps = parser.parse(content, file.name);

      // Override each dependency's ecosystem if we detected one from filename
      const finalDeps = detectedEcosystem
        ? deps.map(d => ({ ...d, ecosystem: detectedEcosystem }))
        : deps;

      startBatch(finalDeps);
    } catch (err) {
      alert(`Error reading file: ${(err as Error).message}`);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-zinc-100 mb-4">Analyse any package, repo, or dependency file</h2>
        <p className="text-zinc-400">
          npm · PyPI · uv · pip · pipx · Go · Rust · Maven · NuGet · RubyGems · Hex.pm · Packagist · pub.dev · GitHub URLs
        </p>
      </div>

      <form onSubmit={handleSearch} className="relative">
        <div className="flex flex-col gap-2">
          {/* Search input row */}
          <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <div className="pl-4 text-zinc-400 flex-shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="lodash, lodash@4.17.11, requests, https://github.com/org/repo"
              className="flex-1 bg-transparent py-4 px-4 text-zinc-100 outline-none placeholder:text-zinc-500 min-w-0"
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-4 px-6 transition-colors flex-shrink-0"
            >
              Analyse
            </button>
          </div>

          {/* Ecosystem dropdown — required when not a GitHub URL */}
          {!isGithubUrl && (
            <div className="relative">
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500">
                <ChevronDown className="w-4 h-4" />
              </div>
              <select
                value={selectedEcosystem}
                onChange={(e) => setSelectedEcosystem(e.target.value as Ecosystem | '')}
                className={`w-full bg-zinc-900 border rounded-lg py-2.5 pl-4 pr-10 text-sm outline-none appearance-none transition-all cursor-pointer ${
                  selectedEcosystem
                    ? 'border-indigo-600 text-zinc-100'
                    : 'border-zinc-700 text-zinc-500 focus:border-indigo-500'
                }`}
              >
                <option value="">Select ecosystem (required) — npm, PyPI, Rust, Go…</option>
                {ECOSYSTEM_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
      </form>

      <div className="mt-6 flex justify-center">
        <label className="flex items-center space-x-2 px-4 py-2 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors text-zinc-300 cursor-pointer">
          <Upload className="w-4 h-4" />
          <span>Upload a file</span>
          <input
            type="file"
            className="hidden"
            accept=".json,.txt,.lock,.yaml,.yml,.toml,.xml,.gradle,.kts,.exs,.gemspec,.mod,.sum,.cfg"
            onChange={handleFileUpload}
          />
        </label>
      </div>
      <p className="text-center text-xs text-zinc-600 mt-2">
        Supported: package.json · package-lock.json · requirements.txt · pyproject.toml · pubspec.yaml · Cargo.toml · go.mod · composer.json · Gemfile.lock
      </p>
    </div>
  );
}
