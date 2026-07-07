import type { PackageAnalysisData, AnalysisReport, TokenUsage } from '../../types/analysis';
import type { BatchItem } from '../../store/batchStore';
import { formatCost } from '../llm/tokenPricing';
import { formatTimestamp, formatDuration } from '../utils/timestamps';
import type { TimezoneId } from '../utils/timestamps';
import { POPULARITY_LABEL_DESCRIPTIONS, DOWNLOAD_THRESHOLDS, STAR_THRESHOLDS, POPULARITY_LABELS } from '../constants/popularityThresholds';

// ── Embedded CSS (dark zinc theme — mirrors the app) ─────────────────────────

const CSS = `
*,::before,::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#09090b;--surface:#18181b;--surface2:#27272a;--surface3:#3f3f46;
  --border:#3f3f46;--border2:#27272a;
  --text:#f4f4f5;--muted:#a1a1aa;--dim:#71717a;--faint:#52525b;
  --indigo:#6366f1;--indigo-light:#818cf8;--indigo-dim:rgba(99,102,241,.15);
  --red:#ef4444;--red-dim:rgba(239,68,68,.15);
  --amber:#f59e0b;--amber-dim:rgba(245,158,11,.15);
  --green:#22c55e;--green-dim:rgba(34,197,94,.15);
  --cyan:#22d3ee;
  --font-mono:'JetBrains Mono','Fira Code','Cascadia Code',monospace;
}
html{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;
  font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
body{max-width:960px;margin:0 auto;padding:32px 24px 80px}
a{color:var(--indigo-light);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--font-mono);font-size:.875em;background:var(--surface2);
  border:1px solid var(--border2);padding:.1em .35em;border-radius:4px;color:var(--cyan)}
pre{font-family:var(--font-mono);background:var(--surface2);border:1px solid var(--border);
  border-radius:8px;padding:16px;overflow-x:auto;font-size:.85em;margin:12px 0}

/* ── Layout ─────────────────────────────── */
.page-header{border-bottom:1px solid var(--border);padding-bottom:24px;margin-bottom:32px}
.page-header h1{font-size:1.6rem;font-weight:800;color:var(--text);line-height:1.2}
.page-header .meta{color:var(--muted);font-size:.85rem;margin-top:6px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px}
.card-title{font-size:1rem;font-weight:700;color:var(--text);margin-bottom:16px;
  display:flex;align-items:center;gap:8px}
.card-title .icon{font-size:1.1rem}
section{margin-bottom:20px}

/* ── Scores ─────────────────────────────── */
.scores{display:flex;flex-wrap:wrap;gap:32px}
.score-block{min-width:200px}
.score-label{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px}
.score-value{font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums}
.score-value.risk{color:var(--red)}
.score-value.trust{color:var(--green)}
.score-sub{font-size:.75rem;color:var(--dim);margin-top:4px}
.breakdown{margin-top:12px;display:flex;flex-direction:column;gap:4px}
.breakdown-row{display:flex;justify-content:space-between;font-size:.75rem;
  background:var(--surface2);border-radius:4px;padding:5px 10px}
.breakdown-row .factor{color:var(--muted)}
.breakdown-row .impact{font-weight:600}
.impact-risk{color:var(--red)}
.impact-trust-pos{color:var(--green)}
.impact-trust-neg{color:var(--amber)}

/* ── Badges ─────────────────────────────── */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:9999px;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.badge-critical{background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.3)}
.badge-high{background:rgba(249,115,22,.12);color:#fb923c;border:1px solid rgba(249,115,22,.3)}
.badge-medium{background:var(--amber-dim);color:var(--amber);border:1px solid rgba(245,158,11,.3)}
.badge-low{background:rgba(234,179,8,.12);color:#facc15;border:1px solid rgba(234,179,8,.3)}
.badge-info{background:var(--indigo-dim);color:var(--indigo-light);border:1px solid rgba(99,102,241,.3)}
.badge-confirmed{background:var(--green-dim);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.badge-inferred{background:var(--surface2);color:var(--dim);border:1px solid var(--border)}
.badge-ecosystem{background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
.badge-popularity{background:var(--indigo-dim);color:var(--indigo-light);border:1px solid rgba(99,102,241,.3)}
.badge-verdict-use{background:var(--green-dim);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.badge-verdict-caution{background:var(--amber-dim);color:var(--amber);border:1px solid rgba(245,158,11,.3)}
.badge-verdict-avoid{background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.3)}

/* ── Tables ─────────────────────────────── */
table{width:100%;border-collapse:collapse;font-size:.82rem;margin:12px 0}
thead tr{background:var(--surface2)}
th{padding:8px 12px;text-align:left;font-weight:600;color:var(--muted);
  text-transform:uppercase;font-size:.7rem;letter-spacing:.05em;border-bottom:1px solid var(--border)}
td{padding:8px 12px;border-bottom:1px solid var(--border2);color:var(--text)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}

/* ── Finding cards ───────────────────────── */
.finding{background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  padding:16px;margin-bottom:12px}
.finding-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.finding-title{font-weight:600;color:var(--text);font-size:.9rem}
.finding-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.finding-body{font-size:.82rem;color:var(--muted);line-height:1.6;margin-bottom:8px}
.finding-evidence{font-family:var(--font-mono);font-size:.75rem;background:var(--surface);
  border:1px solid var(--border);border-radius:4px;padding:8px 12px;margin:8px 0;
  color:var(--cyan);word-break:break-all}
.finding-rec{border-left:2px solid var(--indigo);padding-left:12px;
  font-size:.82rem;color:var(--muted);margin-top:8px;font-style:italic}

/* ── STRIDE ─────────────────────────────── */
.stride-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:600px){.stride-grid{grid-template-columns:1fr}}
.stride-card{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px}
.stride-cat{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--indigo-light);margin-bottom:6px}
.stride-text{font-size:.82rem;color:var(--muted);line-height:1.55}
.threat-level{display:inline-flex;padding:3px 10px;border-radius:6px;font-size:.75rem;font-weight:700;
  background:var(--amber-dim);color:var(--amber);border:1px solid rgba(245,158,11,.3);margin-bottom:16px}

/* ── License ─────────────────────────────── */
.license-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px}
@media(max-width:600px){.license-grid{grid-template-columns:1fr}}
.license-cell{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px}
.license-cell h4{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px}
.license-list li{font-size:.8rem;color:var(--text);list-style:none;padding:2px 0}
.license-summary{font-weight:700;color:var(--text);margin-bottom:8px}
.license-plain{border-left:2px solid var(--border);padding-left:12px;font-size:.82rem;
  color:var(--muted);font-style:italic;margin-top:12px}

/* ── Alternatives ───────────────────────── */
.alt-card{background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  padding:16px;margin-bottom:12px}
.alt-name{font-weight:700;color:var(--text);font-size:.95rem}
.alt-desc{font-size:.82rem;color:var(--muted);margin:6px 0 10px}
.alt-meta{display:flex;flex-wrap:wrap;gap:10px;font-size:.75rem;color:var(--dim)}
.alt-why{border-left:2px solid var(--green);padding-left:10px;font-size:.82rem;
  color:var(--muted);margin-top:8px}

/* ── Remediation ────────────────────────── */
.rem-item{display:flex;gap:12px;background:var(--surface2);border:1px solid var(--border);
  border-radius:8px;padding:14px;margin-bottom:10px}
.rem-priority{flex-shrink:0;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:700;
  text-transform:uppercase;align-self:flex-start}
.priority-critical{background:var(--red-dim);color:var(--red)}
.priority-high{background:rgba(249,115,22,.12);color:#fb923c}
.priority-medium{background:var(--amber-dim);color:var(--amber)}
.priority-low{background:var(--green-dim);color:var(--green)}
.rem-action{font-size:.88rem;font-weight:600;color:var(--text);margin-bottom:4px}
.rem-rationale{font-size:.8rem;color:var(--muted);font-style:italic}

/* ── Metadata grid ──────────────────────── */
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
@media(max-width:600px){.meta-grid{grid-template-columns:1fr}}
.meta-row{display:flex;justify-content:space-between;font-size:.82rem;
  background:var(--surface2);border-radius:4px;padding:5px 10px}
.meta-key{color:var(--dim)}
.meta-val{color:var(--text);font-family:var(--font-mono);font-size:.8rem;text-align:right}

/* ── Token usage ────────────────────────── */
.token-table td:first-child{color:var(--muted);width:55%}
.token-table td:last-child{font-family:var(--font-mono);text-align:right}
.token-total{font-weight:700}

/* ── Batch summary table ────────────────── */
.summary-table td:nth-child(3),.summary-table td:nth-child(4){font-family:var(--font-mono);font-weight:600}
.summary-table td:nth-child(3){color:var(--red)}
.summary-table td:nth-child(4){color:var(--green)}

/* ── Collapsible sections ───────────────── */
details{border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px}
summary{padding:16px 20px;cursor:pointer;background:var(--surface);font-weight:700;
  font-size:.95rem;color:var(--text);display:flex;align-items:center;gap:8px;list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:'▶';font-size:.7rem;color:var(--dim);transition:transform .2s}
details[open] summary::before{transform:rotate(90deg)}
details[open] summary{border-bottom:1px solid var(--border)}
.details-body{padding:20px;background:var(--surface)}

/* ── Misc ───────────────────────────────── */
.divider{border:none;border-top:1px solid var(--border);margin:28px 0}
.text-muted{color:var(--muted)}
.text-dim{color:var(--dim)}
.text-red{color:var(--red)}
.text-green{color:var(--green)}
.text-amber{color:var(--amber)}
.text-indigo{color:var(--indigo-light)}
.mono{font-family:var(--font-mono)}
.footer{border-top:1px solid var(--border);padding-top:24px;margin-top:40px;
  text-align:center;font-size:.75rem;color:var(--faint)}
.clean-findings{background:var(--green-dim);border:1px solid rgba(34,197,94,.3);
  border-radius:8px;padding:16px;color:var(--green);font-size:.88rem;text-align:center}
/* ── Deprecation warnings ───────────────────────── */
.warn-deprecated{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);
  border-radius:8px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px}
.warn-unmaintained{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);
  border-radius:8px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px}
.warn-icon{font-size:1.3rem;flex-shrink:0;margin-top:2px}
.warn-title{font-weight:700;font-size:.9rem;margin-bottom:4px}
.warn-deprecated .warn-title{color:var(--red)}
.warn-unmaintained .warn-title{color:var(--amber)}
.warn-text{font-size:.82rem;color:var(--muted)}
/* ── Attribution chip ───────────────────────────── */
.repo-attribution{display:inline-flex;align-items:center;gap:6px;background:var(--surface2);
  border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:.78rem;
  color:var(--muted);margin:6px 0 0;font-family:var(--font-mono)}
.repo-attribution a{color:var(--indigo-light)}
/* ── Appendix ───────────────────────────────────── */
.appendix-table td,.appendix-table th{font-size:.78rem;padding:6px 10px}
.appendix-section{margin-bottom:24px}
.appendix-section h4{font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:8px;
  border-bottom:1px solid var(--border2);padding-bottom:4px}
`.trim();

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityClass(sev: string): string {
  const s = sev?.toLowerCase();
  if (s === 'critical') return 'badge-critical';
  if (s === 'high')     return 'badge-high';
  if (s === 'medium')   return 'badge-medium';
  if (s === 'low')      return 'badge-low';
  return 'badge-info';
}

