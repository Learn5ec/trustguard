import type { PackageAnalysisData, ScoreBreakdown } from '../../types/analysis';

function daysBetween(date1: Date, date2: Date): number {
  return Math.abs(Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24)));
}

export function calculateTrustScore(data: Partial<PackageAnalysisData>): { score: number, breakdown: ScoreBreakdown[] } {
  let score = 100;
  const breakdown: ScoreBreakdown[] = [];
  const isGitHubOnly = data.ecosystem === 'github';

  // ── Risk mirror (0–40 deduction) ─────────────────────────────────────────
  if (data.riskScore) {
    const riskDeduction = Math.min(40, Math.round(data.riskScore * 0.4));
    if (riskDeduction > 0) {
      score -= riskDeduction;
      breakdown.push({ factor: 'Risk Score Mirror', impact: -riskDeduction, description: `A risk score of ${data.riskScore}/100 reduces trust proportionally.` });
    }
  }

  // ── Community adoption ────────────────────────────────────────────────────
  if (!isGitHubOnly) {
    // npm/pypi: use weekly downloads
    // IMPORTANT: Guard against undefined coercion — undefined means data was unavailable,
    // not that the package has 0 downloads. Apply a small "incomplete data" penalty instead.
    const weeklyDownloads = data.packageStats?.weeklyDownloads;
    if (weeklyDownloads === undefined || weeklyDownloads === null) {
      // Download stats are unavailable (e.g. npm dependents API or pypistats.org failed)
      score -= 5;
      breakdown.push({ factor: 'Download Data Unavailable', impact: -5, description: 'Could not retrieve download statistics — applying conservative incomplete-data deduction.' });
    } else if (weeklyDownloads < 100) {
      score -= 20;
      breakdown.push({ factor: 'Low Adoption', impact: -20, description: `Only ~${weeklyDownloads.toLocaleString()} weekly downloads — very little battle-testing.` });
    } else if (weeklyDownloads < 5000) {
      score -= 12;
      breakdown.push({ factor: 'Low Adoption', impact: -12, description: `~${weeklyDownloads.toLocaleString()} weekly downloads — limited community adoption.` });
    } else if (weeklyDownloads < 100000) {
      score -= 5;
      breakdown.push({ factor: 'Moderate Adoption', impact: -5, description: `~${weeklyDownloads.toLocaleString()} weekly downloads — moderate adoption.` });
    } else {
      breakdown.push({ factor: 'High Adoption', impact: 0, description: `~${weeklyDownloads.toLocaleString()} weekly downloads — widely adopted and battle-tested.` });
    }

    // Dependents count bonus/malus
    const dependents = data.packageStats?.dependentsCount ?? 0;
    if (dependents > 10000) {
      score += 5;
      breakdown.push({ factor: 'Many Dependents', impact: 5, description: `Used by ${dependents.toLocaleString()}+ packages in the ecosystem — high trust signal.` });
    } else if (dependents < 10 && data.packageStats?.weeklyDownloads !== undefined) {
      score -= 5;
      breakdown.push({ factor: 'Few Dependents', impact: -5, description: `Only ${dependents} packages depend on this — low ecosystem integration.` });
    }
  } else {
    // GitHub-only: use stars as community signal
    const stars = data.github?.stars ?? 0;
    if (stars < 50) {
      score -= 15;
      breakdown.push({ factor: 'Low Star Count', impact: -15, description: `Only ${stars} GitHub stars — little community validation.` });
    } else if (stars < 500) {
      score -= 8;
      breakdown.push({ factor: 'Low Star Count', impact: -8, description: `${stars} GitHub stars — growing but limited community following.` });
    } else if (stars >= 10000) {
      score += 5;
      breakdown.push({ factor: 'High Star Count', impact: 5, description: `${stars.toLocaleString()} GitHub stars — strong community endorsement.` });
    }
  }

  // ── Contributor health (bus factor) ──────────────────────────────────────
  const contributors = data.github?.contributorsCount ?? 0;
  if (contributors === 1) {
    score -= 10;
    breakdown.push({ factor: 'Single Maintainer', impact: -10, description: 'Only 1 contributor — high bus-factor risk if maintainer abandons project.' });
  } else if (contributors >= 10) {
    score += 5;
    breakdown.push({ factor: 'Active Contributors', impact: 5, description: `${contributors} contributors — healthy bus factor and diverse maintainership.` });
  }

  // ── Commit frequency ─────────────────────────────────────────────────────
  const commits90d = data.github?.commitsLast90Days ?? 0;
  if (data.github && commits90d === 0) {
    score -= 10;
    breakdown.push({ factor: 'No Recent Commits', impact: -10, description: 'Zero commits in the last 90 days — project may be abandoned or on life support.' });
  } else if (commits90d >= 10) {
    score += 5;
    breakdown.push({ factor: 'Active Development', impact: 5, description: `${commits90d} commits in the last 90 days — actively maintained.` });
  }

  // ── OpenSSF Scorecard ─────────────────────────────────────────────────────
  if (data.scorecard?.score !== undefined) {
    const prevScore = score;
    score = score * (data.scorecard.score / 10) * 0.4 + score * 0.6;
    const impact = Math.round(score - prevScore);
    if (Math.abs(impact) > 1) {
      breakdown.push({ factor: 'OpenSSF Scorecard', impact, description: `OpenSSF Scorecard score of ${data.scorecard.score}/10 ${impact >= 0 ? 'increases' : 'decreases'} trust.` });
    }
  }

  // ── Signed releases ───────────────────────────────────────────────────────
  if (data.scorecard?.checks?.['Signed-Releases']?.score === 0) {
    score -= 10;
    breakdown.push({ factor: 'Unsigned Releases', impact: -10, description: 'Releases are not cryptographically signed — supply chain integrity risk.' });
  }

  // ── Recent critical CVE ───────────────────────────────────────────────────
  // Only flag recent critical CVEs that are actually applicable to the installed version
  if (data.vulnerabilities) {
    const recentCritical = data.vulnerabilities.some(
      (v) => v.isApplicable !== false && v.severity === 'CRITICAL' && daysBetween(new Date(v.publishedDate), new Date()) < 90
    );
    if (recentCritical) {
      score -= 15;
      breakdown.push({ factor: 'Recent Critical CVE', impact: -15, description: 'A critical vulnerability applicable to your version was disclosed in the last 90 days — patch urgently.' });
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown };
}
