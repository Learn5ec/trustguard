import type { PackageAnalysisData, AnalysisReport, TokenUsage } from '../../types/analysis';
import { useAnalysisStore } from '../../store/analysisStore';
import { ArrowLeft } from 'lucide-react';
import { RiskBadge } from './RiskBadge';
import { ScoreGauge } from './ScoreGauge';
import { VulnerabilityTable } from './VulnerabilityTable';
import { ThreatModel } from './ThreatModel';
import { LicensePanel } from './LicensePanel';
import { RepoMetadataPanel } from './RepoMetadataPanel';
import { CodeReviewPanel } from './CodeReviewPanel';
import { SecurityFindingsPanel } from './SecurityFindingsPanel';
import { ExecutiveSummaryPanel } from './ExecutiveSummaryPanel';
import { AlternativesPanel } from './AlternativesPanel';
import { RemediationPanel } from './RemediationPanel';
import { TokenUsagePanel } from './TokenUsagePanel';

interface ReportContainerProps {
  data: Partial<PackageAnalysisData>;
  report: Partial<AnalysisReport> | null;
  isLoading: boolean;
  llmStream: string;
  statusMessages: string[];
  tokenUsage: TokenUsage | null;
}

function ScoreBreakdownTable({ items, type }: { items: { factor: string; impact: number; description: string }[]; type: 'risk' | 'trust' }) {
  if (!items || items.length === 0) return <p className="text-zinc-600 text-xs italic">No significant factors.</p>;
  return (
    <div className="space-y-2 mt-3">
      {items.map((b, i) => (
        <div key={i} className="flex flex-col text-xs bg-zinc-950 rounded px-3 py-2">
          <div className="flex justify-between font-medium">
            <span className="text-zinc-400">{b.factor}</span>
            <span className={type === 'risk' ? 'text-red-400' : b.impact >= 0 ? 'text-green-400' : 'text-amber-400'}>
              {b.impact > 0 ? '+' : ''}{b.impact}
            </span>
          </div>
          <span className="text-zinc-500 text-[10px] leading-tight mt-0.5">{b.description}</span>
        </div>
      ))}
      <p className="text-zinc-600 text-[10px] italic pt-1">
        {type === 'risk'
          ? 'Risk Score = Vulnerabilities(0-40) + Maintenance(0-25) + Archived(+20) + Scorecard(0-20) + License(0-10) + Transitive(0-5)'
          : 'Trust Score starts at 100. Deductions for risk factors, low adoption, single maintainer, inactivity. Bonuses for active development, high adoption, and clean scorecard.'}
      </p>
    </div>
  );
}

