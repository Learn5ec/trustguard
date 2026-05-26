import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PackageAnalysisData, AnalysisReport, TokenUsage, SecurityFinding } from '../../types/analysis';
import { formatCost } from '../llm/tokenPricing';

// Color palette matching the dark UI
const C = {
  bg: '#0a0a0f',
  card: '#18181b',
  cardBorder: '#27272a',
  text: '#d4d4d8',
  textMuted: '#71717a',
  textBright: '#fafafa',
  accent: '#818cf8',
  accentBg: '#312e81',
  red: '#f87171',
  redBg: '#450a0a',
  redBorder: '#7f1d1d',
  orange: '#fb923c',
  orangeBg: '#431407',
  orangeBorder: '#7c2d12',
  yellow: '#fbbf24',
  yellowBg: '#451a03',
  yellowBorder: '#78350f',
  blue: '#60a5fa',
  blueBg: '#172554',
  blueBorder: '#1e3a5f',
  green: '#4ade80',
  greenBg: '#052e16',
  greenBorder: '#14532d',
  cyan: '#22d3ee',
  cyanBg: '#083344',
};

const s = StyleSheet.create({
  page: { backgroundColor: C.bg, padding: 32, fontFamily: 'Helvetica', color: C.text, fontSize: 9 },
  // Header
  headerBar: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, padding: 16, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: C.textBright, marginBottom: 4 },
  subtitle: { fontSize: 10, color: C.textMuted, marginBottom: 8 },
  badge: { backgroundColor: C.accentBg, color: C.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 8, alignSelf: 'flex-start', marginBottom: 6, fontWeight: 'bold' },
  row: { flexDirection: 'row', gap: 8 },
  // Scores
  scoreBox: { flex: 1, backgroundColor: '#111114', borderRadius: 6, padding: 10, borderWidth: 1, borderColor: C.cardBorder },
  scoreLabel: { fontSize: 8, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  scoreValue: { fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
  // Sections
  section: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: C.textBright, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: C.cardBorder, paddingBottom: 6 },
  bodyText: { fontSize: 9, color: C.text, lineHeight: 1.5, marginBottom: 4 },
  mutedText: { fontSize: 8, color: C.textMuted, lineHeight: 1.4 },
  // Tables
  tableHeader: { flexDirection: 'row', backgroundColor: '#111114', borderBottomWidth: 1, borderBottomColor: C.cardBorder, paddingVertical: 4, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1f1f23', paddingVertical: 4, paddingHorizontal: 6 },
  thText: { fontSize: 8, fontWeight: 'bold', color: C.textMuted, textTransform: 'uppercase' },
  tdText: { fontSize: 8, color: C.text },
  // Metadata items
  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { fontSize: 8, color: C.textMuted, width: 110, fontWeight: 'bold' },
  metaValue: { fontSize: 8, color: C.text, flex: 1 },
  // Severity badge styles
  sevCritical: { color: '#ef4444', fontWeight: 'bold' },
  sevHigh: { color: '#f97316', fontWeight: 'bold' },
  sevMedium: { color: '#eab308', fontWeight: 'bold' },
  sevLow: { color: '#22c55e', fontWeight: 'bold' },
  // Finding cards
  findingCard: { borderRadius: 6, padding: 10, marginBottom: 8, borderWidth: 1 },
  findingHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' },
  findingBadge: { fontSize: 7, fontWeight: 'bold', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  findingTitle: { fontSize: 9, fontWeight: 'bold', color: C.textBright, marginBottom: 3 },
  findingDesc: { fontSize: 8, color: C.text, lineHeight: 1.5, marginBottom: 4 },
  findingEvidence: { backgroundColor: '#050508', borderRadius: 4, padding: 6, marginBottom: 4, borderWidth: 1, borderColor: '#27272a' },
  findingEvidenceLabel: { fontSize: 7, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  findingEvidenceText: { fontSize: 7, color: C.accent, fontFamily: 'Courier' },
  findingRec: { fontSize: 8, color: C.textMuted, lineHeight: 1.4, fontStyle: 'italic', borderLeftWidth: 2, borderLeftColor: C.cardBorder, paddingLeft: 5 },
  confirmedBadge: { fontSize: 7, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 1, color: '#4ade80', backgroundColor: '#052e16', borderColor: '#14532d' },
  suspectedBadge: { fontSize: 7, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 1, color: '#71717a', backgroundColor: '#18181b', borderColor: '#3f3f46' },
  findingSummaryBar: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  // Breakdown row
  bkRow: { backgroundColor: '#0d0d12', borderRadius: 4, padding: 6, marginBottom: 4 },
  bkFactor: { fontSize: 8, color: C.textMuted },
  bkDesc: { fontSize: 7, color: '#52525b', marginTop: 1 },
  // Verdict
  verdictUse: { backgroundColor: C.greenBg, color: C.green, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, fontSize: 9, fontWeight: 'bold', alignSelf: 'flex-start' },
  verdictCaution: { backgroundColor: C.yellowBg, color: C.yellow, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, fontSize: 9, fontWeight: 'bold', alignSelf: 'flex-start' },
  verdictAvoid: { backgroundColor: C.redBg, color: C.red, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, fontSize: 9, fontWeight: 'bold', alignSelf: 'flex-start' },
  // Footer
  footer: { textAlign: 'center', fontSize: 7, color: '#3f3f46', marginTop: 16, borderTopWidth: 1, borderTopColor: C.cardBorder, paddingTop: 10 },
  // Remediation priority badges
  prioImmediate: { backgroundColor: C.redBg, color: C.red, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, fontSize: 7, fontWeight: 'bold' },
  prioShort: { backgroundColor: C.yellowBg, color: C.yellow, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, fontSize: 7, fontWeight: 'bold' },
  prioLong: { backgroundColor: C.cyanBg, color: C.cyan, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, fontSize: 7, fontWeight: 'bold' },
});

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
type Severity = typeof SEVERITY_ORDER[number];

const SEV_CARD_STYLE: Record<Severity, { bg: string; border: string; badgeBg: string; badgeBorder: string; badgeColor: string }> = {
  CRITICAL: { bg: '#1a0505', border: C.redBorder,    badgeBg: '#450a0a', badgeBorder: C.redBorder,    badgeColor: C.red    },
  HIGH:     { bg: '#1a0b05', border: C.orangeBorder, badgeBg: '#431407', badgeBorder: C.orangeBorder, badgeColor: C.orange },
  MEDIUM:   { bg: '#1a1005', border: C.yellowBorder, badgeBg: '#451a03', badgeBorder: C.yellowBorder, badgeColor: C.yellow },
  LOW:      { bg: '#05101a', border: C.blueBorder,   badgeBg: '#172554', badgeBorder: C.blueBorder,   badgeColor: C.blue   },
  INFO:     { bg: '#111114', border: C.cardBorder,   badgeBg: '#18181b', badgeBorder: '#3f3f46',      badgeColor: C.textMuted },
};

const CATEGORY_LABELS: Record<string, string> = {
  README_CODE_MISMATCH:        'README MISMATCH',
  SILENT_TELEMETRY:            'SILENT TELEMETRY',
  THIRD_PARTY_DATA_EXFILTRATION: 'DATA EXFILTRATION',
  INSECURE_TRANSMISSION:       'INSECURE TRANSMISSION',
  SENSITIVE_OUTBOUND:          'SENSITIVE OUTBOUND',
  BACKGROUND_PROCESS:          'BACKGROUND PROCESS',
  POSTINSTALL_RISK:            'POSTINSTALL RISK',
  EXCESSIVE_PERMISSIONS:       'EXCESSIVE PERMISSIONS',
  HARDCODED_SECRET:            'HARDCODED SECRET',
  DANGEROUS_API_USAGE:         'DANGEROUS API',
  PROTOTYPE_POLLUTION:         'PROTOTYPE POLLUTION',
  OBFUSCATION_INDICATOR:       'OBFUSCATION',
  DEPENDENCY_CVE:              'DEPENDENCY CVE',
};

function getSevStyle(sev: string) {
  switch (sev) {
    case 'CRITICAL': return s.sevCritical;
    case 'HIGH':     return s.sevHigh;
    case 'MEDIUM': case 'MODERATE': return s.sevMedium;
    default: return s.sevLow;
  }
}

function getVerdictStyle(v?: string) {
  if (!v) return s.verdictCaution;
  if (v === 'USE') return s.verdictUse;
  if (v === 'AVOID' || v === 'REPLACE_SOON') return s.verdictAvoid;
  return s.verdictCaution;
}

function getPrioStyle(p: string) {
  if (p === 'IMMEDIATE') return s.prioImmediate;
  if (p === 'SHORT_TERM') return s.prioShort;
  return s.prioLong;
}

function MetaItem({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === null) return null;
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{String(value)}</Text>
    </View>
  );
}

function FindingCard({ finding }: { finding: SecurityFinding }) {
  const sev = (finding.severity as Severity) || 'INFO';
  const cardStyle = SEV_CARD_STYLE[sev] || SEV_CARD_STYLE.INFO;
  const catLabel = CATEGORY_LABELS[finding.category] || finding.category;

  return (
    <View
      style={[s.findingCard, { backgroundColor: cardStyle.bg, borderColor: cardStyle.border }]}
      wrap={false}
    >
      {/* Header row: severity badge + category tag + confirmed/suspected */}
      <View style={s.findingHeaderRow}>
        <Text style={[s.findingBadge, {
          backgroundColor: cardStyle.badgeBg,
          borderColor: cardStyle.badgeBorder,
          color: cardStyle.badgeColor,
        }]}>
          {sev}
        </Text>
        <Text style={[s.findingBadge, {
          backgroundColor: '#1e1b4b',
          borderColor: '#3730a3',
          color: '#a5b4fc',
        }]}>
          {catLabel}
        </Text>
        <Text style={finding.confirmed ? s.confirmedBadge : s.suspectedBadge}>
          {finding.confirmed ? 'Confirmed' : 'Suspected'}
        </Text>
      </View>

      {/* Title */}
      <Text style={s.findingTitle}>{finding.title}</Text>

      {/* Description */}
      {finding.description ? (
        <Text style={s.findingDesc}>{finding.description}</Text>
      ) : null}

      {/* Evidence */}
      {finding.evidence ? (
        <View style={s.findingEvidence}>
          <Text style={s.findingEvidenceLabel}>Evidence</Text>
          <Text style={s.findingEvidenceText}>{finding.evidence}</Text>
        </View>
      ) : null}

      {/* Recommendation */}
      {finding.recommendation ? (
        <Text style={s.findingRec}>{finding.recommendation}</Text>
      ) : null}
    </View>
  );
}

interface Props {
  data: Partial<PackageAnalysisData>;
  report: Partial<AnalysisReport> | null;
  tokenUsage?: TokenUsage | null;
}

export function TrustGuardPdfDocument({ data, report, tokenUsage }: Props) {
  const dateStr = new Date().toLocaleDateString();
  const riskColor  = (data.riskScore  ?? 0) >= 50 ? C.red   : (data.riskScore  ?? 0) >= 20 ? C.yellow : C.green;
  const trustColor = (data.trustScore ?? 0) >= 70 ? C.green : (data.trustScore ?? 0) >= 40 ? C.yellow : C.red;

  // Gather security findings from report or data (mirrored by analysisStore)
  const secFindings: SecurityFinding[] = (report as any)?.securityFindings
    ?? (data as any)?.securityFindings
    ?? [];

  const sortedFindings = [...secFindings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity as Severity) - SEVERITY_ORDER.indexOf(b.severity as Severity)
  );

  // Count by severity for summary bar
  const sevCounts = SEVERITY_ORDER.reduce((acc, s) => {
    acc[s] = secFindings.filter(f => f.severity === s).length;
    return acc;
  }, {} as Record<Severity, number>);

  const depVulns = (report as any)?.dependencyVulnerabilities ?? (data as any)?.dependencyVulnerabilities ?? [];
  const communityAssessment = (report as any)?.communityAssessment;

  return (
    <Document title={`TrustGuard AI Report - ${data.packageName}`} author="TrustGuard AI Security Agent">

      {/* ── PAGE 1: Header · Scores · Executive Summary · Metadata ── */}
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerBar}>
          <Text style={s.badge}>{(data.ecosystem || 'npm').toUpperCase()}</Text>
          <Text style={s.title}>{data.packageName || 'Unknown'} @ {data.version || 'latest'}</Text>
          <Text style={s.subtitle}>TrustGuard AI Security Analysis Report — {dateStr}</Text>
          {data.popularityLabel && (
            <Text style={[s.mutedText, { marginTop: 3 }]}>Popularity: {data.popularityLabel}</Text>
          )}
          {report?.developerVerdict && (
            <Text style={getVerdictStyle(report.developerVerdict)}>
              Verdict: {report.developerVerdict.replace(/_/g, ' ')}
            </Text>
          )}
        </View>

        {/* Score Cards */}
        <View style={[s.row, { marginBottom: 12 }]}>
          <View style={s.scoreBox}>
            <Text style={s.scoreLabel}>Risk Score</Text>
            <Text style={[s.scoreValue, { color: riskColor }]}>
              {data.riskScore ?? 0}<Text style={{ fontSize: 10, color: C.textMuted }}> / 100</Text>
            </Text>
            {data.riskScoreBreakdown?.map((b, i) => (
              <View key={i} style={s.bkRow}>
                <View style={s.row}>
                  <Text style={s.bkFactor}>{b.factor}</Text>
                  <Text style={[s.bkFactor, { color: C.red, marginLeft: 'auto' }]}>+{b.impact}</Text>
                </View>
                <Text style={s.bkDesc}>{b.description}</Text>
              </View>
            ))}
          </View>
          <View style={s.scoreBox}>
            <Text style={s.scoreLabel}>Trust Score</Text>
            <Text style={[s.scoreValue, { color: trustColor }]}>
              {data.trustScore ?? 0}<Text style={{ fontSize: 10, color: C.textMuted }}> / 100</Text>
            </Text>
            {data.trustScoreBreakdown?.map((b, i) => (
              <View key={i} style={s.bkRow}>
                <View style={s.row}>
                  <Text style={s.bkFactor}>{b.factor}</Text>
                  <Text style={[s.bkFactor, { color: b.impact >= 0 ? C.green : C.yellow, marginLeft: 'auto' }]}>
                    {b.impact > 0 ? '+' : ''}{b.impact}
                  </Text>
                </View>
                <Text style={s.bkDesc}>{b.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Executive Summary */}
        {report?.executiveSummary && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Executive Summary</Text>
            <Text style={s.bodyText}>{report.executiveSummary}</Text>
            {/* Community Assessment inline with executive summary */}
            {communityAssessment && (
              <>
                <Text style={[s.mutedText, { marginTop: 6, fontStyle: 'italic', borderTopWidth: 1, borderTopColor: C.cardBorder, paddingTop: 6 }]}>
                  Community Assessment
                </Text>
                <Text style={s.bodyText}>{communityAssessment}</Text>
              </>
            )}
          </View>
        )}

        {/* Repository Metadata */}
        {data.github && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Repository Metadata</Text>
            <MetaItem label="Owner"          value={`${data.github.owner?.login || 'Unknown'} (${data.github.owner?.type || 'User'})`} />
            <MetaItem label="Created"        value={data.github.createdAt ? new Date(data.github.createdAt).toLocaleDateString() : 'Unknown'} />
            <MetaItem label="Last Update"    value={data.github.lastCommitDate ? new Date(data.github.lastCommitDate).toLocaleDateString() : 'Unknown'} />
            {data.github.commitsLast90Days !== undefined && <MetaItem label="Commits (90d)" value={data.github.commitsLast90Days} />}
            <MetaItem label="Stars"          value={data.github.stars?.toLocaleString()} />
            <MetaItem label="Forks"          value={data.github.forks?.toLocaleString()} />
            <MetaItem label="Open Issues"    value={data.github.openIssues?.toLocaleString()} />
            <MetaItem label="Contributors"   value={data.github.contributorsCount || 'Unknown'} />
            <MetaItem label="Archived"       value={data.github.archived ? 'Yes (ARCHIVED)' : 'No'} />
            <MetaItem label="Repository URL" value={data.github.url} />
            {data.github.latestRelease && <MetaItem label="Latest Release"     value={data.github.latestRelease} />}
            {data.github.watchers !== undefined && <MetaItem label="Watchers"           value={data.github.watchers.toLocaleString()} />}
            {data.github.authorPublicRepos !== undefined && <MetaItem label="Author Public Repos" value={data.github.authorPublicRepos} />}
            {data.github.authorFollowers !== undefined && <MetaItem label="Author Followers"    value={data.github.authorFollowers} />}
            {data.packageStats?.weeklyDownloads !== undefined && (
              <MetaItem label="Weekly Downloads" value={data.packageStats.weeklyDownloads.toLocaleString()} />
            )}
            {data.packageStats?.latestVersion && (
              <MetaItem label="Latest Version" value={data.packageStats.latestVersion} />
            )}
            {data.packageStats?.latestSecureVersion && (
              <MetaItem label="Latest Secure Version" value={data.packageStats.latestSecureVersion} />
            )}
            {data.packageStats?.dependentsCount !== undefined && (
              <MetaItem label="Dependents" value={`~${data.packageStats.dependentsCount.toLocaleString()}`} />
            )}
          </View>
        )}
      </Page>

      {/* ── PAGE 2: Security Findings ── */}
      <Page size="A4" style={s.page}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>
            Security Findings ({secFindings.length})
          </Text>

          {secFindings.length === 0 ? (
            <Text style={[s.bodyText, { color: C.green }]}>
              No security findings identified. The agent found no notable issues in the available source code.
            </Text>
          ) : (
            <>
              {/* Severity summary bar */}
              <View style={s.findingSummaryBar}>
                {SEVERITY_ORDER.filter(sev => sevCounts[sev] > 0).map(sev => {
                  const style = SEV_CARD_STYLE[sev];
                  return (
                    <Text key={sev} style={[s.findingBadge, {
                      backgroundColor: style.badgeBg,
                      borderColor: style.badgeBorder,
                      color: style.badgeColor,
                      fontSize: 8,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                    }]}>
                      {sevCounts[sev]} {sev}
                    </Text>
                  );
                })}
              </View>

              {/* Individual finding cards */}
              {sortedFindings.map((finding, i) => (
                <FindingCard key={i} finding={finding} />
              ))}

              <Text style={[s.mutedText, { marginTop: 4, fontSize: 7 }]}>
                Confirmed = directly observed in provided source code. Suspected = inferred from available context. Always verify independently.
              </Text>
            </>
          )}
        </View>

        {/* Dependency CVEs (on same page if findings are short, wraps if not) */}
        {depVulns.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Dependency CVEs ({depVulns.length})</Text>
            <View style={s.tableHeader}>
              <Text style={[s.thText, { width: '30%' }]}>Dependency</Text>
              <Text style={[s.thText, { width: '18%' }]}>Version</Text>
              <Text style={[s.thText, { width: '14%' }]}>CVEs</Text>
              <Text style={[s.thText, { width: '18%' }]}>Highest Sev.</Text>
              <Text style={[s.thText, { width: '20%' }]}>Top CVE IDs</Text>
            </View>
            {depVulns.map((dv: any, i: number) => (
              <View key={i} style={s.tableRow}>
                <Text style={[s.tdText, { width: '30%', color: C.accent }]}>{dv.dependencyName}</Text>
                <Text style={[s.tdText, { width: '18%' }]}>{dv.dependencyVersion}</Text>
                <Text style={[s.tdText, { width: '14%' }]}>{dv.vulnerabilityCount}</Text>
                <Text style={[s.tdText, { width: '18%' }, getSevStyle(dv.highestSeverity)]}>{dv.highestSeverity}</Text>
                <Text style={[s.tdText, { width: '20%', fontSize: 7 }]}>{dv.topCVEs?.join(', ') || '—'}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* ── PAGE 3: Code Review · STRIDE · License ── */}
      <Page size="A4" style={s.page}>

        {/* Code Review */}
        {report?.codeReview && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Secure Code Review</Text>
            <Text style={s.bodyText}>{report.codeReview}</Text>
          </View>
        )}

        {/* STRIDE Threat Model */}
        {report?.threatModel && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>STRIDE Threat Model</Text>
            <Text style={[s.mutedText, { marginBottom: 6 }]}>
              Overall Threat Level:{' '}
              <Text style={{
                color: report.threatModel.overallThreatLevel === 'CRITICAL' ? C.red
                     : report.threatModel.overallThreatLevel === 'HIGH'     ? C.orange
                     : C.yellow,
                fontWeight: 'bold',
              }}>
                {report.threatModel.overallThreatLevel}
              </Text>
            </Text>
            {(['spoofing', 'tampering', 'repudiation', 'informationDisclosure', 'denialOfService', 'elevationOfPrivilege'] as const).map(cat => (
              <View key={cat} style={s.bkRow}>
                <Text style={[s.bkFactor, { fontWeight: 'bold', color: C.accent, marginBottom: 2 }]}>
                  {cat.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}
                </Text>
                <Text style={s.bkDesc}>{(report.threatModel as any)?.[cat]}</Text>
              </View>
            ))}
          </View>
        )}

        {/* License */}
        {report?.licenseExplanation && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>License Analysis</Text>
            <Text style={[s.bodyText, { fontWeight: 'bold', marginBottom: 4 }]}>{report.licenseExplanation.summary}</Text>
            <View style={[s.row, { gap: 12, marginBottom: 6 }]}>
              <Text style={s.mutedText}>
                Risk:{' '}
                <Text style={{ color: report.licenseExplanation.riskLevel === 'HIGH' ? C.red : C.green }}>
                  {report.licenseExplanation.riskLevel}
                </Text>
              </Text>
              <Text style={s.mutedText}>Commercial: {report.licenseExplanation.commercialUse}</Text>
              <Text style={s.mutedText}>Modify/Distribute: {report.licenseExplanation.modifyAndDistribute}</Text>
            </View>
            {report.licenseExplanation.canYou?.length > 0 && (
              <Text style={[s.mutedText, { color: C.green }]}>Can: {report.licenseExplanation.canYou.join(', ')}</Text>
            )}
            {report.licenseExplanation.cannotYou?.length > 0 && (
              <Text style={[s.mutedText, { color: C.red, marginTop: 2 }]}>Cannot: {report.licenseExplanation.cannotYou.join(', ')}</Text>
            )}
            {report.licenseExplanation.mustYou?.length > 0 && (
              <Text style={[s.mutedText, { color: C.yellow, marginTop: 2 }]}>Must: {report.licenseExplanation.mustYou.join(', ')}</Text>
            )}
            <Text style={[s.bodyText, { marginTop: 6, fontStyle: 'italic', color: C.textMuted }]}>
              {report.licenseExplanation.plainEnglish}
            </Text>
          </View>
        )}
      </Page>

      {/* ── PAGE 4: Vulnerabilities · Alternatives · Remediation · Token Usage ── */}
      <Page size="A4" style={s.page}>

        {/* Vulnerabilities Table */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Known Vulnerabilities ({data.vulnerabilities?.length || 0})</Text>
          {(!data.vulnerabilities || data.vulnerabilities.length === 0) ? (
            <Text style={[s.bodyText, { color: C.green }]}>No known vulnerabilities found.</Text>
          ) : (
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.thText, { width: '22%' }]}>ID</Text>
                <Text style={[s.thText, { width: '14%' }]}>Severity</Text>
                <Text style={[s.thText, { width: '44%' }]}>Title</Text>
                <Text style={[s.thText, { width: '20%' }]}>Fixed In</Text>
              </View>
              {data.vulnerabilities.map((v, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={[s.tdText, { width: '22%', color: C.accent }]}>{v.id}</Text>
                  <Text style={[s.tdText, { width: '14%' }, getSevStyle(v.severity)]}>{v.severity}</Text>
                  <Text style={[s.tdText, { width: '44%' }]}>{v.title}</Text>
                  <Text style={[s.tdText, { width: '20%' }]}>{v.fixedInVersion || 'None'}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Alternatives */}
        {report?.alternatives && report.alternatives.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Suggested Alternatives</Text>
            {report.alternatives.map((alt, i) => (
              <View key={i} style={[s.bkRow, { marginBottom: 6 }]}>
                <Text style={[s.bkFactor, { fontWeight: 'bold', color: C.textBright, fontSize: 9 }]}>
                  {i + 1}. {alt.name} ({alt.ecosystem})
                </Text>
                <Text style={s.bkDesc}>{alt.description}</Text>
                <Text style={[s.bkDesc, { color: C.green }]}>Why: {alt.whyBetter}</Text>
                <Text style={s.bkDesc}>License: {alt.license} | Stars: {alt.githubStars} | Downloads: {alt.weeklyDownloads}/wk | Difficulty: {alt.migrationDifficulty} | Maintenance: {alt.maintenanceStatus}</Text>
                {alt.notableFeatures?.length > 0 && (
                  <Text style={[s.bkDesc, { marginTop: 2 }]}>Features: {alt.notableFeatures.join(' · ')}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Remediation Steps */}
        {report?.remediationSteps && report.remediationSteps.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Remediation Steps</Text>
            {report.remediationSteps.map((step, i) => (
              <View key={i} style={[s.bkRow, { flexDirection: 'row', gap: 6, alignItems: 'flex-start' }]}>
                <Text style={getPrioStyle(step.priority)}>{step.priority}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bkFactor, { color: C.text }]}>{step.action}</Text>
                  <Text style={[s.bkDesc, { fontStyle: 'italic' }]}>{step.rationale}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Token Usage */}
        {tokenUsage && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Token Usage & Cost</Text>
            <MetaItem label="Provider / Model" value={`${tokenUsage.provider}/${tokenUsage.model}`} />
            <MetaItem label="Input Tokens"    value={tokenUsage.inputTokens.toLocaleString()} />
            <MetaItem label="Output Tokens"   value={tokenUsage.outputTokens.toLocaleString()} />
            <MetaItem label="Total Tokens"    value={tokenUsage.totalTokens.toLocaleString()} />
            <MetaItem label="Estimated Cost"  value={formatCost(tokenUsage.estimatedCostUSD)} />
            <Text style={[s.mutedText, { marginTop: 4 }]}>
              {tokenUsage.isEstimated
                ? 'Token counts are estimated (~4 chars/token).'
                : 'Token counts reported directly by the API.'}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text>TrustGuard AI provides automated analysis for developer due-diligence. Verify critical findings independently.</Text>
          <Text style={{ marginTop: 4 }}>Generated {dateStr} · TrustGuard AI Security Agent</Text>
        </View>
      </Page>
    </Document>
  );
}
