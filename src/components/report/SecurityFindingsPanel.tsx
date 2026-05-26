import type { SecurityFinding } from '../../types/analysis';
import type { AnalysisProgress } from '../../store/analysisStore';
import { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import { AnalysisProgressBar } from './AnalysisProgressBar';

interface Props {
  findings?: SecurityFinding[];
  isStreaming?: boolean;
  analysisProgress?: AnalysisProgress | null;
}

const SEVERITY_CONFIG = {
  CRITICAL: {
    label: 'CRITICAL',
    bg: 'bg-red-950/60',
    border: 'border-red-800/60',
    badge: 'bg-red-900/80 text-red-300 border border-red-700/60',
    dot: 'bg-red-500',
    count: 'text-red-400',
  },
  HIGH: {
    label: 'HIGH',
    bg: 'bg-orange-950/40',
    border: 'border-orange-800/50',
    badge: 'bg-orange-900/70 text-orange-300 border border-orange-700/50',
    dot: 'bg-orange-500',
    count: 'text-orange-400',
  },
  MEDIUM: {
    label: 'MEDIUM',
    bg: 'bg-yellow-950/30',
    border: 'border-yellow-800/40',
    badge: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700/40',
    dot: 'bg-yellow-500',
    count: 'text-yellow-400',
  },
  LOW: {
    label: 'LOW',
    bg: 'bg-blue-950/30',
    border: 'border-blue-800/40',
    badge: 'bg-blue-900/50 text-blue-300 border border-blue-700/40',
    dot: 'bg-blue-400',
    count: 'text-blue-400',
  },
  INFO: {
    label: 'INFO',
    bg: 'bg-zinc-900/60',
    border: 'border-zinc-700/40',
    badge: 'bg-zinc-800 text-zinc-400 border border-zinc-600/40',
    dot: 'bg-zinc-500',
    count: 'text-zinc-400',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  README_CODE_MISMATCH: 'README MISMATCH',
  SILENT_TELEMETRY: 'SILENT TELEMETRY',
  THIRD_PARTY_DATA_EXFILTRATION: 'DATA EXFILTRATION',
  INSECURE_TRANSMISSION: 'INSECURE TRANSMISSION',
  SENSITIVE_OUTBOUND: 'SENSITIVE OUTBOUND',
  BACKGROUND_PROCESS: 'BACKGROUND PROCESS',
  POSTINSTALL_RISK: 'POSTINSTALL RISK',
  EXCESSIVE_PERMISSIONS: 'EXCESSIVE PERMISSIONS',
  HARDCODED_SECRET: 'HARDCODED SECRET',
  DANGEROUS_API_USAGE: 'DANGEROUS API',
  PROTOTYPE_POLLUTION: 'PROTOTYPE POLLUTION',
  OBFUSCATION_INDICATOR: 'OBFUSCATION',
  DEPENDENCY_CVE: 'DEPENDENCY CVE',
};

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
type Severity = typeof SEVERITY_ORDER[number];

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'CRITICAL': return <ShieldAlert className="w-4 h-4 text-red-400" />;
    case 'HIGH': return <ShieldAlert className="w-4 h-4 text-orange-400" />;
    case 'MEDIUM': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    case 'LOW': return <Shield className="w-4 h-4 text-blue-400" />;
    default: return <Info className="w-4 h-4 text-zinc-400" />;
  }
}

