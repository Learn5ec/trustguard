import type { PackageAnalysisData, ScoreBreakdown } from '../../types/analysis';

function daysBetween(date1: Date, date2: Date): number {
  return Math.abs(Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24)));
}

export function calculateRiskScore(data: Partial<PackageAnalysisData>): { score: number, breakdown: ScoreBreakdown[] } {
  let score = 0;
  const breakdown: ScoreBreakdown[] = [];

  // Vulnerability component (0-40 points)
  if (data.vulnerabilities && data.vulnerabilities.length > 0) {
    const criticalCount = data.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
    const highCount = data.vulnerabilities.filter((v) => v.severity === 'HIGH').length;
    const medCount = data.vulnerabilities.filter((v) => v.severity === 'MEDIUM').length;
    
    const vulnScore = Math.min(40, criticalCount * 15 + highCount * 8 + medCount * 3);
    if (vulnScore > 0) {
      score += vulnScore;
      breakdown.push({ factor: 'Vulnerabilities', impact: vulnScore, description: `Found ${criticalCount} critical, ${highCount} high, and ${medCount} medium vulnerabilities.` });
    }
  }

  // Maintenance component (0-25 points)
  if (data.github?.lastCommitDate) {
    const daysSinceLastCommit = daysBetween(data.github.lastCommitDate, new Date());
    let maintScore = 0;
    if (daysSinceLastCommit > 730) maintScore = 25;
    else if (daysSinceLastCommit > 365) maintScore = 15;
    else if (daysSinceLastCommit > 180) maintScore = 8;

    if (maintScore > 0) {
      score += maintScore;
      breakdown.push({ factor: 'Maintenance', impact: maintScore, description: `Last commit was ${daysSinceLastCommit} days ago, indicating slow maintenance.` });
    }
  }
  
  if (data.github?.archived) {
    score += 20;
    breakdown.push({ factor: 'Archived', impact: 20, description: 'Repository is archived and no longer maintained.' });
  }

  if (data.github && data.github.openIssues > 500) {
    score += 5;
    breakdown.push({ factor: 'Issue Backlog', impact: 5, description: 'High number of open issues (>500).' });
  }

  // OpenSSF Scorecard component (0-20 points)
  if (data.scorecard?.score !== undefined) {
    const ssfRisk = Math.round((10 - data.scorecard.score) * 2);
    if (ssfRisk > 0) {
      score += ssfRisk;
      breakdown.push({ factor: 'OpenSSF Scorecard', impact: ssfRisk, description: `Low OpenSSF Scorecard score (${data.scorecard.score}/10).` });
    }
  }

  // License component (0-10 points)
  const licenseRisk = getLicenseRiskPoints(data.license?.spdxId);
  if (licenseRisk > 0) {
    score += licenseRisk;
    breakdown.push({ factor: 'License Risk', impact: licenseRisk, description: `License '${data.license?.spdxId || 'Unknown'}' poses potential risks or is missing.` });
  }

  // Dependency depth component (0-5 points)
  if (data.vulnerabilities) {
    const transitiveVulnCount = data.vulnerabilities.filter((v) => v.isTransitive).length;
    if (transitiveVulnCount > 0) {
      const transRisk = Math.min(5, transitiveVulnCount * 2);
      score += transRisk;
      breakdown.push({ factor: 'Transitive Risks', impact: transRisk, description: `Contains ${transitiveVulnCount} transitive vulnerabilities.` });
    }
  }

  return { score: Math.min(100, score), breakdown };
}

function getLicenseRiskPoints(spdxId?: string): number {
  if (!spdxId) return 5;
  if (['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'].includes(spdxId)) return 8;
  if (['LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0'].includes(spdxId)) return 4;
  if (['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'].includes(spdxId)) return 0;
  if (spdxId === 'UNLICENSED' || spdxId === 'NONE') return 10;
  return 3;
}
