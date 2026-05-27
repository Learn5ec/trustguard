import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useBatchStore } from '../../store/batchStore';
import type { BatchItem } from '../../store/batchStore';
import { RiskBadge } from '../report/RiskBadge';
import { ScoreGauge } from '../report/ScoreGauge';
import { ExecutiveSummaryPanel } from '../report/ExecutiveSummaryPanel';
import { SecurityFindingsPanel } from '../report/SecurityFindingsPanel';
import { ThreatModel } from '../report/ThreatModel';
import { LicensePanel } from '../report/LicensePanel';
import { VulnerabilityTable } from '../report/VulnerabilityTable';
import { AlternativesPanel } from '../report/AlternativesPanel';
import { RemediationPanel } from '../report/RemediationPanel';
import { RepoMetadataPanel } from '../report/RepoMetadataPanel';
import { TokenUsagePanel } from '../report/TokenUsagePanel';
import { CodeReviewPanel } from '../report/CodeReviewPanel';

// ── Per-item full report view ─────────────────────────────────────────────────

function BatchItemDetail({ item, onBack }: { item: BatchItem; onBack: () => void }) {
  const data   = item.result  || {};
  const report = item.report  || null;
  const communityAssessment = (report as any)?.communityAssessment;

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-6 pb-16">

      {/* Back nav */}
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Batch</span>
        </button>
      </div>

      {/* Header banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono uppercase">
            {data.ecosystem || item.ecosystem}
          </span>
          <h2 className="text-2xl font-bold text-zinc-100">{data.packageName || item.name}</h2>
          <span className="text-zinc-500 font-mono text-sm">{data.version || item.version}</span>
          {data.popularityLabel && (
            <span className="text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded-full">
              {data.popularityLabel}
            </span>
          )}
          {(report as any)?.developerVerdict && (
            <span className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full">
              {(report as any).developerVerdict}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col">
            <span className="text-zinc-500 text-xs mb-2 font-medium uppercase tracking-wider">Risk Score</span>
            <div className="flex items-center gap-3">
              <ScoreGauge score={data.riskScore ?? 0} type="risk" size="lg" />
              <span className="text-sm text-zinc-400">{data.riskScore ?? 0}/100</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-500 text-xs mb-2 font-medium uppercase tracking-wider">Trust Score</span>
            <div className="flex items-center gap-3">
              <ScoreGauge score={data.trustScore ?? 0} type="trust" size="lg" />
              <span className="text-sm text-zinc-400">{data.trustScore ?? 0}/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <ExecutiveSummaryPanel
        executiveSummary={report?.executiveSummary}
        communityAssessment={communityAssessment}
        developerVerdict={(report as any)?.developerVerdict}
        isStreaming={false}
        analysisProgress={null}
      />

      {/* Repo Metadata */}
      <RepoMetadataPanel github={data.github} packageStats={data.packageStats} />

      {/* Code Review — only if present */}
      {report?.codeReview && (
        <CodeReviewPanel codeReview={report.codeReview} isStreaming={false} streamedText="" />
      )}

      {/* Security Findings */}
      {report !== null && (
        <SecurityFindingsPanel
          findings={(report as any)?.securityFindings || (data as any)?.securityFindings}
          isStreaming={false}
          analysisProgress={null}
        />
      )}

      {/* STRIDE Threat Model */}
      <ThreatModel
        threatModel={report?.threatModel}
        isStreaming={false}
        streamedText=""
        analysisProgress={null}
      />

      {/* License */}
      <LicensePanel licenseExplanation={report?.licenseExplanation} />

      {/* CVEs */}
      <VulnerabilityTable vulnerabilities={data.vulnerabilities || []} />

      {/* Alternatives */}
      <AlternativesPanel alternatives={report?.alternatives} />

      {/* Remediation */}
      <RemediationPanel remediationSteps={report?.remediationSteps} />

      {/* Token usage */}
      <TokenUsagePanel usage={item.tokenUsage || null} isLoading={false} />
    </div>
  );
}