export function SecurityFindingsPanel({ findings, isStreaming, analysisProgress }: Props) {
  const [activeFilter, setActiveFilter] = useState<Severity | 'ALL'>('ALL');

  if (isStreaming && (!findings || findings.length === 0)) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-indigo-500/10 flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-zinc-100 font-semibold">Security Findings</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Secure Code Review Agent running...</p>
          </div>
        </div>
        {analysisProgress ? (
          <AnalysisProgressBar progress={analysisProgress} />
        ) : (
          <div className="flex items-center gap-2 text-zinc-500 text-sm animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Security agent is scanning for findings...
          </div>
        )}
      </div>
    );
  }

  if (!findings || findings.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10 flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-zinc-100 font-semibold">Security Findings</h3>
            <p className="text-zinc-400 text-sm mt-0.5">No security issues identified by code analysis.</p>
          </div>
        </div>
        <p className="text-zinc-600 text-xs mt-4 leading-relaxed">
          The Secure Code Review Agent did not detect any of the 13 tracked finding categories in the provided source code.
          This does not guarantee the package is free of all vulnerabilities — always verify critical dependencies independently.
        </p>
      </div>
    );
  }

  // Sort by severity
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity as Severity) - SEVERITY_ORDER.indexOf(b.severity as Severity)
  );

  // Count by severity
  const counts = SEVERITY_ORDER.reduce((acc, sev) => {
    acc[sev] = findings.filter(f => f.severity === sev).length;
    return acc;
  }, {} as Record<Severity, number>);

  const filtered = activeFilter === 'ALL' ? sorted : sorted.filter(f => f.severity === activeFilter);

  const hasHighRisk = counts.CRITICAL > 0 || counts.HIGH > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${hasHighRisk ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
              {hasHighRisk
                ? <ShieldAlert className="w-5 h-5 text-red-400" />
                : <ShieldCheck className="w-5 h-5 text-green-400" />
              }
            </div>
            <div>
              <h3 className="text-zinc-100 font-semibold">Security Findings</h3>
              <p className="text-zinc-500 text-xs mt-0.5">
                {findings.length} finding{findings.length !== 1 ? 's' : ''} identified by code analysis
              </p>
            </div>
          </div>

          {/* Severity summary badges */}
          <div className="flex flex-wrap gap-2">
            {SEVERITY_ORDER.filter(s => counts[s] > 0).map(sev => {
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <span key={sev} className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${cfg.badge}`}>
                  {counts[sev]} {cfg.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1 mt-4">
          {(['ALL', ...SEVERITY_ORDER] as const).map(f => {
            const count = f === 'ALL' ? findings.length : counts[f];
            if (f !== 'ALL' && count === 0) return null;
            const isActive = activeFilter === f;
            return (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition-colors font-medium ${
                  isActive
                    ? f === 'ALL'
                      ? 'bg-indigo-600 text-white'
                      : `${SEVERITY_CONFIG[f as Severity].badge} opacity-100`
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {f === 'ALL' ? `ALL (${count})` : `${f} (${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Findings grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-8 text-zinc-500 text-sm italic">
            No findings at this severity level.
          </div>
        )}
        {filtered.map((finding, i) => {
          const cfg = SEVERITY_CONFIG[finding.severity as Severity] || SEVERITY_CONFIG.INFO;
          const catLabel = CATEGORY_LABELS[finding.category] || finding.category;
          return (
            <div
              key={i}
              className={`${cfg.bg} border ${cfg.border} rounded-lg p-4 flex flex-col gap-3`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <SeverityIcon severity={finding.severity} />
                  <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ${cfg.badge}`}>
                    {catLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      finding.confirmed
                        ? 'bg-green-950/50 text-green-400 border-green-800/40'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700/40'
                    }`}
                  >
                    {finding.confirmed ? '✓ Confirmed' : '? Suspected'}
                  </span>
                </div>
              </div>

              {/* Title */}
              <p className="text-zinc-100 font-semibold text-sm leading-snug">{finding.title}</p>

              {/* Description */}
              <p className="text-zinc-400 text-xs leading-relaxed">{finding.description}</p>

              {/* Evidence */}
              {finding.evidence && (
                <div className="bg-zinc-950/80 border border-zinc-700/40 rounded px-3 py-2">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-medium">Evidence</div>
                  <code className="text-xs text-indigo-300 font-mono break-all leading-relaxed">
                    {finding.evidence}
                  </code>
                </div>
              )}

              {/* Recommendation */}
              {finding.recommendation && (
                <p className="text-zinc-500 text-xs italic leading-relaxed border-l-2 border-zinc-700 pl-2">
                  {finding.recommendation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer disclaimer */}
      <div className="px-6 pb-4">
        <p className="text-zinc-600 text-[10px] leading-relaxed">
          Findings are AI-generated static analysis — ✓ Confirmed means directly observed in provided source code, ? Suspected means inferred.
          Always verify critical findings independently before acting.
        </p>
      </div>
    </div>
  );
}