function verdictClass(v: string): string {
  // Explicit switch to avoid REPLACE_SOON falling through to 'use' (green)
  switch ((v || '').toUpperCase()) {
    case 'USE':               return 'badge-verdict-use';
    case 'USE_WITH_CAUTION':  return 'badge-verdict-caution';
    case 'REPLACE_SOON':      return 'badge-verdict-caution';
    case 'AVOID':             return 'badge-verdict-avoid';
    default: {
      const lv = (v || '').toLowerCase();
      if (lv.includes('avoid') || lv.includes('reject')) return 'badge-verdict-avoid';
      if (lv.includes('caution') || lv.includes('replace') || lv.includes('review')) return 'badge-verdict-caution';
      return 'badge-verdict-use';
    }
  }
}

function priorityClass(p: string): string {
  const lp = (p || '').toLowerCase();
  if (lp === 'critical') return 'priority-critical';
  if (lp === 'high')     return 'priority-high';
  if (lp === 'medium')   return 'priority-medium';
  return 'priority-low';
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ── Single-package report sections ───────────────────────────────────────────

function renderScores(data: Partial<PackageAnalysisData>): string {
  const rBreak = (data.riskScoreBreakdown || [])
    .map(b => `<div class="breakdown-row"><span class="factor">${esc(b.factor)}</span><span class="impact impact-risk">+${b.impact}</span></div>`)
    .join('');
  const tBreak = (data.trustScoreBreakdown || [])
    .map(b => `<div class="breakdown-row"><span class="factor">${esc(b.factor)}</span><span class="impact ${b.impact >= 0 ? 'impact-trust-pos' : 'impact-trust-neg'}">${b.impact >= 0 ? '+' : ''}${b.impact}</span></div>`)
    .join('');

  return `<div class="scores">
  <div class="score-block">
    <div class="score-label">Risk Score</div>
    <div class="score-value risk">${data.riskScore ?? 0}<span style="font-size:1rem;font-weight:400;color:var(--dim)">/100</span></div>
    <div class="score-sub">Higher = more risk. 0 is safest.</div>
    ${rBreak ? `<div class="breakdown">${rBreak}</div>` : ''}
  </div>
  <div class="score-block">
    <div class="score-label">Trust Score</div>
    <div class="score-value trust">${data.trustScore ?? 0}<span style="font-size:1rem;font-weight:400;color:var(--dim)">/100</span></div>
    <div class="score-sub">Higher = more trustworthy.</div>
    ${tBreak ? `<div class="breakdown">${tBreak}</div>` : ''}
  </div>
</div>`;
}

function renderMetadata(data: Partial<PackageAnalysisData>): string {
  const rows: string[] = [];
  const g = data.github;
  const p = data.packageStats;

  if (g) {
    if (g.owner?.login) rows.push(`<div class="meta-row"><span class="meta-key">Owner</span><span class="meta-val">${esc(g.owner.login)} (${esc(g.owner.type || 'User')})</span></div>`);
    if (g.createdAt)    rows.push(`<div class="meta-row"><span class="meta-key">Created</span><span class="meta-val">${new Date(g.createdAt).toLocaleDateString()}</span></div>`);
    if (g.lastCommitDate) rows.push(`<div class="meta-row"><span class="meta-key">Last commit</span><span class="meta-val">${new Date(g.lastCommitDate).toLocaleDateString()}</span></div>`);
    if (g.commitsLast90Days !== undefined) rows.push(`<div class="meta-row"><span class="meta-key">Commits (90d)</span><span class="meta-val">${g.commitsLast90Days}</span></div>`);
    rows.push(`<div class="meta-row"><span class="meta-key">Stars</span><span class="meta-val">${(g.stars || 0).toLocaleString()}</span></div>`);
    rows.push(`<div class="meta-row"><span class="meta-key">Forks</span><span class="meta-val">${(g.forks || 0).toLocaleString()}</span></div>`);
    if (g.watchers) rows.push(`<div class="meta-row"><span class="meta-key">Watchers</span><span class="meta-val">${g.watchers.toLocaleString()}</span></div>`);
    rows.push(`<div class="meta-row"><span class="meta-key">Open issues</span><span class="meta-val">${(g.openIssues || 0).toLocaleString()}</span></div>`);
    if (g.contributorsCount) rows.push(`<div class="meta-row"><span class="meta-key">Contributors</span><span class="meta-val">${g.contributorsCount}</span></div>`);
    rows.push(`<div class="meta-row"><span class="meta-key">Archived</span><span class="meta-val ${g.archived ? 'text-red' : 'text-green'}">${g.archived ? 'Yes ⚠' : 'No'}</span></div>`);
    if (g.latestRelease) rows.push(`<div class="meta-row"><span class="meta-key">Latest release</span><span class="meta-val">${esc(g.latestRelease)}</span></div>`);
    if (g.url) rows.push(`<div class="meta-row"><span class="meta-key">Repository</span><span class="meta-val"><a href="${esc(g.url)}" target="_blank">${esc(g.url)}</a></span></div>`);
  }
  if (p) {
    if (p.weeklyDownloads) rows.push(`<div class="meta-row"><span class="meta-key">Weekly downloads</span><span class="meta-val">${p.weeklyDownloads.toLocaleString()}</span></div>`);
    if (p.latestVersion)   rows.push(`<div class="meta-row"><span class="meta-key">Latest version</span><span class="meta-val">${esc(p.latestVersion)}</span></div>`);
    if (p.latestSecureVersion) rows.push(`<div class="meta-row"><span class="meta-key">Latest secure ver.</span><span class="meta-val text-green">${esc(p.latestSecureVersion)} ✓</span></div>`);
    if (p.dependentsCount !== undefined) rows.push(`<div class="meta-row"><span class="meta-key">Dependents</span><span class="meta-val">~${p.dependentsCount.toLocaleString()}</span></div>`);
  }

  if (!rows.length) return '';
  return `<div class="card">
  <div class="card-title"><span class="icon">📦</span> Repository &amp; Package Metadata</div>
  <div class="meta-grid">${rows.join('')}</div>
</div>`;
}

function renderFindings(findings: any[]): string {
  if (!findings?.length) {
    return `<div class="card">
  <div class="card-title"><span class="icon">🔍</span> Security Findings</div>
  <div class="clean-findings">✅ No security issues identified by the Secure Code Review Agent.</div>
</div>`;
  }

  const SORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const sorted = [...findings].sort((a, b) => SORDER.indexOf(a.severity) - SORDER.indexOf(b.severity));
  const counts: Record<string, number> = {};
  SORDER.forEach(s => { counts[s] = findings.filter(f => f.severity === s).length; });
  const summary = SORDER.filter(s => counts[s] > 0).map(s => `${counts[s]} ${s}`).join(' · ');

  const cards = sorted.map((f, i) => `
<div class="finding">
  <div class="finding-header">
    <div class="finding-title">${i + 1}. ${esc(f.title)}</div>
    <span class="badge ${severityClass(f.severity)}">${esc(f.severity)}</span>
  </div>
  <div class="finding-meta">
    <span class="badge badge-ecosystem">${esc(f.category)}</span>
    <span class="badge ${f.confirmed ? 'badge-confirmed' : 'badge-inferred'}">${f.confirmed ? '✓ Confirmed' : '? Inferred'}</span>
  </div>
  <div class="finding-body">${esc(f.description)}</div>
  ${f.evidence ? `<div class="finding-evidence">${esc(f.evidence)}</div>` : ''}
  ${f.recommendation ? `<div class="finding-rec">${esc(f.recommendation)}</div>` : ''}
</div>`).join('');

  return `<div class="card">
  <div class="card-title"><span class="icon">🔍</span> Security Findings
    <span style="font-size:.75rem;font-weight:400;color:var(--muted);margin-left:auto">${summary}</span>
  </div>
  ${cards}
</div>`;
}

function renderDepVulns(depVulns: any[]): string {
  if (!depVulns?.length) return '';
  const rows = depVulns.map(d => `<tr>
    <td class="mono">${esc(d.dependencyName)}</td>
    <td class="mono">${esc(d.dependencyVersion)}</td>
    <td>${d.vulnerabilityCount}</td>
    <td><span class="badge ${severityClass(d.highestSeverity)}">${esc(d.highestSeverity)}</span></td>
    <td class="mono text-dim" style="font-size:.75rem">${d.topCVEs?.join(', ')}</td>
  </tr>`).join('');
  return `<div class="card">
  <div class="card-title"><span class="icon">📦</span> Dependency CVEs</div>
  <table><thead><tr><th>Dependency</th><th>Version</th><th>CVEs</th><th>Highest</th><th>Top CVE IDs</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}

function renderStride(tm: any): string {
  if (!tm) return '';
  return `<div class="card">
  <div class="card-title"><span class="icon">🕸</span> STRIDE Threat Model</div>
  <div class="threat-level">Overall threat level: ${esc(tm.overallThreatLevel)}</div>
  <div class="stride-grid">
    <div class="stride-card"><div class="stride-cat">Spoofing</div><div class="stride-text">${esc(tm.spoofing)}</div></div>
    <div class="stride-card"><div class="stride-cat">Tampering</div><div class="stride-text">${esc(tm.tampering)}</div></div>
    <div class="stride-card"><div class="stride-cat">Repudiation</div><div class="stride-text">${esc(tm.repudiation)}</div></div>
    <div class="stride-card"><div class="stride-cat">Information Disclosure</div><div class="stride-text">${esc(tm.informationDisclosure)}</div></div>
    <div class="stride-card"><div class="stride-cat">Denial of Service</div><div class="stride-text">${esc(tm.denialOfService)}</div></div>
    <div class="stride-card"><div class="stride-cat">Elevation of Privilege</div><div class="stride-text">${esc(tm.elevationOfPrivilege)}</div></div>
  </div>
</div>`;
}

function renderLicense(lic: any): string {
  if (!lic) return '';
  const canList  = (lic.canYou    || []).map((s: string) => `<li>✅ ${esc(s)}</li>`).join('');
  const cantList = (lic.cannotYou || []).map((s: string) => `<li>🚫 ${esc(s)}</li>`).join('');
  const mustList = (lic.mustYou   || []).map((s: string) => `<li>⚡ ${esc(s)}</li>`).join('');
  return `<div class="card">
  <div class="card-title"><span class="icon">📜</span> License Analysis</div>
  <div class="license-summary">${esc(lic.summary)}</div>
  <div style="font-size:.82rem;color:var(--muted);margin-bottom:16px">
    Risk: <strong style="color:var(--text)">${esc(lic.riskLevel)}</strong> &nbsp;·&nbsp;
    Commercial use: <strong style="color:var(--text)">${esc(lic.commercialUse)}</strong>
  </div>
  <div class="license-grid">
    ${canList  ? `<div class="license-cell"><h4>You Can</h4><ul class="license-list">${canList}</ul></div>`  : ''}
    ${cantList ? `<div class="license-cell"><h4>You Cannot</h4><ul class="license-list">${cantList}</ul></div>` : ''}
    ${mustList ? `<div class="license-cell"><h4>You Must</h4><ul class="license-list">${mustList}</ul></div>` : ''}
  </div>
  ${lic.plainEnglish ? `<div class="license-plain">${esc(lic.plainEnglish)}</div>` : ''}
</div>`;
}

function renderVulns(vulns: any[]): string {
  if (!vulns?.length) {
    return `<div class="card">
  <div class="card-title"><span class="icon">🐛</span> Known Vulnerabilities (OSV)</div>
  <div class="clean-findings">✅ No known CVEs found in OSV database.</div>
</div>`;
  }

  // Detect whether applicability data is present
  const hasApplicability = vulns.some(v => v.isApplicable !== undefined);
  const applicableCount  = hasApplicability ? vulns.filter(v => v.isApplicable !== false).length : vulns.length;
  const fixedCount       = hasApplicability ? vulns.filter(v => v.isApplicable === false).length : 0;
  const countLabel       = hasApplicability && fixedCount > 0
    ? `${vulns.length} total · ${applicableCount} applicable · ${fixedCount} already fixed`
    : `${vulns.length} found`;

  const rows = vulns.map(v => {
    const notApplicable = v.isApplicable === false;
    const rowStyle = notApplicable ? 'opacity:.4;' : '';
    const statusCell = hasApplicability
      ? notApplicable
        ? `<td><span class="badge badge-confirmed" title="${esc(v.applicabilityNote || '')}">✓ Already Fixed</span></td>`
        : v.isApplicable === true
        ? `<td><span class="badge badge-critical" title="${esc(v.applicabilityNote || '')}">⚠ Applicable</span></td>`
        : '<td>—</td>'
      : '';
    return `<tr style="${rowStyle}">
    <td><a href="https://osv.dev/vulnerability/${esc(v.id)}" target="_blank" class="mono">${esc(v.id)}</a></td>
    <td><span class="badge ${severityClass(v.severity)}">${esc(v.severity)}</span></td>
    <td>${esc(v.title)}</td>
    <td class="mono text-green">${esc(v.fixedInVersion)}</td>
    ${statusCell}
  </tr>`;
  }).join('');

  const statusHeader = hasApplicability ? '<th>Status</th>' : '';
  const applyNote = hasApplicability && fixedCount > 0
    ? `<div style="font-size:.75rem;color:var(--dim);margin-bottom:8px">Dimmed rows are already patched in your installed version.</div>`
    : '';

  return `<div class="card">
  <div class="card-title"><span class="icon">🐛</span> Known Vulnerabilities (OSV) <span style="font-size:.75rem;font-weight:400;color:var(--muted);margin-left:auto">${countLabel}</span></div>
  ${applyNote}
  <table><thead><tr><th>ID</th><th>Severity</th><th>Title</th><th>Fixed In</th>${statusHeader}</tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}

function renderAlternatives(alts: any[]): string {
  if (!alts?.length) return '';
  const cards = alts.map((a, i) => `<div class="alt-card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
    <span class="alt-name">${i + 1}. ${esc(a.name)}</span>
    <span class="badge badge-ecosystem">${esc(a.ecosystem)}</span>
  </div>
  <div class="alt-desc">${esc(a.description)}</div>
  <div class="alt-meta">
    <span>⭐ ${esc(a.githubStars)} stars</span>
    <span>⬇ ${esc(a.weeklyDownloads)}/wk</span>
    <span>License: ${esc(a.license)}</span>
    <span>Maintenance: ${esc(a.maintenanceStatus)}</span>
    <span>Migration: ${esc(a.migrationDifficulty)}</span>
  </div>
  <div class="alt-why">${esc(a.whyBetter)}</div>
  ${a.notableFeatures?.length ? `<div style="margin-top:8px;font-size:.78rem;color:var(--dim)">Features: ${esc(a.notableFeatures.join(', '))}</div>` : ''}
</div>`).join('');
  return `<div class="card"><div class="card-title"><span class="icon">🔄</span> Alternatives</div>${cards}</div>`;
}

function renderRemediation(steps: any[]): string {
  if (!steps?.length) return '';
  const items = steps.map(s => `<div class="rem-item">
  <span class="rem-priority ${priorityClass(s.priority)}">${esc(s.priority)}</span>
  <div>
    <div class="rem-action">${esc(s.action)}</div>
    ${s.rationale ? `<div class="rem-rationale">${esc(s.rationale)}</div>` : ''}
  </div>
</div>`).join('');
  return `<div class="card"><div class="card-title"><span class="icon">🛠</span> Remediation Steps</div>${items}</div>`;
}

function renderTokenUsage(usage: TokenUsage | null): string {
  if (!usage) return '';
  return `<div class="card">
  <div class="card-title"><span class="icon">🪙</span> Token Usage &amp; Cost</div>
  <table class="token-table">
    <tbody>
      <tr><td>Provider / Model</td><td class="mono">${esc(usage.provider)}/${esc(usage.model)}</td></tr>
      <tr><td>Input tokens</td><td>${usage.inputTokens.toLocaleString()}</td></tr>
      <tr><td>Output tokens</td><td>${usage.outputTokens.toLocaleString()}</td></tr>
      <tr class="token-total"><td>Total tokens</td><td>${usage.totalTokens.toLocaleString()}</td></tr>
      <tr class="token-total"><td>Estimated cost</td><td>${formatCost(usage.estimatedCostUSD)}</td></tr>
      <tr><td>Count source</td><td>${usage.isEstimated ? 'Estimated (~4 chars/token)' : 'Reported by API'}</td></tr>
    </tbody>
  </table>
</div>`;
}

// ── New helper functions ──────────────────────────────────────────────────────

function renderDeprecationWarning(data: Partial<PackageAnalysisData>): string {
  if (!data.isDeprecated && !data.isUnmaintained) return '';
  if (data.isDeprecated) {
    return `<div class="warn-deprecated">
  <div class="warn-icon">🚫</div>
  <div>
    <div class="warn-title">DEPRECATED PACKAGE</div>
    <div class="warn-text">${esc(data.deprecationMessage || 'This package has been marked as deprecated and is no longer maintained.')}</div>
  </div>
</div>`;
  }
  return `<div class="warn-unmaintained">
  <div class="warn-icon">⚠️</div>
  <div>
    <div class="warn-title">UNMAINTAINED PACKAGE</div>
    <div class="warn-text">No commits for 3+ years. This package may no longer receive security updates or bug fixes.</div>
  </div>
</div>`;
}

function renderRepositoryAttribution(data: Partial<PackageAnalysisData>): string {
  if (!data.resolvedGithubUrl && !data.resolvedRegistryUrl) return '';
  const repoDisplay = data.resolvedGithubUrl ? data.resolvedGithubUrl.replace('https://github.com/', '') : '';
  const viaText = data.resolvedVia ? data.resolvedVia.replace(/_/g, ' ') : '';

  // Build version-specific release URL
  let releaseUrl = '';
  let releaseLabel = '';
  if (data.resolvedGithubUrl && data.version && data.version !== 'latest') {
    if (data.resolvedGitRef) {
      releaseUrl = `${data.resolvedGithubUrl}/releases/tag/${data.resolvedGitRef}`;
      releaseLabel = `release/${data.resolvedGitRef}`;
    } else {
      releaseUrl = `${data.resolvedGithubUrl}/releases`;
      releaseLabel = `releases (v${data.version})`;
    }
  }

  // Confidence badge
  let confidenceHtml = '';
  if (data.resolverConfidence) {
    const conf = data.resolverConfidence;
    const styles: Record<string, string> = {
      VERIFIED:   'background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.35)',
      HIGH:       'background:rgba(52,211,153,.12);color:#6ee7b7;border:1px solid rgba(52,211,153,.3)',
      MEDIUM:     'background:rgba(245,158,11,.12);color:#fbbf24;border:1px solid rgba(245,158,11,.3)',
      LOW:        'background:rgba(249,115,22,.12);color:#fb923c;border:1px solid rgba(249,115,22,.3)',
      UNRESOLVED: 'background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.3)',
    };
    const labels: Record<string, string> = {
      VERIFIED: '✓ VERIFIED', HIGH: '↑ HIGH', MEDIUM: '~ MEDIUM', LOW: '↓ LOW', UNRESOLVED: '? UNRESOLVED',
    };
    const style = styles[conf] || styles.UNRESOLVED;
    const label = labels[conf] || conf;
    confidenceHtml = `<span style="display:inline-block;${style};font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 7px;border-radius:4px;margin-bottom:6px" title="Source Resolution Confidence">Source Confidence: ${esc(label)}</span>`;
  }

  // Sub-path indicator
  const subPathHtml = data.resolvedGithubSubPath
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
    <span style="display:inline-block;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:2px 7px;border-radius:4px">📁 Sub-path scan</span>
    <code style="font-family:var(--font-mono);font-size:.78rem;color:var(--indigo-light)">${esc(data.resolvedGithubSubPath)}</code>
  </div>
  <div style="font-size:.72rem;color:var(--dim);margin-bottom:8px">
    ⓘ Security findings, STRIDE model, and code review are scoped to this path only. Stars, forks, and version metadata are from the base repository.
  </div>`
    : '';

  return `<div style="margin-bottom:16px">
  ${confidenceHtml}
  ${subPathHtml}
  ${data.resolvedGithubUrl ? `<div class="repo-attribution" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
    <span>🔗 Repository:</span>
    <a href="${esc(data.resolvedGithubUrl)}" target="_blank" style="font-family:var(--font-mono)">${esc(repoDisplay)}</a>
    ${viaText ? `<span style="color:var(--dim);font-size:.75rem">via ${esc(viaText)}</span>` : ''}
  </div>` : ''}
  ${releaseUrl ? `<div style="font-size:.78rem;color:var(--muted);margin-bottom:4px;display:flex;align-items:center;gap:6px">
    <span>🏷️ Analyzed version:</span>
    <a href="${esc(releaseUrl)}" target="_blank" style="font-family:var(--font-mono);font-size:.75rem">${esc(releaseLabel)}</a>
  </div>` : ''}
  ${data.resolvedRegistryUrl ? `<div style="font-size:.75rem;color:var(--dim);margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <span>📦 Registry:</span>
    <a href="${esc(data.resolvedRegistryUrl)}" target="_blank"><code style="font-size:.72rem;word-break:break-all">${esc(data.resolvedRegistryUrl)}</code></a>
  </div>` : ''}
  <div style="font-size:.72rem;color:var(--dim);margin-top:2px;padding-left:2px">
    ⓘ Verify this is the correct repository — wrong matches can happen when package names are ambiguous.
  </div>
</div>`;
}

function renderDataCompletenessWarning(data: Partial<PackageAnalysisData>): string {
  if (!data.dataCompleteness || data.dataCompleteness === 'FULL') return '';
  const isNone = data.dataCompleteness === 'NONE';
  const isMeta = data.dataCompleteness === 'METADATA_ONLY';
  const icon  = isNone ? '❌' : isMeta ? '📋' : '⚠️';
  const title = isNone ? 'NO DATA' : isMeta ? 'METADATA ONLY' : 'PARTIAL DATA';
  const color = isNone ? 'var(--red)' : 'var(--amber)';
  const bg    = isNone ? 'rgba(239,68,68,.08)' : 'rgba(245,158,11,.08)';
  const border = isNone ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)';
  const msg = data.dataCompleteness === 'PARTIAL'
    ? 'Some data sources were unavailable. Scores may be less accurate — GitHub or download stats could not be retrieved.'
    : data.dataCompleteness === 'METADATA_ONLY'
    ? 'Only registry metadata was available. No GitHub activity data or download statistics could be retrieved.'
    : 'Could not retrieve meaningful data for this package. Verify the package name and ecosystem are correct.';
  return `<div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px">
  <span style="font-size:1.3rem;flex-shrink:0">${icon}</span>
  <div>
    <div style="font-weight:700;font-size:.9rem;color:${color};margin-bottom:4px">${title}</div>
    <div style="font-size:.82rem;color:var(--muted)">${esc(msg)}</div>
  </div>
</div>`;
}

function renderTimestamps(data: Partial<PackageAnalysisData>, timezone: TimezoneId = 'IST'): string {
  if (!data.scanStartedAt && !data.reportGeneratedAt) return '';
  const parts: string[] = [];
  if (data.scanStartedAt) parts.push(`Scan started: <span class="mono">${esc(formatTimestamp(data.scanStartedAt, timezone))}</span>`);
  if (data.scanStartedAt && data.scanEndedAt) {
    parts.push(`Duration: <span class="mono">${esc(formatDuration(data.scanStartedAt, data.scanEndedAt))}</span>`);
  }
  if (data.reportGeneratedAt) parts.push(`Report generated: <span class="mono">${esc(formatTimestamp(data.reportGeneratedAt, timezone))}</span>`);
  return `<div style="font-size:.78rem;color:var(--dim);margin-bottom:12px;display:flex;flex-wrap:wrap;gap:16px">${parts.join('')}</div>`;
}

function renderTechnicalAppendix(): string {
  // Popularity labels
  const popRows = POPULARITY_LABELS.map((label, i) => {
    const desc = POPULARITY_LABEL_DESCRIPTIONS[label] || '';
    const dlThresh = DOWNLOAD_THRESHOLDS[i - 1];
    const stThresh = STAR_THRESHOLDS[i - 1];
    const range = i === 0
      ? 'Below first threshold'
      : i === DOWNLOAD_THRESHOLDS.length
        ? `≥ ${(DOWNLOAD_THRESHOLDS[i-1] || 0).toLocaleString()} downloads / ${(STAR_THRESHOLDS[i-1] || 0).toLocaleString()} stars`
        : `≥ ${(dlThresh || 0).toLocaleString()} downloads / ${(stThresh || 0).toLocaleString()} stars`;
    return `<tr><td><strong>${esc(label)}</strong></td><td class="mono text-dim">${esc(range)}</td><td>${esc(desc)}</td></tr>`;
  }).join('');

  // License reference
  const licenses = [
    ['MIT', 'Permissive', 'Use, modify, distribute freely. Commercial use allowed.'],
    ['Apache-2.0', 'Permissive', 'Like MIT but includes explicit patent grant.'],
    ['BSD-2-Clause', 'Permissive', 'Minimal restrictions. Attribution required.'],
    ['BSD-3-Clause', 'Permissive', 'Like BSD-2 but prevents use of project name for endorsement.'],
    ['ISC', 'Permissive', 'Functionally equivalent to MIT. Widely used in npm ecosystem.'],
    ['GPL-2.0', 'Copyleft', 'Source must be open if distributed. Strong copyleft.'],
    ['GPL-3.0', 'Copyleft', 'Like GPL-2.0 with additional patent protections.'],
    ['AGPL-3.0', 'Strong Copyleft', 'GPL-3.0 + network copyleft (SaaS must open-source).'],
    ['LGPL-2.1', 'Weak Copyleft', 'Library copyleft — linking is allowed without copyleft.'],
    ['LGPL-3.0', 'Weak Copyleft', 'LGPL-2.1 + GPLv3 features.'],
    ['MPL-2.0', 'Weak Copyleft', 'File-level copyleft. Compatible with GPL.'],
    ['SSPL-1.0', 'Source Available', 'MongoDB license. Highly restrictive for SaaS use.'],
    ['CC0-1.0', 'Public Domain', 'No rights reserved. Maximum freedom for users.'],
    ['Unlicense', 'Public Domain', 'Simplified public domain dedication.'],
  ];
  const licRows = licenses.map(([id, type, desc]) =>
    `<tr><td class="mono"><strong>${esc(id)}</strong></td><td><span class="badge badge-ecosystem">${esc(type)}</span></td><td>${esc(desc)}</td></tr>`
  ).join('');

  // Security findings categories
  const categories = [
    ['README_CODE_MISMATCH', 'README claims contradict the actual source code behavior.'],
    ['SILENT_TELEMETRY', 'Analytics or crash reporting fires automatically on import without disclosure.'],
    ['THIRD_PARTY_DATA_EXFILTRATION', 'Data is sent to external domains unnecessarily or without user knowledge.'],
    ['INSECURE_TRANSMISSION', 'HTTP instead of HTTPS, certificate validation disabled (rejectUnauthorized:false).'],
    ['SENSITIVE_OUTBOUND', 'Outbound requests include credentials, tokens, or PII in URL or request body.'],
    ['BACKGROUND_PROCESS', 'setInterval, cron jobs, ServiceWorkers, or OS services installed at import.'],
    ['POSTINSTALL_RISK', 'scripts.postinstall/preinstall/prepare in package.json — runs arbitrary code on install.'],
    ['EXCESSIVE_PERMISSIONS', 'Filesystem access beyond stated purpose, raw sockets, or sudo/admin elevation.'],
    ['HARDCODED_SECRET', 'API keys, tokens, passwords, or private keys embedded in source code.'],
    ['DANGEROUS_API_USAGE', 'eval(), Function(), exec(), or dynamic require() with user-controlled input.'],
    ['PROTOTYPE_POLLUTION', 'Unsafe Object.assign(target, input) or recursive merge without prototype check.'],
    ['OBFUSCATION_INDICATOR', 'eval(atob(…)), hex-encoded strings, or obfuscated code in non-dist files.'],
    ['DEPENDENCY_CVE', 'Known CVE found in a direct dependency of this package.'],
  ];
  const catRows = categories.map(([cat, desc]) =>
    `<tr><td class="mono" style="font-size:.75rem"><strong>${esc(cat)}</strong></td><td>${esc(desc)}</td></tr>`
  ).join('');

  return `<details>
  <summary><span class="icon">📖</span> Technical Appendix &amp; Methodology</summary>
  <div class="details-body">

    <div class="appendix-section">
      <h4>Popularity Labels</h4>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:8px">
        For npm, PyPI, uv, pip, and pipx packages, the signal is weekly downloads.
        For all other ecosystems, the signal is GitHub stars.
      </p>
      <table class="appendix-table">
        <thead><tr><th>Label</th><th>Threshold</th><th>Description</th></tr></thead>
        <tbody>${popRows}</tbody>
      </table>
    </div>

    <div class="appendix-section">
      <h4>License Reference</h4>
      <table class="appendix-table">
        <thead><tr><th>SPDX ID</th><th>Type</th><th>Summary</th></tr></thead>
        <tbody>${licRows}</tbody>
      </table>
    </div>

    <div class="appendix-section">
      <h4>Risk Score Methodology (0–100, higher = more risk)</h4>
      <table class="appendix-table">
        <thead><tr><th>Factor</th><th>Max Impact</th><th>Condition</th></tr></thead>
        <tbody>
          <tr><td>Vulnerabilities</td><td class="mono">+40</td><td>CRITICAL CVE = +40, HIGH = +25, MEDIUM = +15, LOW = +5 (capped at 40)</td></tr>
          <tr><td>Maintenance</td><td class="mono">+25</td><td>No commits in 1yr = +15, 6mo = +10, 3mo = +5</td></tr>
          <tr><td>Archived repo</td><td class="mono">+20</td><td>GitHub repo is archived</td></tr>
          <tr><td>OpenSSF Scorecard</td><td class="mono">+20</td><td>Inverse of OpenSSF score</td></tr>
          <tr><td>License</td><td class="mono">+10</td><td>GPL/AGPL/SSPL = +10; LGPL/MPL = +5</td></tr>
          <tr><td>Transitive CVEs</td><td class="mono">+5</td><td>Direct dependencies have known CVEs</td></tr>
        </tbody>
      </table>
    </div>

    <div class="appendix-section">
      <h4>Trust Score Methodology (0–100, higher = more trustworthy)</h4>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:8px">
        Trust Score starts at 100 and applies deductions mirroring risk factors,
        then applies bonuses for positive signals:
        &gt;1M downloads (+10), &gt;10k stars (+8), &gt;100 contributors (+5),
        recent release within 90 days (+5), signed releases (+5).
      </p>
    </div>

    <div class="appendix-section">
      <h4>Security Finding Categories</h4>
      <table class="appendix-table">
        <thead><tr><th>Category</th><th>Description</th></tr></thead>
        <tbody>${catRows}</tbody>
      </table>
    </div>

    <div class="appendix-section">
      <h4>Data Sources</h4>
      <table class="appendix-table">
        <tbody>
          <tr><td><strong>OSV.dev</strong></td><td>Open Source Vulnerability database — CVE and GHSA advisories (version-specific queries)</td></tr>
          <tr><td><strong>GitHub API</strong></td><td>Repository stats, contributors, commits, releases, license, archival status</td></tr>
          <tr><td><strong>npm Registry</strong></td><td>Download counts, version history, package metadata</td></tr>
          <tr><td><strong>PyPI API</strong></td><td>Python package metadata, classifiers, project URLs, version publish dates</td></tr>
          <tr><td><strong>pypistats.org</strong></td><td>Python package download statistics — weekly and monthly download counts</td></tr>
          <tr><td><strong>deps.dev (Google)</strong></td><td>Package source resolution — primary GitHub URL lookup layer</td></tr>
          <tr><td><strong>crates.io API</strong></td><td>Rust crate metadata and repository links</td></tr>
          <tr><td><strong>pub.dev API</strong></td><td>Dart/Flutter package metadata</td></tr>
          <tr><td><strong>OpenSSF Scorecard</strong></td><td>Security hygiene scores (when available)</td></tr>
        </tbody>
      </table>
    </div>

  </div>
</details>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export class HtmlExporter {

  /** Generate a self-contained HTML report for a single package analysis */
  static generateHtml(
    data: Partial<PackageAnalysisData>,
    report: Partial<AnalysisReport> | null,
    tokenUsage?: TokenUsage | null,
    options?: { timezone?: TimezoneId }
  ): string {
    const tz: TimezoneId = options?.timezone || 'IST';
    const d = data.reportGeneratedAt
      ? formatTimestamp(data.reportGeneratedAt, tz)
      : new Date().toISOString().split('T')[0];
    const verdict = (report as any)?.developerVerdict;
    const vClass  = verdict ? verdictClass(verdict) : '';

    const header = `<div class="page-header">
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
    <span class="badge badge-ecosystem">${esc(data.ecosystem || 'npm')}</span>
    <h1>${esc(data.packageName || 'Unknown Package')}</h1>
    <span class="mono text-dim" style="font-size:.9rem">${esc(data.version || 'latest')}</span>
    ${data.popularityLabel ? `<span class="badge badge-popularity">${esc(data.popularityLabel)}</span>` : ''}
    ${verdict ? `<span class="badge ${vClass}">${esc(verdict)}</span>` : ''}
  </div>
  ${renderRepositoryAttribution(data)}
  ${renderTimestamps(data, tz)}
  <div class="meta">
    Generated by TrustGuard AI · ${d}
    ${data.packageStats?.latestVersion ? ` · Latest: <span class="mono">${esc(data.packageStats.latestVersion)}</span>` : ''}
    ${data.github?.latestRelease ? ` · Release: <span class="mono">${esc(data.github.latestRelease)}</span>` : ''}
  </div>
</div>`;

    const scoresCard = `<div class="card">${renderScores(data)}</div>`;

    const execSummary = report?.executiveSummary
      ? `<div class="card"><div class="card-title"><span class="icon">🛡</span> Executive Summary</div><p style="font-size:.88rem;color:var(--muted);line-height:1.7">${esc(report.executiveSummary)}</p></div>`
      : '';

    const community = (report as any)?.communityAssessment
      ? `<div class="card"><div class="card-title"><span class="icon">👥</span> Community Assessment</div><p style="font-size:.88rem;color:var(--muted);line-height:1.7">${esc((report as any).communityAssessment)}</p></div>`
      : '';

    const codeReview = report?.codeReview
      ? `<div class="card"><div class="card-title"><span class="icon">💻</span> Secure Code Review</div><p style="font-size:.88rem;color:var(--muted);line-height:1.7;white-space:pre-wrap">${esc(report.codeReview)}</p></div>`
      : '';

    const findings = renderFindings(
      (report as any)?.securityFindings || (data as any)?.securityFindings || []
    );
    const depVulns  = renderDepVulns((data as any)?.dependencyVulnerabilities || []);
    const stride    = renderStride(report?.threatModel);
    const license   = renderLicense(report?.licenseExplanation);
    const vulns     = renderVulns(data.vulnerabilities || []);
    const alts      = renderAlternatives(report?.alternatives || []);
    const rem       = renderRemediation(report?.remediationSteps || []);
    const tokens    = renderTokenUsage(tokenUsage || null);
    const metadata  = renderMetadata(data);

    const footer = `<div class="footer">
  <p>⚠️ <strong>Disclaimer:</strong> TrustGuard AI provides automated analysis for developer due-diligence. Results may be incomplete — always verify critical findings independently. The misuse of any security information obtained through TrustGuard AI is entirely the responsibility of the user.</p>
  <p style="margin-top:8px">Generated ${esc(d)} · TrustGuard AI Security Agent</p>
</div>`;

    const deprecationWarning = renderDeprecationWarning(data);
    const dataCompletenessWarning = renderDataCompletenessWarning(data);
    const appendix = renderTechnicalAppendix();

    const body = [header, dataCompletenessWarning, deprecationWarning, scoresCard, execSummary, community, metadata,
                  codeReview, findings, depVulns, stride, license, vulns,
                  alts, rem, tokens, appendix, footer].filter(Boolean).join('\n');

    return wrapHtml(`TrustGuard AI — ${data.packageName}@${data.version || 'latest'}`, body);
  }

  // ── Batch report ────────────────────────────────────────────────────────────

  /** Generate a combined HTML report for all completed batch items */
  static generateBatchHtml(items: BatchItem[], _options?: { timezone?: TimezoneId }): string {
    const d = new Date().toISOString().split('T')[0];
    const done   = items.filter(i => i.status === 'DONE');
    const failed = items.filter(i => i.status === 'FAILED');

    const headerBlock = `<div class="page-header">
  <h1>TrustGuard AI — Batch Security Report</h1>
  <div class="meta">
    Generated ${d} · ${done.length} packages analysed${failed.length ? ` · ${failed.length} failed` : ''}
  </div>
</div>`;

    // Summary table
    const summaryRows = items.filter(i => i.selected).map(item => {
      if (item.status === 'FAILED') {
        const failureNote = item.retryStatus === 'retryFailed' ? 'Failed after 3 retries (API rate limit)' : (item.error || '');
        return `<tr><td class="mono">${esc(item.name)}</td><td>${esc(item.version)}</td>
          <td colspan="7" style="color:var(--red)">⚠ ${esc(failureNote)}</td></tr>`;
      }
      const r = item.result;
      const verdict = (item.report as any)?.developerVerdict || '';
      const licenseId = r?.license?.spdxId || (r as any)?.github?.license?.spdxId || '–';
      const commUse = r?.commercialUseClassification;
      const commUseDisplay = commUse === 'allowed' ? '✅ Allowed' : commUse === 'restricted' ? '🚫 Restricted' : commUse === 'needs-permission' ? '⚠️ Permission' : '–';
      const commModel = r?.commercialModel;
      const commModelDisplay = commModel === 'open-source' ? '🟢 OSS' : commModel === 'freemium' ? '🟡 Freemium' : commModel === 'paid' ? '🔴 Paid' : '';
      return `<tr>
        ${r?.isDeprecated ? '<td class="mono text-red">' : r?.isUnmaintained ? '<td class="mono text-amber">' : '<td class="mono">'}${esc(item.name)}</td>
        <td class="mono text-dim">${esc(item.version)}</td>
        <td class="badge-ecosystem"><span class="badge badge-ecosystem">${esc(item.ecosystem)}</span></td>
        <td><span class="${severityClass(r?.riskScore && r.riskScore > 70 ? 'CRITICAL' : r?.riskScore && r.riskScore > 40 ? 'HIGH' : 'LOW')}">${r?.riskScore ?? '–'}/100</span></td>
        <td style="color:var(--green)">${r?.trustScore ?? '–'}/100</td>
        <td>${r?.vulnerabilities?.length ?? 0}</td>
        <td class="mono text-dim" style="font-size:.78rem">${esc(licenseId)}</td>
        <td style="font-size:.78rem">${commModelDisplay} ${commUseDisplay}</td>
        ${verdict ? `<td><span class="badge ${verdictClass(verdict)}">${esc(verdict)}</span></td>` : '<td>–</td>'}
      </tr>`;
    }).join('');

    const summaryTable = `<div class="card">
  <div class="card-title"><span class="icon">📊</span> Batch Summary</div>
  <table class="summary-table">
    <thead><tr><th>Package</th><th>Version</th><th>Ecosystem</th><th>Risk</th><th>Trust</th><th>CVEs</th><th>License</th><th>Commercial</th><th>Verdict</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
</div>`;

    // Per-package sections (collapsible)
    const packageSections = done.map(item => {
      const d2 = item.result;
      const rep = item.report as Partial<AnalysisReport> | null;
      const tu  = item.tokenUsage;

      const metadataOnlyBanner = item.metadataOnly
        ? `<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:14px 18px;margin-bottom:12px;font-size:.82rem;color:#f59e0b">
            ⚠ <strong>Metadata-only analysis</strong> — no API key was configured when this batch ran.
            OSV CVE data and risk/trust scores are shown, but there is no AI executive summary, STRIDE threat model,
            security findings, alternatives or remediation. Configure your API key in TrustGuard AI Settings and re-run for full AI reports.
           </div>`
        : '';

      const inner = [
        renderDataCompletenessWarning(d2 || {}),
        renderDeprecationWarning(d2 || {}),
        metadataOnlyBanner,
        `<div class="card">${renderScores(d2 || {})}</div>`,
        (rep as any)?.executiveSummary
          ? `<div class="card"><div class="card-title">Executive Summary</div><p style="font-size:.88rem;color:var(--muted);line-height:1.7">${esc((rep as any).executiveSummary)}</p></div>`
          : '',
        renderMetadata(d2 || {}),
        rep?.codeReview
          ? `<div class="card"><div class="card-title">Secure Code Review</div><p style="font-size:.88rem;color:var(--muted);line-height:1.7;white-space:pre-wrap">${esc(rep.codeReview)}</p></div>`
          : '',
        renderFindings((rep as any)?.securityFindings || (d2 as any)?.securityFindings || []),
        renderDepVulns((d2 as any)?.dependencyVulnerabilities || []),
        renderStride(rep?.threatModel),
        renderLicense(rep?.licenseExplanation),
        renderVulns(d2?.vulnerabilities || []),
        renderAlternatives(rep?.alternatives || []),
        renderRemediation(rep?.remediationSteps || []),
        renderTokenUsage(tu || null),
      ].filter(Boolean).join('\n');

      return `<details>
  <summary>
    <span class="badge badge-ecosystem">${esc(item.ecosystem)}</span>
    ${esc(item.name)} <span class="mono text-dim" style="font-size:.8rem;font-weight:400">${esc(item.version)}</span>
    <span style="margin-left:auto;font-size:.75rem;font-weight:400;color:var(--dim)">
      Risk ${d2?.riskScore ?? '–'}/100 · Trust ${d2?.trustScore ?? '–'}/100 · ${d2?.vulnerabilities?.length ?? 0} CVEs
    </span>
  </summary>
  <div class="details-body">${inner}</div>
</details>`;
    }).join('\n');

    const footer = `<div class="footer">
  <p>⚠️ TrustGuard AI automated analysis — verify critical findings independently before making decisions.</p>
  <p style="margin-top:6px">Generated ${d} · TrustGuard AI Security Agent</p>
</div>`;

    const appendix = renderTechnicalAppendix();
    const body = [headerBlock, summaryTable, packageSections, appendix, footer].filter(Boolean).join('\n');
    return wrapHtml('TrustGuard AI — Batch Security Report', body);
  }

  /** Generate a combined Markdown report for all completed batch items */
  static generateBatchMarkdown(items: BatchItem[]): string {
    const d = new Date().toISOString().split('T')[0];
    const done = items.filter(i => i.status === 'DONE');
    let md = `# TrustGuard AI — Batch Security Report\n\n`;
    md += `**Date:** ${d}  \n**Packages analysed:** ${done.length}\n\n---\n\n`;

    // Summary table
    md += `## Summary\n\n`;
    md += `| Package | Version | Ecosystem | Risk | Trust | CVEs | License | Commercial | Verdict |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;
    items.filter(i => i.selected).forEach(item => {
      if (item.status === 'FAILED') {
        const failNote = item.retryStatus === 'retryFailed' ? 'FAILED (rate limit, 3 retries)' : 'FAILED';
        md += `| ${item.name} | ${item.version} | ${item.ecosystem} | – | – | – | – | – | ${failNote} |\n`;
        return;
      }
      const r = item.result;
      const verdict = (item.report as any)?.developerVerdict
        || (item.metadataOnly ? '*(no API key)*' : '–');
      const licId = r?.license?.spdxId || (r as any)?.github?.license?.spdxId || '–';
      const commUse = r?.commercialUseClassification === 'allowed' ? '✅ Allowed' : r?.commercialUseClassification === 'restricted' ? '🚫 Restricted' : r?.commercialUseClassification === 'needs-permission' ? '⚠️ Permission' : '–';
      md += `| \`${item.name}\` | \`${item.version}\` | ${item.ecosystem} | ${r?.riskScore ?? '–'}/100 | ${r?.trustScore ?? '–'}/100 | ${r?.vulnerabilities?.length ?? 0} | ${licId} | ${commUse} | ${verdict} |\n`;
    });
    md += `\n---\n\n`;

    // Per-package details
    done.forEach(item => {
      const r   = item.result || {};
      const rep = item.report as Partial<AnalysisReport> | null;
      const tu  = item.tokenUsage;

      md += `## ${item.name}@${item.version} (${item.ecosystem})\n\n`;
      if (r.isDeprecated) {
        md += `> 🚫 **DEPRECATED**: ${r.deprecationMessage || 'This package has been marked as deprecated.'}\n\n`;
      } else if (r.isUnmaintained) {
        md += `> ⚠️ **UNMAINTAINED**: No commits for 3+ years. May not receive security updates.\n\n`;
      }
      if (r.resolvedGithubUrl || r.resolvedRegistryUrl) {
        if (r.resolverConfidence) {
          const confLabels: Record<string, string> = {
            VERIFIED: '✓ VERIFIED', HIGH: '↑ HIGH', MEDIUM: '~ MEDIUM', LOW: '↓ LOW', UNRESOLVED: '? UNRESOLVED',
          };
          md += `**Source Confidence:** ${confLabels[r.resolverConfidence] || r.resolverConfidence}  \n`;
        }
        if (r.resolvedGithubSubPath) {
          md += `**Sub-path scan:** \`${r.resolvedGithubSubPath}\` *(findings scoped to this path; repo metadata from base repo)*  \n`;
        }
        if (r.resolvedGithubUrl) {
          md += `**Repository:** [${r.resolvedGithubUrl.replace('https://github.com/', '')}](${r.resolvedGithubUrl})${r.resolvedVia ? ` *(via ${r.resolvedVia.replace(/_/g, ' ')})*` : ''}  \n`;
          // Version-specific release link
          if (r.version && r.version !== 'latest') {
            const releaseUrl = r.resolvedGitRef
              ? `${r.resolvedGithubUrl}/releases/tag/${r.resolvedGitRef}`
              : `${r.resolvedGithubUrl}/releases`;
            const releaseLabel = r.resolvedGitRef ? `release/${r.resolvedGitRef}` : `releases (v${r.version})`;
            md += `**Analyzed version:** [${releaseLabel}](${releaseUrl})  \n`;
          }
        }
        if (r.resolvedRegistryUrl) md += `**Registry:** [\`${r.resolvedRegistryUrl}\`](${r.resolvedRegistryUrl})  \n`;
        md += `\n`;
      }
      md += `**Risk Score:** ${r.riskScore ?? 'N/A'}/100  \n`;
      md += `**Trust Score:** ${r.trustScore ?? 'N/A'}/100  \n`;
      if ((rep as any)?.developerVerdict) md += `**Verdict:** ${(rep as any).developerVerdict}  \n`;
      md += `\n`;

      // Show a clear notice when this item was processed without an API key
      if (item.metadataOnly) {
        md += `> ⚠ **Metadata-only** — this package was analysed without an AI API key. `
            + `No executive summary, STRIDE threat model, security findings, alternatives or remediation are available. `
            + `Configure an API key in TrustGuard AI Settings and re-run for full AI analysis.\n\n`;
      }

      if (rep?.executiveSummary) md += `### Executive Summary\n\n${rep.executiveSummary}\n\n`;

      // Security findings
      const findings: any[] = (rep as any)?.securityFindings || (r as any)?.securityFindings || [];
      if (findings.length) {
        md += `### Security Findings (${findings.length})\n\n`;
        findings.forEach((f: any, i: number) => {
          md += `#### ${i + 1}. [${f.severity}] ${f.title}\n`;
          md += `**Category:** ${f.category} · ${f.confirmed ? '✓ Confirmed' : '? Inferred'}\n\n`;
          md += `${f.description}\n\n`;
          if (f.evidence) md += `**Evidence:** \`${f.evidence}\`\n\n`;
          if (f.recommendation) md += `> **Recommendation:** ${f.recommendation}\n\n`;
        });
      } else {
        md += `### Security Findings\n\nNo security issues identified.\n\n`;
      }

      // Vulnerabilities
      md += `### Known Vulnerabilities\n\n`;
      if (r.vulnerabilities?.length) {
        const hasApplicability = r.vulnerabilities.some((v: any) => v.isApplicable !== undefined);
        const fixedCount = hasApplicability ? r.vulnerabilities.filter((v: any) => v.isApplicable === false).length : 0;
        const applicableCount = r.vulnerabilities.length - fixedCount;
        if (hasApplicability && fixedCount > 0) {
          md += `> ${r.vulnerabilities.length} total · ${applicableCount} applicable · ${fixedCount} already fixed in your version\n\n`;
        }
        if (hasApplicability) {
          md += `| ID | Severity | Title | Fixed In | Status |\n|---|---|---|---|---|\n`;
          r.vulnerabilities.forEach((v: any) => {
            const status = v.isApplicable === false ? '✓ Already Fixed' : v.isApplicable === true ? '⚠ Applicable' : '—';
            md += `| [${v.id}](https://osv.dev/vulnerability/${v.id}) | ${v.severity} | ${v.title} | ${v.fixedInVersion} | ${status} |\n`;
          });
        } else {
          md += `| ID | Severity | Title | Fixed In |\n|---|---|---|---|\n`;
          r.vulnerabilities.forEach((v: any) => {
            md += `| [${v.id}](https://osv.dev/vulnerability/${v.id}) | ${v.severity} | ${v.title} | ${v.fixedInVersion} |\n`;
          });
        }
        md += `\n`;
      } else {
        md += `No known CVEs found.\n\n`;
      }

      if (rep?.threatModel) {
        const tm = rep.threatModel;
        md += `### STRIDE Threat Model\n\n**Overall: ${tm.overallThreatLevel}**\n\n`;
        md += `| Category | Assessment |\n|---|---|\n`;
        md += `| Spoofing | ${tm.spoofing} |\n| Tampering | ${tm.tampering} |\n`;
        md += `| Repudiation | ${tm.repudiation} |\n| Info Disclosure | ${tm.informationDisclosure} |\n`;
        md += `| DoS | ${tm.denialOfService} |\n| Elevation | ${tm.elevationOfPrivilege} |\n\n`;
      }

      if (rep?.remediationSteps?.length) {
        md += `### Remediation\n\n`;
        rep.remediationSteps.forEach(s => {
          md += `- **[${s.priority}]** ${s.action}\n  > *${s.rationale}*\n\n`;
        });
      }

      if (tu) {
        md += `### Token Usage\n\n`;
        md += `\`${tu.provider}/${tu.model}\` · ${tu.totalTokens.toLocaleString()} tokens · ${formatCost(tu.estimatedCostUSD)}\n\n`;
      }

      md += `---\n\n`;
    });

    md += `*Generated by TrustGuard AI. Automated analysis — verify critical findings independently.*\n`;
    return md;
  }

  static triggerDownload(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
