import { SearchBar } from '../input/SearchBar';
import { Shield, Lock, Zap, FileJson, CheckCircle, Key, Search, FileText, Bot } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="w-full flex flex-col items-center">
      
      {/* Hero Section */}
      <section className="w-full max-w-5xl mx-auto pt-24 pb-16 px-6 text-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-sm mb-8">
          <Shield className="w-4 h-4" />
          <span>Next-Generation Dependency Security</span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold text-zinc-100 tracking-tight mb-6">
          Analyze supply chain risks with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AI precision.</span>
        </h1>
        
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-12">
          Instantly evaluate npm, PyPI, uv, pip, Go, Rust, Maven, and more packages. TrustGuard AI combines real-time OSV vulnerability databases with deep AI threat modeling to keep your architecture secure.
        </p>

        {/* Search Bar is embedded here */}
        <div className="max-w-2xl mx-auto relative z-20">
          <SearchBar />
        </div>
      </section>

      {/* Security Guarantee Section */}
      <section className="w-full bg-zinc-900/50 border-y border-zinc-800/50 py-16">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-zinc-100 mb-6">Zero Backend. Absolute Privacy.</h2>
            <p className="text-zinc-400 mb-6 leading-relaxed">
              Most security tools send your code and queries to their proprietary servers. TrustGuard AI is built differently. It's a <strong>100% client-side application</strong>.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-zinc-300">Your API keys never leave your browser (stored in volatile <code className="text-indigo-400 bg-zinc-800 px-1 rounded">sessionStorage</code>).</span>
              </li>
              <li className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-zinc-300">Direct connections to LLM Providers (OpenAI, Anthropic, Mistral). No middleman.</span>
              </li>
              <li className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-zinc-300">Run completely locally using Ollama for true air-gapped security.</span>
              </li>
            </ul>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 blur-3xl rounded-full"></div>
            <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-zinc-800">
                <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center">
                  <Lock className="w-6 h-6 text-zinc-300" />
                </div>
                <div>
                  <h3 className="text-zinc-100 font-semibold">Browser-Native Security</h3>
                  <p className="text-sm text-zinc-500">No supply chain data leaks</p>
                </div>
              </div>
              <div className="space-y-3 font-mono text-sm">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>OSV.dev Database</span>
                  <span className="text-green-400">Encrypted (TLS)</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>API Credentials</span>
                  <span className="text-cyan-400">Volatile Memory</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Local LLM Querying</span>
                  <span className="text-indigo-400">Air-gapped Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="w-full max-w-5xl mx-auto py-24 px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-zinc-100 mb-4">What it provides</h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">Comprehensive analysis merging hard vulnerability data with intelligent threat modeling.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:bg-zinc-800/50 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center mb-4">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Vulnerability Matrices</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Exact CVE matches, transitive dependency mapping, and specific fixed-in version resolutions using OSV.dev and OpenSSF data.
            </p>
          </div>
          
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:bg-zinc-800/50 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">STRIDE Threat Models</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              AI-generated threat models mapping vulnerabilities to the STRIDE framework to help you understand exact exploit vectors.
            </p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:bg-zinc-800/50 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-4">
              <FileJson className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Multi-Format Exports</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Export comprehensive JSON data, beautifully formatted Markdown, clean HTML, or print-ready PDF reports for compliance tracking.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Transparency Section */}
