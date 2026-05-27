import type { PackageAnalysisData, Ecosystem, GitHubStats, PackageStats, LicenseData, DependencyVuln, Vulnerability } from '../../types/analysis';
import { fetchOSV, scanDependencies, parseDependenciesFromManifest } from './osv';
import { fetchNPMRegistry } from './npm';
import { fetchGitHubStats } from './github';
import { resolvePackageSource } from './sourceResolver';
import type { ResolverConfidence } from './sourceResolver';
import { fetchPyPIStats } from './pypiStats';
import { cleanVersionString, isAlreadyFixed } from '../utils/semver';
import { computePopularityLabel } from '../constants/popularityThresholds';

// OSI-approved licenses → open-source
const OSI_APPROVED = new Set([
  'MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause',
  'GPL-2.0', 'GPL-2.0-only', 'GPL-3.0', 'GPL-3.0-only',
  'LGPL-2.0', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-3.0', 'LGPL-3.0-only',
  'MPL-2.0', 'AGPL-3.0', 'AGPL-3.0-only', 'EPL-1.0', 'EPL-2.0',
  'CC0-1.0', 'Unlicense', 'EUPL-1.2',
]);

// Copyleft (commercial use restricted)
const STRONG_COPYLEFT = new Set([
  'GPL-2.0', 'GPL-2.0-only', 'GPL-3.0', 'GPL-3.0-only',
  'AGPL-3.0', 'AGPL-3.0-only', 'SSPL-1.0',
]);

// Weak copyleft (commercial use needs permissions)
const WEAK_COPYLEFT = new Set([
  'LGPL-2.0', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-3.0', 'LGPL-3.0-only',
  'MPL-2.0', 'EPL-1.0', 'EPL-2.0', 'EUPL-1.2',
]);

// Quick SPDX normalization for common non-standard strings that arrive from registries
// (the full map lives in registryLookup.ts; this covers the most frequent ones the
// orchestrator might still encounter via GitHub license or other sources)
const SPDX_QUICK_NORMALIZE: Record<string, string> = {
  'MIT License': 'MIT', 'MIT license': 'MIT',
  'Apache': 'Apache-2.0', 'Apache 2.0': 'Apache-2.0', 'Apache License 2.0': 'Apache-2.0',
  'BSD': 'BSD-3-Clause', 'BSD License': 'BSD-3-Clause', 'New BSD': 'BSD-3-Clause',
  'Simplified BSD': 'BSD-2-Clause', '2-Clause BSD': 'BSD-2-Clause',
  'GPL': 'GPL-3.0', 'GPLv2': 'GPL-2.0', 'GPLv3': 'GPL-3.0',
  'LGPL': 'LGPL-2.1', 'LGPLv2': 'LGPL-2.1', 'LGPLv3': 'LGPL-3.0',
  'AGPL': 'AGPL-3.0', 'AGPLv3': 'AGPL-3.0',
  'MPL': 'MPL-2.0', 'MPL 2.0': 'MPL-2.0',
  'ISC License': 'ISC',
  'PSF': 'Python-2.0', 'PSFL': 'Python-2.0',
};

function deriveCommercialClassifications(licenseId: string | undefined): {
  commercialModel: PackageAnalysisData['commercialModel'];
  commercialUseClassification: PackageAnalysisData['commercialUseClassification'];
} {
  if (!licenseId) return { commercialModel: 'unknown', commercialUseClassification: 'unknown' };

  // Normalize non-standard SPDX strings before set lookups
  const normalized = SPDX_QUICK_NORMALIZE[licenseId] || licenseId;
  const id = normalized.toUpperCase().replace(/-ONLY$/, '').replace(/-OR-LATER$/, '');

  if (STRONG_COPYLEFT.has(normalized)) {
    return { commercialModel: 'open-source', commercialUseClassification: 'restricted' };
  }
  if (WEAK_COPYLEFT.has(normalized)) {
    return { commercialModel: 'open-source', commercialUseClassification: 'needs-permission' };
  }
  if (OSI_APPROVED.has(normalized)) {
    return { commercialModel: 'open-source', commercialUseClassification: 'allowed' };
  }
  if (id.includes('PROPRIETARY') || id.includes('COMMERCIAL') || id.includes('ALL RIGHTS RESERVED')) {
    return { commercialModel: 'paid', commercialUseClassification: 'needs-permission' };
  }

  return { commercialModel: 'unknown', commercialUseClassification: 'needs-permission' };
}

