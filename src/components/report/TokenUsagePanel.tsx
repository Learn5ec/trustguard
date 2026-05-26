import type { TokenUsage } from '../../types/analysis';
import { formatCost } from '../../lib/llm/tokenPricing';

interface Props {
  usage: TokenUsage | null;
  isLoading?: boolean;
}

export function TokenUsagePanel({ usage, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center gap-3 text-xs text-zinc-500">
        <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <span>Tracking token usage...</span>
      </div>
    );
  }

  if (!usage) return null;

  const costDisplay = formatCost(usage.estimatedCostUSD);
  const isFree = usage.estimatedCostUSD === 0;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <span className="text-indigo-400">🪙</span> Token Usage &amp; Cost
        </h3>
        {usage.isEstimated && (
          <span className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full">
            ≈ estimated
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Input tokens */}
        <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Input tokens</div>
          <div className="text-zinc-100 font-mono font-bold">{usage.inputTokens.toLocaleString()}</div>
        </div>

        {/* Output tokens */}
        <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Output tokens</div>
          <div className="text-zinc-100 font-mono font-bold">{usage.outputTokens.toLocaleString()}</div>
        </div>

        {/* Total tokens */}
        <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Total tokens</div>
          <div className="text-indigo-300 font-mono font-bold">{usage.totalTokens.toLocaleString()}</div>
        </div>

        {/* Estimated cost */}
        <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Est. cost</div>
          <div className={`font-mono font-bold ${isFree ? 'text-green-400' : 'text-yellow-300'}`}>
            {costDisplay}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
        Model: <span className="text-zinc-500 font-mono">{usage.provider}/{usage.model}</span>
        {usage.isEstimated
          ? ' · Token counts are estimated (~4 chars/token) since this provider did not return exact usage data.'
          : ' · Token counts reported directly by the API.'}
        {' '}Costs are approximate and based on public pricing as of 2026.
      </p>
    </div>
  );
}