<section className="w-full max-w-5xl mx-auto py-20 px-6">
  <div className="text-center mb-12">
    <h2 className="text-3xl font-bold text-zinc-100 mb-4">Transparent AI Costs</h2>
    <p className="text-zinc-400 max-w-2xl mx-auto">
      TrustGuard AI uses your own API key — you pay your provider directly. No markup, no subscription.
      Here are typical costs for two common scenarios.
    </p>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

    {/* Single Repo Scan */}
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
          <Search className="w-4 h-4 text-indigo-400" />
        </div>
        <h3 className="text-lg font-bold text-zinc-100">Single Package / Repo Scan</h3>
      </div>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        Typical: ~8,000 input + 2,500 output tokens. Includes source code fetch, OSV scan, full AI threat analysis.
        Monorepo (5 chunks) ≈ 5× more input tokens.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left pb-2 text-zinc-500 font-medium text-xs">Model</th>
            <th className="text-right pb-2 text-zinc-500 font-medium text-xs">Est. Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          <tr><td className="py-2 text-zinc-300">Ollama (local)</td><td className="py-2 text-right text-green-400 font-mono text-xs font-bold">Free</td></tr>
          <tr><td className="py-2 text-zinc-300">Gemini 2.5 Flash</td><td className="py-2 text-right text-green-400 font-mono text-xs">~$0.003</td></tr>
          <tr><td className="py-2 text-zinc-300">GPT-4o-mini</td><td className="py-2 text-right text-green-400 font-mono text-xs">~$0.003</td></tr>
          <tr><td className="py-2 text-zinc-300">Groq Llama 3.3 70B</td><td className="py-2 text-right text-zinc-300 font-mono text-xs">~$0.007</td></tr>
          <tr><td className="py-2 text-zinc-300">Mistral Large</td><td className="py-2 text-right text-zinc-300 font-mono text-xs">~$0.025</td></tr>
          <tr><td className="py-2 text-zinc-300">GPT-4o</td><td className="py-2 text-right text-zinc-300 font-mono text-xs">~$0.045</td></tr>
          <tr><td className="py-2 text-zinc-300">Claude Sonnet 4.6</td><td className="py-2 text-right text-amber-400 font-mono text-xs">~$0.062</td></tr>
          <tr><td className="py-2 text-zinc-300">Claude Opus 4.7</td><td className="py-2 text-right text-red-400 font-mono text-xs">~$0.31</td></tr>
        </tbody>
      </table>
    </div>

    {/* Batch 50 deps */}
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-cyan-400" />
        </div>
        <h3 className="text-lg font-bold text-zinc-100">Batch Scan — 50 Dependencies</h3>
      </div>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        Typical: ~65,000 input + 75,000 output tokens total. Full AI report per package — executive summary,
        STRIDE threat model, security findings, remediation, alternatives.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left pb-2 text-zinc-500 font-medium text-xs">Model</th>
            <th className="text-right pb-2 text-zinc-500 font-medium text-xs">Est. Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          <tr><td className="py-2 text-zinc-300">Ollama (local)</td><td className="py-2 text-right text-green-400 font-mono text-xs font-bold">Free</td></tr>
          <tr><td className="py-2 text-zinc-300">Gemini 2.5 Flash</td><td className="py-2 text-right text-green-400 font-mono text-xs">~$0.055</td></tr>
          <tr><td className="py-2 text-zinc-300">GPT-4o-mini</td><td className="py-2 text-right text-green-400 font-mono text-xs">~$0.055</td></tr>
          <tr><td className="py-2 text-zinc-300">Groq Llama 3.3 70B</td><td className="py-2 text-right text-zinc-300 font-mono text-xs">~$0.097</td></tr>
          <tr><td className="py-2 text-zinc-300">Mistral Large</td><td className="py-2 text-right text-zinc-300 font-mono text-xs">~$0.58</td></tr>
          <tr><td className="py-2 text-zinc-300">GPT-4o</td><td className="py-2 text-right text-amber-400 font-mono text-xs">~$0.91</td></tr>
          <tr><td className="py-2 text-zinc-300">Claude Sonnet 4.6</td><td className="py-2 text-right text-amber-400 font-mono text-xs">~$1.32</td></tr>
          <tr><td className="py-2 text-zinc-300">Claude Opus 4.7</td><td className="py-2 text-right text-red-400 font-mono text-xs">~$6.60</td></tr>
        </tbody>
      </table>
    </div>

  </div>

  <p className="text-center text-zinc-600 text-xs mt-6">
    Estimates based on typical usage. Actual cost depends on package complexity, source code size, and model response length. Token counts visible in every report.
  </p>
</section>

      {/* How to Use Section */}
      <section className="w-full bg-zinc-900/30 border-t border-zinc-800/50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-zinc-100 mb-4">How to Use?</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">Get started scanning packages and analyzing supply chain security risks in under a minute.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/15 flex items-center justify-center mb-4 border border-indigo-500/25">
                <Key className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-zinc-200 font-semibold mb-2">1. Set API Key</h3>
              <p className="text-zinc-500 text-xs leading-relaxed px-4">
                Click settings (⚙) in the top-right corner, select your AI provider (e.g. OpenAI or Ollama), and enter your credentials.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/15 flex items-center justify-center mb-4 border border-indigo-500/25">
                <Search className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-zinc-200 font-semibold mb-2">2. Search Dependency</h3>
              <p className="text-zinc-500 text-xs leading-relaxed px-4">
                Enter npm, PyPI, or Go packages (e.g., <code className="text-zinc-300">npm:lodash@4.17.21</code>) or a direct GitHub Repository URL.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/15 flex items-center justify-center mb-4 border border-indigo-500/25">
                <Bot className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-zinc-200 font-semibold mb-2">3. AI & Code Review</h3>
              <p className="text-zinc-500 text-xs leading-relaxed px-4">
                TrustGuard AI fetches vulnerabilities, calculates Risk/Trust scores, and feeds package code to our Secure Code Review Agent.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/15 flex items-center justify-center mb-4 border border-indigo-500/25">
                <FileText className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-zinc-200 font-semibold mb-2">4. Export Reports</h3>
              <p className="text-zinc-500 text-xs leading-relaxed px-4">
                Download threat intelligence findings in JSON, Markdown, HTML, or print as PDF directly from the report export menu.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="w-full border-t border-zinc-800/30 bg-zinc-900/20 py-6">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-zinc-600 text-xs text-center leading-relaxed">
            ⚠️ <strong className="text-zinc-500">Disclaimer:</strong> TrustGuard AI is an automated research and due-diligence tool for developers.
            Analysis may be incomplete — always verify critical security findings independently before making decisions.{' '}
            <strong className="text-zinc-500">The misuse of any security information obtained through this tool is entirely the responsibility of the user.</strong>{' '}
            Do not use TrustGuard AI to target systems you do not own or have explicit authorisation to analyse.
          </p>
        </div>
      </section>

    </div>
  );
}
