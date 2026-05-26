import type { PackageAnalysisData, AnalysisReport, TokenUsage } from '../../types/analysis';
import { formatCost } from '../llm/tokenPricing';

export class ReportExporter {

  static generateMarkdown(
    data: Partial<PackageAnalysisData>,
    report: Partial<AnalysisReport> | null,
    tokenUsage?: TokenUsage | null
  ): string {
    const d = new Date().toISOString().split('T')[0];
    let md = `# TrustGuard AI Security Report: ${data.packageName}@${data.version || 'latest'}\n\n`;
    md += `**Date:** ${d}  \n`;
    md += `**Ecosystem:** ${data.ecosystem || 'Unknown'}  \n`;
    if (data.popularityLabel) md += `**Popularity:** ${data.popularityLabel}  \n`;
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
      md += `| ID | Severity | Title | Fixed In |\n|---|---|---|---|\n`;
      data.vulnerabilities.forEach(v => {
        md += `| [${v.id}](https://osv.dev/vulnerability/${v.id}) | ${v.severity} | ${v.title} | ${v.fixedInVersion} |\n`;
      });
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
