import type { PackageAnalysisData, AnalysisReport, TokenUsage } from '../../types/analysis';
import { formatCost } from '../llm/tokenPricing';
import { formatTimestamp, formatDuration } from '../utils/timestamps';
import type { TimezoneId } from '../utils/timestamps';
import { POPULARITY_LABEL_DESCRIPTIONS } from '../constants/popularityThresholds';

export class ReportExporter {

  static generateMarkdown(
    data: Partial<PackageAnalysisData>,
    report: Partial<AnalysisReport> | null,
    tokenUsage?: TokenUsage | null,
    options?: { timezone?: TimezoneId }
  ): string {
    const tz: TimezoneId = options?.timezone || 'IST';
    const d = data.reportGeneratedAt
      ? formatTimestamp(data.reportGeneratedAt, tz)
      : new Date().toISOString().split('T')[0];
    let md = `# TrustGuard AI Security Report: ${data.packageName}@${data.version || 'latest'}\n\n`;

    // Data Completeness Warning
    if (data.dataCompleteness && data.dataCompleteness !== 'FULL') {
      const msg = data.dataCompleteness === 'PARTIAL'
        ? 'Some data sources were unavailable. Scores may be less accurate — GitHub or download stats could not be retrieved.'
        : data.dataCompleteness === 'METADATA_ONLY'
        ? 'Only registry metadata was available. No GitHub activity data or download statistics could be retrieved.'
        : 'Could not retrieve meaningful data for this package. Verify the package name and ecosystem are correct.';
      const icon = data.dataCompleteness === 'NONE' ? '❌' : data.dataCompleteness === 'METADATA_ONLY' ? '📋' : '⚠️';
      const label = data.dataCompleteness === 'NONE' ? 'NO DATA' : data.dataCompleteness === 'METADATA_ONLY' ? 'METADATA ONLY' : 'PARTIAL DATA';
      md += `> ${icon} **${label}**: ${msg}\n\n`;
    }

    // Deprecated/Unmaintained Warning
    if (data.isDeprecated) {
      md += `> 🚫 **DEPRECATED PACKAGE**: ${data.deprecationMessage || 'This package has been marked as deprecated.'}\n\n`;
    } else if (data.isUnmaintained) {
      md += `> ⚠️ **UNMAINTAINED PACKAGE**: No commits for 3+ years. May not receive security updates.\n\n`;
    }

    // Repository attribution
    if (data.resolvedGithubUrl || data.resolvedRegistryUrl) {
      md += `## Source Repository\n\n`;
      if (data.resolverConfidence) {
        const confLabels: Record<string, string> = {
          VERIFIED: '✓ VERIFIED', HIGH: '↑ HIGH', MEDIUM: '~ MEDIUM', LOW: '↓ LOW', UNRESOLVED: '? UNRESOLVED',
        };
        md += `**Source Confidence:** ${confLabels[data.resolverConfidence] || data.resolverConfidence}  \n`;
      }
      if (data.resolvedGithubSubPath) {
        md += `**Sub-path scan:** \`${data.resolvedGithubSubPath}\`  \n`;
        md += `> ⓘ Security findings, STRIDE model, and code review are scoped to this sub-path only. Stars, forks, version metadata, and trust/risk scores are from the base repository.\n\n`;
      }
      if (data.resolvedGithubUrl) {
        md += `**Repository:** [${data.resolvedGithubUrl}](${data.resolvedGithubUrl})  \n`;
        if (data.resolvedVia) md += `**Resolved via:** ${data.resolvedVia.replace(/_/g, ' ')}  \n`;
      }
      // Version-specific release link
      if (data.resolvedGithubUrl && data.version && data.version !== 'latest') {
        const releaseUrl = data.resolvedGitRef
          ? `${data.resolvedGithubUrl}/releases/tag/${data.resolvedGitRef}`
          : `${data.resolvedGithubUrl}/releases`;
        const releaseLabel = data.resolvedGitRef ? `release/${data.resolvedGitRef}` : `releases (v${data.version})`;
        md += `**Analyzed version:** [${releaseLabel}](${releaseUrl})  \n`;
      }
      if (data.resolvedRegistryUrl) md += `**Registry URL:** [\`${data.resolvedRegistryUrl}\`](${data.resolvedRegistryUrl})  \n`;
      md += `> ⓘ Verify this is the correct repository — wrong repo matches can happen when package names are ambiguous.\n\n`;
    }

    md += `**Date:** ${d}  \n`;
    md += `**Ecosystem:** ${data.ecosystem || 'Unknown'}  \n`;
    if (data.popularityLabel) md += `**Popularity:** ${data.popularityLabel}  \n`;
    if (data.scanStartedAt) md += `**Scan Started:** ${formatTimestamp(data.scanStartedAt, tz)}  \n`;
    if (data.scanStartedAt && data.scanEndedAt) md += `**Scan Duration:** ${formatDuration(data.scanStartedAt, data.scanEndedAt)}  \n`;
    if (data.commercialModel && data.commercialModel !== 'unknown') md += `**Commercial Model:** ${data.commercialModel}  \n`;
    if (data.commercialUseClassification && data.commercialUseClassification !== 'unknown') md += `**Commercial Use:** ${data.commercialUseClassification}  \n`;
    if (data.github?.latestRelease) md += `**Latest Release:** ${data.github.latestRelease}  \n`;
    md += `**Risk Score:** ${data.riskScore ?? 'N/A'}/100  \n`;
    md += `**Trust Score:** ${data.trustScore ?? 'N/A'}/100  \n`;
    if (report?.developerVerdict) md += `**Verdict:** ${report.developerVerdict}  \n`;
    md += `\n---\n\n`;

    // Executive Summary
    if (report?.executiveSummary) {
      md += `## 🛡️ Executive Summary\n\n${report.executiveSummary}\n\n`;
    }

    // Community Assessment
    if ((report as any)?.communityAssessment) {
      md += `## 👥 Community Assessment\n\n${(report as any).communityAssessment}\n\n`;
    }

    // Score Breakdown
    if (data.riskScoreBreakdown && data.riskScoreBreakdown.length > 0) {
      md += `## 📊 Risk Score Breakdown\n\n`;
      md += `| Factor | Impact | Reason |\n|---|---|---|\n`;
      data.riskScoreBreakdown.forEach(b => {
        md += `| ${b.factor} | +${b.impact} | ${b.description} |\n`;
      });
      md += `\n`;
    }
    if (data.trustScoreBreakdown && data.trustScoreBreakdown.length > 0) {
      md += `## 📊 Trust Score Breakdown\n\n`;
      md += `| Factor | Impact | Reason |\n|---|---|---|\n`;
      data.trustScoreBreakdown.forEach(b => {
        md += `| ${b.factor} | ${b.impact > 0 ? '+' : ''}${b.impact} | ${b.description} |\n`;
      });
      md += `\n`;
    }

    // Repository Metadata
    if (data.github || data.packageStats) {
      md += `## 📦 Repository Metadata\n\n`;
      if (data.github) {
        md += `- **Owner:** ${data.github.owner?.login || 'Unknown'} (${data.github.owner?.type || 'User'})\n`;
        if (data.github.authorPublicRepos) md += `- **Author public repos:** ${data.github.authorPublicRepos}\n`;
        if (data.github.authorFollowers) md += `- **Author followers:** ${data.github.authorFollowers}\n`;
        md += `- **Created:** ${data.github.createdAt ? new Date(data.github.createdAt).toLocaleDateString() : 'Unknown'}\n`;
        md += `- **Last Update:** ${data.github.lastCommitDate ? new Date(data.github.lastCommitDate).toLocaleDateString() : 'Unknown'}\n`;
        if (data.github.commitsLast90Days !== undefined) md += `- **Commits (last 90d):** ${data.github.commitsLast90Days}\n`;
        md += `- **Stars:** ${data.github.stars?.toLocaleString() || 0}\n`;
        md += `- **Forks:** ${data.github.forks?.toLocaleString() || 0}\n`;
        if (data.github.watchers) md += `- **Watchers:** ${data.github.watchers.toLocaleString()}\n`;
        md += `- **Open Issues:** ${data.github.openIssues?.toLocaleString() || 0}\n`;
        md += `- **Contributors:** ${data.github.contributorsCount || 'Unknown'}\n`;
        md += `- **Archived:** ${data.github.archived ? 'Yes ⚠️' : 'No'}\n`;
        if (data.github.latestRelease) md += `- **Latest Release:** ${data.github.latestRelease}\n`;
        md += `- **Repository:** ${data.github.url || 'N/A'}\n`;
      }
      if (data.packageStats) {
        md += `- **Weekly Downloads:** ${data.packageStats.weeklyDownloads?.toLocaleString() || 0}\n`;
        md += `- **Latest Version:** ${data.packageStats.latestVersion || 'Unknown'}\n`;
        if (data.packageStats.latestSecureVersion) md += `- **Latest Secure Version:** ${data.packageStats.latestSecureVersion}\n`;
        if (data.packageStats.dependentsCount !== undefined) md += `- **Packages Depending On This:** ~${data.packageStats.dependentsCount.toLocaleString()}\n`;
      }
      md += `\n`;
    }

    // Code Review
    if (report?.codeReview) {
      md += `## 💻 Secure Code Review\n\n${report.codeReview}\n\n`;
    }

    // Security Findings
    const secFindings = (report as any)?.securityFindings;
    if (secFindings && secFindings.length > 0) {
      md += `## 🔍 Security Findings\n\n`;

      // Summary counts
      const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
      const counts: Record<string, number> = {};
      severities.forEach(s => { counts[s] = secFindings.filter((f: any) => f.severity === s).length; });
      const summaryParts = severities.filter(s => counts[s] > 0).map(s => `${counts[s]} ${s}`);
      md += `**${secFindings.length} findings:** ${summaryParts.join(', ')}\n\n`;

      // Summary table (severity-sorted)
      md += `| Severity | Category | Title | Confirmed |\n|---|---|---|---|\n`;
      const sorted = [...secFindings].sort((a: any, b: any) =>
        severities.indexOf(a.severity) - severities.indexOf(b.severity)
      );
      sorted.forEach((f: any) => {
        md += `| ${f.severity} | ${f.category} | ${f.title} | ${f.confirmed ? '✓' : '?'} |\n`;
      });
      md += `\n`;

      // Full details per finding
      sorted.forEach((f: any, i: number) => {
        md += `### ${i + 1}. [${f.severity}] ${f.title}\n\n`;
        md += `**Category:** ${f.category}  \n`;
        md += `**Status:** ${f.confirmed ? '✓ Confirmed (directly observed in code)' : '? Suspected (inferred)'}\n\n`;
        md += `${f.description}\n\n`;
        if (f.evidence) md += `**Evidence:** \`${f.evidence}\`\n\n`;
        if (f.recommendation) md += `> **Recommendation:** ${f.recommendation}\n\n`;
      });
    }

    // Dependency CVE summary
    const depVulns = (report as any)?.dependencyVulnerabilities || (data as any)?.dependencyVulnerabilities;
    if (depVulns && depVulns.length > 0) {
      md += `## 📦 Dependency CVEs\n\n`;
      md += `| Dependency | Version | CVE Count | Highest Severity | Top CVEs |\n|---|---|---|---|---|\n`;
      depVulns.forEach((dv: any) => {
        md += `| ${dv.dependencyName} | ${dv.dependencyVersion} | ${dv.vulnerabilityCount} | ${dv.highestSeverity} | ${dv.topCVEs.join(', ')} |\n`;
      });
      md += `\n`;
    }

    // STRIDE Threat Model
    if (report?.threatModel) {
      const tm = report.threatModel;
      md += `## 🕸️ STRIDE Threat Model\n\n`;
      md += `**Overall Threat Level: ${tm.overallThreatLevel}**\n\n`;
      md += `| Category | Description |\n|---|---|\n`;
      md += `| Spoofing | ${tm.spoofing} |\n`;
      md += `| Tampering | ${tm.tampering} |\n`;
      md += `| Repudiation | ${tm.repudiation} |\n`;
      md += `| Information Disclosure | ${tm.informationDisclosure} |\n`;
      md += `| Denial of Service | ${tm.denialOfService} |\n`;
      md += `| Elevation of Privilege | ${tm.elevationOfPrivilege} |\n\n`;
    }

    // License
    if (report?.licenseExplanation) {
      const lic = report.licenseExplanation;
      md += `## 📜 License Analysis\n\n`;
      md += `**${lic.summary}**\n\n`;
      md += `- Risk Level: ${lic.riskLevel}\n`;
      md += `- Commercial Use: ${lic.commercialUse}\n`;
      md += `- Modify & Distribute: ${lic.modifyAndDistribute}\n`;
      md += `- Patent Protection: ${lic.patentProtection}\n\n`;
      if (lic.canYou?.length) { md += `**You Can:** ${lic.canYou.join(', ')}\n\n`; }
      if (lic.cannotYou?.length) { md += `**You Cannot:** ${lic.cannotYou.join(', ')}\n\n`; }
      if (lic.mustYou?.length) { md += `**You Must:** ${lic.mustYou.join(', ')}\n\n`; }
      md += `> ${lic.plainEnglish}\n\n`;
    }

    // Vulnerabilities
    md += `## 🐛 Known Vulnerabilities\n\n`;
    if (!data.vulnerabilities || data.vulnerabilities.length === 0) {
      md += `No known vulnerabilities found.\n\n`;
    } else {
      const hasApplicability = data.vulnerabilities.some(v => v.isApplicable !== undefined);
      const fixedCount = hasApplicability ? data.vulnerabilities.filter(v => v.isApplicable === false).length : 0;
      const applicableCount = data.vulnerabilities.length - fixedCount;
      if (hasApplicability && fixedCount > 0) {
        md += `> ${data.vulnerabilities.length} total · ${applicableCount} applicable to your version · ${fixedCount} already fixed\n\n`;
      }
      if (hasApplicability) {
        md += `| ID | Severity | Title | Fixed In | Status |\n|---|---|---|---|---|\n`;
        data.vulnerabilities.forEach(v => {
          const status = v.isApplicable === false ? '✓ Already Fixed' : v.isApplicable === true ? '⚠ Applicable' : '—';
          md += `| [${v.id}](https://osv.dev/vulnerability/${v.id}) | ${v.severity} | ${v.title} | ${v.fixedInVersion} | ${status} |\n`;
        });
      } else {
        md += `| ID | Severity | Title | Fixed In |\n|---|---|---|---|\n`;
        data.vulnerabilities.forEach(v => {
          md += `| [${v.id}](https://osv.dev/vulnerability/${v.id}) | ${v.severity} | ${v.title} | ${v.fixedInVersion} |\n`;
        });
      }
      md += `\n`;
    }

    // Alternatives
    if (report?.alternatives && report.alternatives.length > 0) {
      md += `## 🔄 Alternatives\n\n`;
      report.alternatives.forEach((alt, i) => {
        md += `### ${i + 1}. ${alt.name} (${alt.ecosystem})\n`;
        md += `${alt.description}\n`;
        md += `- **Why Better:** ${alt.whyBetter}\n`;
        md += `- License: ${alt.license} | ⭐ ${alt.githubStars} | ⬇ ${alt.weeklyDownloads}/wk | Difficulty: ${alt.migrationDifficulty} | Maintenance: ${alt.maintenanceStatus}\n`;
        if (alt.notableFeatures?.length) md += `- **Features:** ${alt.notableFeatures.join(', ')}\n`;
        md += `\n`;
      });
    }

    // Remediation
    if (report?.remediationSteps && report.remediationSteps.length > 0) {
      md += `## 🛠️ Remediation Steps\n\n`;
      report.remediationSteps.forEach(s => {
        md += `- **[${s.priority}]** ${s.action}\n  > *${s.rationale}*\n\n`;
      });
    }

    // Token Usage & Cost
    if (tokenUsage) {
      md += `## 🪙 Token Usage & Cost\n\n`;
      md += `| | Value |\n|---|---|\n`;
      md += `| Provider / Model | \`${tokenUsage.provider}/${tokenUsage.model}\` |\n`;
      md += `| Input tokens | ${tokenUsage.inputTokens.toLocaleString()} |\n`;
      md += `| Output tokens | ${tokenUsage.outputTokens.toLocaleString()} |\n`;
      md += `| **Total tokens** | **${tokenUsage.totalTokens.toLocaleString()}** |\n`;
      md += `| **Estimated cost** | **${formatCost(tokenUsage.estimatedCostUSD)}** |\n`;
      md += `| Counts source | ${tokenUsage.isEstimated ? 'Estimated (~4 chars/token)' : 'Reported by API'} |\n\n`;
    }

    // Technical Appendix
    md += `---\n\n## 📖 Appendix — Technical Reference\n\n`;

    md += `### Popularity Labels\n\n`;
    md += `| Label | Description |\n|---|---|\n`;
    const popLabels = ['Niche', 'Small community', 'Established', 'Popular', 'Industry Standard'];
    popLabels.forEach(label => {
      const desc = POPULARITY_LABEL_DESCRIPTIONS[label] || '';
      md += `| **${label}** | ${desc} |\n`;
    });
    md += `\n`;

    md += `### License Quick Reference\n\n`;
    md += `| SPDX ID | Type | Notes |\n|---|---|---|\n`;
    const licRef = [
      ['MIT', 'Permissive', 'Use freely. Commercial OK.'],
      ['Apache-2.0', 'Permissive', 'Like MIT + explicit patent grant.'],
      ['BSD-3-Clause', 'Permissive', 'Attribution required. No endorsement.'],
      ['ISC', 'Permissive', 'Equivalent to MIT. Common in npm.'],
      ['GPL-3.0', 'Copyleft', 'Source must be open if distributed.'],
      ['AGPL-3.0', 'Strong Copyleft', 'GPL + network copyleft (SaaS).'],
      ['LGPL-3.0', 'Weak Copyleft', 'Library copyleft — linking allowed.'],
      ['MPL-2.0', 'Weak Copyleft', 'File-level copyleft.'],
      ['SSPL-1.0', 'Source Available', 'Highly restrictive for SaaS.'],
      ['CC0-1.0', 'Public Domain', 'No rights reserved.'],
    ];
    licRef.forEach(([id, type, notes]) => { md += `| \`${id}\` | ${type} | ${notes} |\n`; });
    md += `\n`;

    md += `### Risk Score Methodology\n\n`;
    md += `Risk Score = Vulnerabilities(0–40) + Maintenance(0–25) + Archived(+20) + OpenSSF Scorecard(0–20) + License(0–10) + Transitive CVEs(0–5).\n\n`;
    md += `Higher score = more risk. 0 = no detected risks.\n\n`;

    md += `### Trust Score Methodology\n\n`;
    md += `Starts at 100. Deductions for risk factors. Bonuses for: >1M downloads (+10), >10k stars (+8), >100 contributors (+5), recent release (+5), signed releases (+5).\n\n`;

    md += `### Data Sources\n\n`;
    md += `- **OSV.dev** — CVE and GHSA vulnerability advisories (version-specific queries)\n`;
    md += `- **GitHub API** — repository stats, commits, license, archival status\n`;
    md += `- **npm Registry** — download counts, version history\n`;
    md += `- **PyPI API** — Python package metadata, version publish dates\n`;
    md += `- **pypistats.org** — Python package download statistics\n`;
    md += `- **deps.dev (Google)** — package source resolution (primary GitHub URL lookup)\n`;
    md += `- **crates.io** — Rust crate metadata\n`;
    md += `- **pub.dev** — Dart/Flutter package metadata\n`;
    md += `- **OpenSSF Scorecard** — security hygiene scores\n\n`;

    md += `---\n*Generated by TrustGuard AI. Automated analysis — verify critical findings independently.*\n`;
    md += `*⚠️ Misuse of security information obtained through TrustGuard AI is entirely the responsibility of the user.*\n`;
    return md;
  }

  static triggerDownload(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