// ── Batch overview grid ───────────────────────────────────────────────────────

export function BatchProgress() {
  const { items, status, resetBatch } = useBatchStore();
  const [selectedItem, setSelectedItem] = useState<BatchItem | null>(null);

  const selected    = items.filter(i => i.selected);
  const doneCount   = selected.filter(i => (i.status === 'DONE' || i.status === 'FAILED') && i.retryStatus !== 'pendingRetry' && i.retryStatus !== 'retrying').length;
  const progressPct = selected.length > 0 ? (doneCount / selected.length) * 100 : 0;

  const handleExportMd = () => {
    import('../../lib/export/HtmlExporter').then(m => {
      const md = m.HtmlExporter.generateBatchMarkdown(selected);
      m.HtmlExporter.triggerDownload(md, 'trustguard-batch-report.md', 'text/markdown');
    });
  };

  const handleExportHtml = () => {
    import('../../lib/export/HtmlExporter').then(m => {
      const html = m.HtmlExporter.generateBatchHtml(selected);
      m.HtmlExporter.triggerDownload(html, 'trustguard-batch-report.html', 'text/html');
    });
  };

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selectedItem) {
    return (
      <div className="px-0">
        <BatchItemDetail item={selectedItem} onBack={() => setSelectedItem(null)} />
      </div>
    );
  }

  // ── Overview grid ────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-8 pb-16">

      {/* Progress header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden p-6">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Batch Analysis</h2>
            <p className="text-zinc-400 mt-1 text-sm">
              {status === 'RUNNING'
                ? 'Running full pipeline per package — source fetch, CVE scan, AI analysis…'
                : status === 'RETRYING'
                ? `Retrying rate-limited packages — ${selected.filter(i => i.retryStatus === 'pendingRetry' || i.retryStatus === 'retrying').length} remaining…`
                : 'Analysis complete — click any card to view the full AI report.'}
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
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {status === 'COMPLETE' && (
          <div className="flex flex-wrap justify-between items-center gap-3">
            <button
              onClick={resetBatch}
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
            >
              ← Start New Analysis
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleExportMd}
                className="text-xs px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded transition-colors"
              >
                📝 Export Markdown
              </button>
              <button
                onClick={handleExportHtml}
                className="text-xs px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded transition-colors"
              >
                🌐 Export HTML
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Package cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {selected.map((item, idx) => {
          const lastMsg = item.statusMessages?.length
            ? item.statusMessages[item.statusMessages.length - 1]
            : null;
          const hasFullReport = item.status === 'DONE' && !!item.report;

          // Helper: show N/A when score is 0 or undefined (score of 0 = data unavailable)
          const fmtScore = (score: number | undefined) =>
            (score != null && score > 0) ? `${score}/100` : 'N/A';

          const findingsCount =
            (item.report as any)?.securityFindings?.length ??
            (item.result as any)?.securityFindings?.length ??
            null;

          return (
            <div
              key={idx}
              className={`bg-zinc-900 border rounded-lg p-4 flex flex-col overflow-hidden transition-all ${
                item.status === 'SCANNING'
                  ? 'border-indigo-800/60'
                  : hasFullReport
                  ? 'border-zinc-700 hover:border-indigo-700/50 cursor-pointer hover:bg-zinc-800/30'
                  : 'border-zinc-800'
              }`}
              onClick={() => hasFullReport && setSelectedItem(item)}
            >
              {/* Name row */}
              <div className="flex justify-between items-start mb-1 min-w-0 gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <h4
                    className="font-mono font-semibold text-zinc-100 truncate text-sm leading-tight"
                    title={item.name}
                  >
                    {item.name}
                  </h4>
                  {item.result?.isDeprecated && (
                    <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-700/40 px-1.5 py-0.5 rounded w-fit mt-0.5 whitespace-nowrap">
                      🚫 DEPRECATED
                    </span>
                  )}
                  {!item.result?.isDeprecated && item.result?.isUnmaintained && (
                    <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-700/40 px-1.5 py-0.5 rounded w-fit mt-0.5 whitespace-nowrap">
                      ⚠ UNMAINTAINED
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {item.status === 'PENDING'  && <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Pending</span>}
                  {item.status === 'SCANNING' && (
                    <span className="text-indigo-400 text-[10px] uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />Scanning
                    </span>
                  )}
                  {item.status === 'FAILED'   && <span className="text-red-500 text-[10px] uppercase tracking-wider">Failed</span>}
                  {item.status === 'DONE' && item.result && (
                    <RiskBadge score={item.result.riskScore ?? 0} />
                  )}
                </div>
              </div>

              {/* Version + ecosystem */}
              <div className="text-[10px] font-mono text-zinc-500 mb-2 truncate">
                {item.version || 'latest'} · {item.ecosystem}
              </div>

              {/* Live status while scanning */}
              {item.status === 'SCANNING' && lastMsg && (
                <p className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 mb-2 truncate" title={lastMsg}>
                  {lastMsg.replace(`[${item.name}] `, '')}
                </p>
              )}
              {item.retryStatus === 'retrying' && (
                <p className="text-[10px] text-amber-400 animate-pulse mb-2">
                  Retrying (attempt {item.retryCount}/{3})…
                </p>
              )}
              {item.retryStatus === 'retryFailed' && (
                <p className="text-[10px] text-red-400 mb-2">
                  Failed after 3 retries (rate limit)
                </p>
              )}

              {/* Error */}
              {item.status === 'FAILED' && item.error && (
                <p className="text-[10px] text-red-400 bg-red-900/10 border border-red-900/30 rounded px-2 py-1 mb-2 line-clamp-2" title={item.error}>
                  {item.error}
                </p>
              )}

              {/* Done stats */}
              {item.status === 'DONE' && item.result && (
                <div className="mt-auto space-y-1.5 border-t border-zinc-800 pt-3">
                  {/* CVEs */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-zinc-400 flex-shrink-0">CVEs</span>
                    <span className={`font-mono text-[11px] ${(item.result.vulnerabilities?.length ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {item.result.vulnerabilities?.length ?? 0}
                    </span>
                  </div>
                  {/* Trust Score */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-zinc-400 flex-shrink-0">Trust</span>
                    <span className={`font-mono text-[11px] ${(item.result.trustScore ?? 0) > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>
                      {fmtScore(item.result.trustScore)}
                    </span>
                  </div>
                  {/* AI Report status */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-zinc-400 flex-shrink-0">AI Report</span>
                    <span className={`text-[11px] ${item.report ? 'text-indigo-400' : item.metadataOnly ? 'text-amber-500' : 'text-zinc-600'}`}>
                      {item.report ? '✓ Full report' : item.metadataOnly ? '⚠ No API key' : 'AI failed'}
                    </span>
                  </div>
                  {/* Security Findings — always show when AI report present */}
                  {item.report !== null && (
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="text-zinc-400 flex-shrink-0">Findings</span>
                      <span className={`font-mono text-[11px] ${findingsCount ? 'text-amber-400' : 'text-green-400'}`}>
                        {findingsCount != null ? (findingsCount > 0 ? findingsCount : 'None') : 'None'}
                      </span>
                    </div>
                  )}
                  {/* License — always shown; "—" when not detected */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-zinc-400 flex-shrink-0">License</span>
                    {(() => {
                      const spdx = item.result?.license?.spdxId || (item.result as any)?.github?.license?.spdxId;
                      return spdx
                        ? <span className="text-zinc-200 font-mono text-[10px] truncate max-w-[100px]" title={spdx}>{spdx}</span>
                        : <span className="text-zinc-600 text-[10px]">—</span>;
                    })()}
                  </div>
                  {/* Commercial model — always shown; ⚪ Unknown as fallback */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-zinc-400 flex-shrink-0">Model</span>
                    <span className="text-[10px] whitespace-nowrap">
                      {item.result?.commercialModel === 'open-source' ? '🟢 Open-Source'
                        : item.result?.commercialModel === 'freemium' ? '🟡 Freemium'
                        : item.result?.commercialModel === 'paid' ? '🔴 Paid'
                        : <span className="text-zinc-600">⚪ Unknown</span>}
                    </span>
                  </div>
                  {/* Commercial use — always shown; ⚪ Unknown as fallback */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-zinc-400 flex-shrink-0">Commercial</span>
                    <span className="text-[10px] whitespace-nowrap">
                      {item.result?.commercialUseClassification === 'allowed' ? '✅ Allowed'
                        : item.result?.commercialUseClassification === 'restricted' ? '🚫 Restricted'
                        : item.result?.commercialUseClassification === 'needs-permission' ? '⚠️ Permission Needed'
                        : <span className="text-zinc-600">⚪ Unknown</span>}
                    </span>
                  </div>
                  {/* Source confidence */}
                  {item.result?.resolverConfidence && (
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="text-zinc-400 flex-shrink-0">Src Confidence</span>
                      <span className={`text-[10px] font-semibold whitespace-nowrap ${
                        item.result.resolverConfidence === 'VERIFIED'   ? 'text-green-400'
                        : item.result.resolverConfidence === 'HIGH'     ? 'text-emerald-400'
                        : item.result.resolverConfidence === 'MEDIUM'   ? 'text-amber-400'
                        : item.result.resolverConfidence === 'LOW'      ? 'text-orange-400'
                        : 'text-red-400'
                      }`}>
                        {item.result.resolverConfidence === 'VERIFIED'   ? '✓ Verified'
                          : item.result.resolverConfidence === 'HIGH'    ? '↑ High'
                          : item.result.resolverConfidence === 'MEDIUM'  ? '~ Medium'
                          : item.result.resolverConfidence === 'LOW'     ? '↓ Low'
                          : '? Unresolved'}
                      </span>
                    </div>
                  )}
                  {/* Developer verdict — color-coded */}
                  {(item.report as any)?.developerVerdict && (() => {
                    const verdict: string = (item.report as any).developerVerdict;
                    const vCls = verdict === 'USE'
                      ? 'text-green-400 border-green-800/50 bg-green-900/20'
                      : verdict === 'USE_WITH_CAUTION' || verdict === 'REPLACE_SOON'
                      ? 'text-amber-400 border-amber-800/50 bg-amber-900/20'
                      : verdict === 'AVOID'
                      ? 'text-red-400 border-red-800/50 bg-red-900/20'
                      : 'text-zinc-400 border-zinc-700 bg-zinc-800/30';
                    return (
                      <div className="mt-2 pt-2 border-t border-zinc-800">
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${vCls}`} title={verdict}>
                          {verdict}
                        </span>
                      </div>
                    );
                  })()}
                  {/* Warning when metadata-only (no API key) */}
                  {item.metadataOnly && (
                    <div className="mt-2 pt-2 border-t border-zinc-800">
                      <p className="text-[10px] text-amber-600 leading-tight">
                        Add an API key in Settings for full AI analysis.
                      </p>
                    </div>
                  )}
                  {/* AI error note */}
                  {!item.metadataOnly && !item.report && item.error && (
                    <div className="mt-2 pt-2 border-t border-zinc-800">
                      <p className="text-[10px] text-red-500 line-clamp-2" title={item.error}>
                        {item.error}
                      </p>
                    </div>
                  )}
                  {hasFullReport && (
                    <div className="mt-2 pt-1">
                      <span className="text-[10px] text-indigo-500">Click to view full report →</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
