import type { PackageAnalysisData, Ecosystem, GitHubStats, PackageStats, LicenseData, DependencyVuln } from '../../types/analysis';
import { fetchOSV, scanDependencies, parseDependenciesFromManifest } from './osv';
import { fetchNPMRegistry } from './npm';
import { fetchGitHubStats } from './github';

function computePopularityLabel(stars: number, weeklyDownloads: number, ecosystem: Ecosystem): string {
  const signal = ecosystem === 'npm' || ecosystem === 'pypi' ? weeklyDownloads : stars;
  const threshold = ecosystem === 'npm' || ecosystem === 'pypi'
    ? [100, 10000, 100000, 1000000]
    : [100, 1000, 10000, 50000];
  const labels = ['Niche', 'Small community', 'Established', 'Popular', 'Industry Standard'];
  for (let i = threshold.length - 1; i >= 0; i--) {
    if (signal >= threshold[i]) return labels[i + 1];
  }
  return labels[0];
}

export async function analyzePackage(packageName: string, version: string, ecosystem: Ecosystem): Promise<Partial<PackageAnalysisData>> {

  let githubUrl = '';
  let packageStats: PackageStats | undefined = undefined;
  let registryLicense: LicenseData | undefined = undefined;

  // Check if packageName is a GitHub URL or if ecosystem is github
  if (packageName.startsWith('https://github.com/') || ecosystem === 'github') {
    githubUrl = packageName;
    ecosystem = 'github';
    const match = packageName.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      packageName = match[2].replace(/\.git$/, '');
    }
  } else if (ecosystem === 'npm') {
    const registryData = await fetchNPMRegistry(packageName);
    if (registryData) {
      if (registryData.repositoryUrl) githubUrl = registryData.repositoryUrl;
      if (!version || version === 'latest') version = registryData.latestVersion;
      if (registryData.license) registryLicense = registryData.license;

      packageStats = {
        weeklyDownloads: registryData.weeklyDownloads,
        monthlyDownloads: registryData.weeklyDownloads * 4, // approximation
        publishedDate: registryData.publishedDate || new Date(),
        latestVersion: registryData.latestVersion,
        description: registryData.description,
        dependentsCount: registryData.dependentsCount,
      };
    }
  }

  // Fetch OSV and GitHub in parallel
  const promises: Promise<any>[] = [
    fetchOSV(packageName, ecosystem)
  ];

  if (githubUrl) {
    promises.push(fetchGitHubStats(githubUrl));
  }

  const results = await Promise.allSettled(promises);

  const vulnerabilities = results[0].status === 'fulfilled' ? results[0].value : [];
  const github = githubUrl && results[1] && results[1].status === 'fulfilled' ? results[1].value : null;

  // Resolve final license
  const finalLicense = github?.license || registryLicense;

  // Compute latest secure version (latest version not affected by critical CVEs)
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

  // Compute popularity label
  const popularityLabel = computePopularityLabel(
    github?.stars || 0,
    packageStats?.weeklyDownloads || 0,
    ecosystem
  );

  return {
    packageName,
    version,
    ecosystem,
    vulnerabilities,
    github: github as GitHubStats,
    packageStats,
    license: finalLicense,
    popularityLabel,
  };
}

/**
 * After source code has been fetched, scan the package's own dependencies for CVEs.
 * This is called from the analysis store after source code is available.
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