export function ReportContainer({ data, report, isLoading, llmStream, statusMessages, tokenUsage }: ReportContainerProps) {
  const resetAnalysis = useAnalysisStore(state => state.reset);
  const analysisProgress = useAnalysisStore(state => state.analysisProgress);

  // Only resets analysis state (packageData, report, stream, etc.)
  // Settings (LLM API key, GitHub token) live in settingsStore / sessionStorage
  // and are intentionally NOT touched here.
  const handleBack = () => {
    resetAnalysis();
  };

  if (isLoading && !data.packageName) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-12 p-8 border border-zinc-800 rounded-lg bg-zinc-900 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-zinc-400 text-center space-y-1">
          {statusMessages.map((msg, i) => (
            <p key={i} className={i === statusMessages.length - 1 ? 'text-zinc-100 font-medium' : 'opacity-50'}>{msg}</p>
          ))}
        </div>
      </div>
    );
  }

  const communityAssessment = (report as any)?.communityAssessment;

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-6 pb-16">

      {/* Back / New Search button */}
      <div className="flex items-center">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>New Search</span>
        </button>
      </div>

      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs font-mono uppercase">
                {data.ecosystem || 'npm'}
              </span>
              <h2 className="text-2xl font-bold text-zinc-100">{data.packageName || 'Unknown'}</h2>
              <span className="text-zinc-500 font-mono text-sm">{data.version || 'latest'}</span>
              {data.popularityLabel && (
                <span className="text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded-full">
                  {data.popularityLabel}
                </span>
              )}
            </div>
            {/* Version info row */}
            <div className="flex flex-wrap gap-4 mt-1 mb-4 text-xs text-zinc-500">
              {data.packageStats?.latestVersion && (
                <span>Latest: <span className="text-zinc-300 font-mono">{data.packageStats.latestVersion}</span></span>
              )}
              {data.github?.latestRelease && (
                <span>Latest Release: <span className="text-zinc-300 font-mono">{data.github.latestRelease}</span></span>
              )}
              {data.packageStats?.latestSecureVersion && data.packageStats.latestSecureVersion !== data.packageStats.latestVersion && (
                <span className="text-green-400">Latest Secure: <span className="font-mono font-bold">{data.packageStats.latestSecureVersion}</span> ✓</span>
              )}
              {data.packageStats?.weeklyDownloads !== undefined && (
                <span>⬇ {data.packageStats.weeklyDownloads.toLocaleString()}/wk</span>
              )}
              {data.packageStats?.dependentsCount !== undefined && (
                <span>📦 {data.packageStats.dependentsCount.toLocaleString()} dependents</span>
              )}
            </div>

            {/* Score Gauges with always-visible breakdown */}
            <div className="flex flex-wrap gap-8 mt-2">
              <div className="flex flex-col min-w-[180px]">
                <span className="text-zinc-500 text-xs mb-2 font-medium uppercase tracking-wider">Risk Score</span>
                <div className="flex items-center gap-3">
                  <ScoreGauge score={data.riskScore ?? 0} type="risk" size="lg" />
                  <div className="text-xs text-zinc-500">
                    <div className="font-medium text-zinc-300 mb-0.5">{data.riskScore ?? 0} / 100</div>
                    <div className="text-[10px] leading-tight max-w-[120px]">Higher = more risk. 0 is safest.</div>
                  </div>
                </div>
                <ScoreBreakdownTable items={data.riskScoreBreakdown || []} type="risk" />
              </div>

              <div className="flex flex-col min-w-[180px]">
                <span className="text-zinc-500 text-xs mb-2 font-medium uppercase tracking-wider">Trust Score</span>
                <div className="flex items-center gap-3">
                  <ScoreGauge score={data.trustScore ?? 0} type="trust" size="lg" />
                  <div className="text-xs text-zinc-500">
                    <div className="font-medium text-zinc-300 mb-0.5">{data.trustScore ?? 0} / 100</div>
                    <div className="text-[10px] leading-tight max-w-[120px]">Higher = more trustworthy. Based on adoption, activity &amp; security.</div>
                  </div>
                </div>
                <ScoreBreakdownTable items={data.trustScoreBreakdown || []} type="trust" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end space-y-3 flex-shrink-0">
            <RiskBadge score={data.riskScore ?? 0} />

            {data.packageName && (
              <div className="relative group">
                <button className="text-xs px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded transition-colors flex items-center space-x-1.5">
                  <span>⬇</span>
                  <span>{report ? 'Export Report' : 'Export Data'}</span>
                </button>
                <div className="absolute right-0 mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <button
                    onClick={() => {
                      const exportData: Record<string, unknown> = { packageData: data };
                      if (report) exportData.report = report;
                      if (tokenUsage) exportData.tokenUsage = tokenUsage;
                      const content = JSON.stringify(exportData, null, 2);
                      import('../../lib/export/ReportExporter').then(m =>
                        m.ReportExporter.triggerDownload(content, `trustguard-${data.packageName}.json`, 'application/json')
                      );
                    }}
                    className="block w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 first:rounded-t-md"
                  >
                    📄 Export JSON
                  </button>
                  <button
                    onClick={() => {
                      import('../../lib/export/ReportExporter').then(m => {
                        const md = m.ReportExporter.generateMarkdown(data, report, tokenUsage);
                        m.ReportExporter.triggerDownload(md, `trustguard-${data.packageName}.md`, 'text/markdown');
                      });
                    }}
                    className="block w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    📝 Export Markdown
                  </button>
                  <button
                    onClick={async () => {
                      const btn = document.activeElement as HTMLButtonElement;
                      if (btn) btn.textContent = '⏳ Generating PDF...';
                      try {
                        const { generateAndDownloadPdf } = await import('../../lib/export/pdfExport');
                        await generateAndDownloadPdf(data, report, tokenUsage);
                      } catch (err) {
                        console.error('PDF generation failed:', err);
                        alert('PDF generation failed. Check console for details.');
                      } finally {
                        if (btn) btn.textContent = '📕 Export PDF';
                      }
                    }}
                    className="block w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 last:rounded-b-md"
                  >
                    📕 Export PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Executive Summary + Verdict */}
      <ExecutiveSummaryPanel
        executiveSummary={report?.executiveSummary}
        communityAssessment={communityAssessment}
        developerVerdict={report?.developerVerdict}
        isStreaming={isLoading || (llmStream.length > 0 && !report)}
        analysisProgress={analysisProgress}
      />

      {/* Deep Metadata Panel */}
      <RepoMetadataPanel github={data.github} packageStats={data.packageStats} />

      {/* Secure Code Review Agent Panel — show when source was fetched OR LLM produced a review */}
      {(data.sourceCode || report?.codeReview) && (
        <CodeReviewPanel
          codeReview={report?.codeReview}
          isStreaming={isLoading || (llmStream.length > 0 && !report)}
          streamedText={llmStream}
        />
      )}

      {/* Structured Security Findings Panel — show when source was fetched OR report is ready */}
      {(data.sourceCode || report !== null) && (
        <SecurityFindingsPanel
          findings={(report as any)?.securityFindings || (data as any)?.securityFindings}
          isStreaming={isLoading || (llmStream.length > 0 && !report)}
          analysisProgress={analysisProgress}
        />
      )}

      {/* Threat Model & License */}
      <ThreatModel
        threatModel={report?.threatModel}
        isStreaming={isLoading || (llmStream.length > 0 && !report)}
        streamedText={llmStream}
        analysisProgress={analysisProgress}
      />
      <LicensePanel licenseExplanation={report?.licenseExplanation} />

      {/* Vulnerabilities */}
      <VulnerabilityTable vulnerabilities={data.vulnerabilities || []} />

      {/* Alternatives */}
      <AlternativesPanel alternatives={report?.alternatives} />

      {/* Remediation Roadmap */}
      <RemediationPanel remediationSteps={report?.remediationSteps} />

      {/* Token Usage */}
      <TokenUsagePanel
        usage={tokenUsage}
        isLoading={isLoading && !tokenUsage}
      />

      {/* Disclaimer footer */}
      <div className="border-t border-zinc-800 pt-6 text-center space-y-4">
        <p className="text-zinc-600 text-xs leading-relaxed max-w-3xl mx-auto">
          ⚠️ <strong className="text-zinc-500">Disclaimer:</strong> TrustGuard AI provides automated analysis for developer due-diligence.
          Results may be incomplete — always verify critical findings independently before making decisions.
          The misuse of any security information obtained through TrustGuard AI is entirely the responsibility of the user.
          This tool must not be used to target systems without explicit authorisation.
        </p>
        <p className="text-zinc-700 text-[10px]">Report generated {new Date().toLocaleDateString()} · TrustGuard AI Security Agent</p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors text-sm font-medium group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Analyse Another Package
        </button>
      </div>
    </div>
  );
}