const THREE_YEARS_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

export async function analyzePackage(packageName: string, version: string, ecosystem: Ecosystem): Promise<Partial<PackageAnalysisData>> {

  let githubUrl = '';
  let packageStats: PackageStats | undefined = undefined;
  let registryLicense: LicenseData | undefined = undefined;
  let resolvedVia: PackageAnalysisData['resolvedVia'] = 'user_input';
  let resolvedRegistryUrl: string | undefined;
  let isDeprecated = false;
  let deprecationMessage: string | undefined;
  let resolverConfidence: ResolverConfidence = 'UNRESOLVED';
  let latestVersionPublishedAt: Date | undefined;
  let registryLicenseId: string | undefined;

  // ── Resolve GitHub URL ────────────────────────────────────────────────────
  if (packageName.startsWith('https://github.com/') || ecosystem === 'github') {
    githubUrl = packageName;
    ecosystem = 'github';
    resolvedVia = 'direct_url';
    resolverConfidence = 'HIGH';
    const match = packageName.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      packageName = match[2].replace(/\.git$/, '');
    }
  } else if (ecosystem === 'npm') {
    // Run npm registry fetch (for stats) and source resolver in parallel
    const [npmResult, sourceResult] = await Promise.allSettled([
      fetchNPMRegistry(packageName),
      resolvePackageSource(packageName, version === 'latest' ? undefined : version, 'npm'),
    ]);

    if (npmResult.status === 'fulfilled' && npmResult.value) {
      const registryData = npmResult.value;
      // Only use npm's repositoryUrl as fallback — sourceResolver is more authoritative
      if (!version || version === 'latest') version = registryData.latestVersion;
      if (registryData.license) registryLicense = registryData.license;

      packageStats = {
        weeklyDownloads: registryData.weeklyDownloads,
        monthlyDownloads: registryData.weeklyDownloads * 4,
        publishedDate: registryData.publishedDate || new Date(),
        latestVersion: registryData.latestVersion,
        description: registryData.description,
        dependentsCount: registryData.dependentsCount,
      };
    }

    if (sourceResult.status === 'fulfilled' && sourceResult.value) {
      const resolved = sourceResult.value;
      if (resolved.githubUrl) {
        githubUrl = resolved.githubUrl;
        resolvedVia = 'registry_lookup';
      } else if (npmResult.status === 'fulfilled' && npmResult.value?.repositoryUrl) {
        githubUrl = npmResult.value.repositoryUrl;
        resolvedVia = 'registry_lookup';
      }
      if (resolved.registryUrl) resolvedRegistryUrl = resolved.registryUrl;
      if (resolved.isDeprecated) isDeprecated = true;
      if (resolved.deprecationMessage) deprecationMessage = resolved.deprecationMessage;
      if (resolved.latestVersion && (!version || version === 'latest')) version = resolved.latestVersion;
      if (resolved.latestVersionPublishedAt) latestVersionPublishedAt = resolved.latestVersionPublishedAt;
      if (resolved.licenseId) registryLicenseId = resolved.licenseId;
      resolverConfidence = resolved.confidence;
    } else if (npmResult.status === 'fulfilled' && npmResult.value?.repositoryUrl) {
      githubUrl = npmResult.value.repositoryUrl;
      resolvedVia = 'registry_lookup';
      resolverConfidence = 'MEDIUM';
    }

  } else if (ecosystem !== 'unknown') {
    // For all other ecosystems, use sourceResolver (deps.dev + registry + cross-validation)
    const isPyPI = ecosystem === 'pypi' || ecosystem === 'uv' || ecosystem === 'pip' || ecosystem === 'pipx';

    // Run sourceResolver and (for PyPI) download stats in parallel
    const [resolveResult, pypiStatsResult] = await Promise.allSettled([
      resolvePackageSource(packageName, version === 'latest' ? undefined : version, ecosystem),
      isPyPI ? fetchPyPIStats(packageName) : Promise.resolve(null),
    ]);

    if (resolveResult.status === 'fulfilled') {
      const resolved = resolveResult.value;
      if (resolved.githubUrl) {
        githubUrl = resolved.githubUrl;
        resolvedVia = 'registry_lookup';
      }
      if (resolved.registryUrl) resolvedRegistryUrl = resolved.registryUrl;
      if (resolved.isDeprecated) isDeprecated = true;
      if (resolved.deprecationMessage) deprecationMessage = resolved.deprecationMessage;
      if (resolved.latestVersion && (!version || version === 'latest')) version = resolved.latestVersion;
      if (resolved.latestVersionPublishedAt) latestVersionPublishedAt = resolved.latestVersionPublishedAt;
      if (resolved.licenseId) registryLicenseId = resolved.licenseId;
      resolverConfidence = resolved.confidence;
    } else {
      // Resolution failure is non-fatal — continue with what we have
      resolverConfidence = 'UNRESOLVED';
    }

    // Apply PyPI download stats
    if (isPyPI && pypiStatsResult.status === 'fulfilled' && pypiStatsResult.value) {
      const stats = pypiStatsResult.value;
      packageStats = {
        weeklyDownloads: stats.weeklyDownloads,
        monthlyDownloads: stats.monthlyDownloads,
        publishedDate: latestVersionPublishedAt || new Date(),
        latestVersion: version || 'latest',
        description: '',
      };
    }
  }

  // ── Fetch OSV (version-aware) and GitHub in parallel ────────────────────
  const cleanVer = version ? cleanVersionString(version) : '';
  const promises: Promise<any>[] = [
    fetchOSV(packageName, ecosystem, cleanVer || undefined)
  ];

  if (githubUrl) {
    promises.push(fetchGitHubStats(githubUrl));
  }

  const results = await Promise.allSettled(promises);

  let vulnerabilities: Vulnerability[] = results[0].status === 'fulfilled' ? results[0].value : [];
  const github = githubUrl && results[1] && results[1].status === 'fulfilled' ? results[1].value : null;

  // ── Annotate CVE applicability ────────────────────────────────────────────
  // Mark CVEs as already-fixed when their fixedInVersion ≤ the installed version
  if (cleanVer && vulnerabilities.length > 0) {
    vulnerabilities = vulnerabilities.map((v: Vulnerability): Vulnerability => {
      const alreadyFixed = isAlreadyFixed(v.fixedInVersion, cleanVer);
      if (alreadyFixed) {
        return {
          ...v,
          isApplicable: false,
          applicabilityNote: `Fixed in ${v.fixedInVersion} — you have ${cleanVer}. Not applicable to your installed version.`,
        };
      }
      // CVE with no fix or fix > installed version — applicable
      return {
        ...v,
        isApplicable: true,
        applicabilityNote: v.fixedInVersion && v.fixedInVersion !== 'None' && v.fixedInVersion !== 'Unknown'
          ? `Fix available in ${v.fixedInVersion} — upgrade recommended.`
          : 'No fix available yet.',
      };
    });
  }

  // ── Resolve final license (GitHub > npm registry > PyPI registry) ────────
  // Build a LicenseData from the registry-extracted SPDX id if GitHub has none
  const registryFallbackLicense: LicenseData | undefined = registryLicenseId
    ? { spdxId: registryLicenseId, name: registryLicenseId }
    : undefined;
  const finalLicense = github?.license || registryLicense || registryFallbackLicense;

  // ── Compute latest secure version ────────────────────────────────────────
  let latestSecureVersion: string | undefined;
  if (packageStats?.latestVersion && vulnerabilities.length > 0) {
    const criticalWithFix = vulnerabilities
      .filter((v: any) => (v.severity === 'CRITICAL' || v.severity === 'HIGH') && v.fixedInVersion && v.fixedInVersion !== 'None' && v.fixedInVersion !== 'Unknown')
      .map((v: any) => v.fixedInVersion);
    if (criticalWithFix.length > 0) {
      latestSecureVersion = criticalWithFix[criticalWithFix.length - 1];
    } else {
      latestSecureVersion = packageStats.latestVersion;
    }
  } else if (packageStats?.latestVersion) {
    latestSecureVersion = packageStats.latestVersion;
  }
  if (packageStats && latestSecureVersion) {
    packageStats.latestSecureVersion = latestSecureVersion;
  }

  // ── Compute isUnmaintained (3+ years no commits, or registry publish date) ──
  const lastCommit = github?.lastCommitDate;
  let isUnmaintained = lastCommit
    ? (Date.now() - new Date(lastCommit).getTime()) > THREE_YEARS_MS
    : false;

  // Fallback: if no GitHub data, use latestVersionPublishedAt from registry
  if (!isUnmaintained && !github && latestVersionPublishedAt) {
    isUnmaintained = (Date.now() - latestVersionPublishedAt.getTime()) > THREE_YEARS_MS;
  }

  // ── Deprecated check from GitHub archived ────────────────────────────────
  const finalIsDeprecated = isDeprecated || !!(github?.archived);

  // ── Popularity label ──────────────────────────────────────────────────────
  const popularityLabel = computePopularityLabel(
    github?.stars || 0,
    packageStats?.weeklyDownloads || 0,
    ecosystem
  );

  // ── Commercial classifications (from license) ─────────────────────────────
  const { commercialModel, commercialUseClassification } = deriveCommercialClassifications(
    finalLicense?.spdxId
  );

  // ── Data Completeness ─────────────────────────────────────────────────────
  // FULL  = GitHub data + vulnerabilities fetched + (package stats or github-only)
  // PARTIAL = GitHub data but no download stats (or vice versa)
  // METADATA_ONLY = No GitHub data but registry metadata available
  // NONE = No useful data retrieved
  const hasGitHub = !!github;
  const hasStats  = !!packageStats?.weeklyDownloads || ecosystem === 'github';
  const hasVulns  = results[0].status === 'fulfilled'; // even if empty array = success

  let dataCompleteness: PackageAnalysisData['dataCompleteness'];
  if (hasGitHub && (hasStats || ecosystem === 'github' || ecosystem === 'go' || ecosystem === 'rust') && hasVulns) {
    dataCompleteness = 'FULL';
  } else if (hasGitHub || hasStats) {
    dataCompleteness = 'PARTIAL';
  } else if (resolvedRegistryUrl) {
    dataCompleteness = 'METADATA_ONLY';
  } else {
    dataCompleteness = 'NONE';
  }

  return {
    packageName,
    version,
    ecosystem,
    vulnerabilities,
    github: github as GitHubStats,
    packageStats,
    license: finalLicense,
    popularityLabel,
    resolvedGithubUrl: githubUrl || undefined,
    resolvedVia,
    resolvedRegistryUrl,
    resolverConfidence,
    isDeprecated: finalIsDeprecated,
    isUnmaintained,
    deprecationMessage,
    commercialModel,
    commercialUseClassification,
    dataCompleteness,
    latestVersionPublishedAt,
  };
}

/**
 * After source code has been fetched, scan the package's own dependencies for CVEs.
 */
export async function enrichWithDependencyVulns(
  sourceCode: string,
  ecosystem: string
): Promise<DependencyVuln[]> {
  try {
    const deps = parseDependenciesFromManifest(sourceCode, ecosystem);
    if (deps.length === 0) return [];
    return await scanDependencies(deps);
  } catch {
    return [];
  }
}
