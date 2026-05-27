import type { Vulnerability } from '../../types/analysis';
import { cleanVersionString } from '../utils/semver';

export async function fetchOSV(packageName: string, ecosystem: string, version?: string): Promise<Vulnerability[]> {
  // OSV does not have a 'github' ecosystem — skip query for raw GitHub repos
  if (ecosystem === 'github') return [];
  try {
    const cleanVer = version ? cleanVersionString(version) : '';
    const queryBody: Record<string, unknown> = {
      package: { name: packageName, ecosystem: mapToOsvEcosystem(ecosystem) },
    };
    // Include version when available — OSV will only return advisories that affect
    // the specific version, drastically reducing false-positive CVEs.
    if (cleanVer) {
      queryBody.version = cleanVer;
    }
    const response = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody)
    });
    
    if (!response.ok) return [];

    const data = await response.json();
    // Silently return [] if OSV returns an API error object
    if (data.code !== undefined || data.message !== undefined) return [];
    if (!data.vulns) return [];

    return data.vulns.map((v: any): Vulnerability => ({
      id: v.id,
      severity: v.database_specific?.severity || 'UNKNOWN',
      cvssScore: undefined, // typically need to parse from v.severity array
      title: v.summary || v.id,
      description: v.details || 'No details available',
      affectedVersions: v.affected?.[0]?.versions?.join(', ') || 'Unknown',
      fixedInVersion: extractOsvFixVersion(v),
      publishedDate: v.published,
      modifiedDate: v.modified,
      cweIds: [], // parse from aliases or database_specific if present
      references: v.references?.map((r: any) => r.url) || [],
      isTransitive: false,
      source: 'OSV'
    }));
  } catch {
    return [];
  }
}

function mapToOsvEcosystem(ecosystem: string): string {
  const map: Record<string, string> = {
    npm: 'npm',
    pypi: 'PyPI',
    go: 'Go',
    maven: 'Maven',
    nuget: 'NuGet',
    rust: 'crates.io',
    ruby: 'RubyGems',
    pub: 'Pub'
  };
  return map[ecosystem] || ecosystem;
}

function extractOsvFixVersion(v: any): string {
  const events = v.affected?.[0]?.ranges?.[0]?.events;
  if (!events) return 'Unknown';
  const fixEvent = events.find((e: any) => e.fixed);
  return fixEvent ? fixEvent.fixed : 'None';
}

export interface DepScanInput {
  name: string;
  version: string;
  ecosystem: string;
}

export async function scanDependencies(deps: DepScanInput[]): Promise<import('../../types/analysis').DependencyVuln[]> {
  if (!deps || deps.length === 0) return [];

  // Cap at 25 to avoid rate limiting
  const capped = deps.slice(0, 25);

  // OSV batch query
  const queries = capped.map(d => ({
    package: {
      name: d.name,
      ecosystem: mapToOsvEcosystem(d.ecosystem)
    },
    ...(d.version && d.version !== '*' ? { version: d.version } : {})
  }));

  try {
    const res = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries })
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    const vulns: import('../../types/analysis').DependencyVuln[] = [];

    for (let i = 0; i < capped.length; i++) {
      const result = data.results[i];
      if (!result?.vulns?.length) continue;

      const osvVulns = result.vulns as any[];
      const severities = osvVulns
        .map((v: any) => (v.database_specific?.severity || 'UNKNOWN') as string)
        .map(sev => sev.toUpperCase());

      const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
      const highestSeverity = (severityOrder.find(s => severities.includes(s)) || 'NONE') as
        'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

      const topCVEs = osvVulns
        .slice(0, 3)
        .map((v: any) => v.id || '')
        .filter(Boolean);

      vulns.push({
        dependencyName: capped[i].name,
        dependencyVersion: capped[i].version,
        vulnerabilityCount: osvVulns.length,
        highestSeverity,
        topCVEs
      });
    }

    return vulns;
  } catch {
    return [];
  }
}

export function parseDependenciesFromManifest(sourceCode: string, ecosystem: string): DepScanInput[] {
  const deps: DepScanInput[] = [];

  if (ecosystem === 'npm' || ecosystem === 'github') {
    // Try to parse package.json dependencies from source
    const pkgJsonMatch = sourceCode.match(/--- FILE: package\.json.*?---\n([\s\S]*?)(?=\n--- FILE:|$)/);
    if (pkgJsonMatch) {
      try {
        const parsed = JSON.parse(pkgJsonMatch[1].trim());
        const allDeps = { ...parsed.dependencies, ...parsed.devDependencies };
        for (const [name, ver] of Object.entries(allDeps)) {
          const cleanVer = String(ver).replace(/^[\^~>=<]/, '').split(' ')[0];
          deps.push({ name, version: cleanVer || '*', ecosystem: 'npm' });
        }
      } catch { /* ignore parse errors */ }
    }
    // Also try the scripts section block
    const scriptsMatch = sourceCode.match(/--- FILE: package\.json \(scripts section\) ---\n([\s\S]*?)(?=\n--- FILE:|$)/);
    if (scriptsMatch && deps.length === 0) {
      try {
        const parsed = JSON.parse(scriptsMatch[1].trim());
        const allDeps = { ...parsed.dependencies, ...parsed.devDependencies };
        for (const [name, ver] of Object.entries(allDeps)) {
          const cleanVer = String(ver).replace(/^[\^~>=<]/, '').split(' ')[0];
          deps.push({ name, version: cleanVer || '*', ecosystem: 'npm' });
        }
      } catch { /* ignore parse errors */ }
    }
  } else if (ecosystem === 'pypi') {
    // Parse requirements.txt style
    const reqMatch = sourceCode.match(/--- FILE: requirements\.txt ---\n([\s\S]*?)(?=\n--- FILE:|$)/);
    if (reqMatch) {
      const lines = reqMatch[1].split('\n').filter(l => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const m = line.match(/^([A-Za-z0-9_\-\.]+)(?:[>=<!]+(.+))?/);
        if (m) {
          deps.push({ name: m[1].trim(), version: m[2]?.trim() || '*', ecosystem: 'pypi' });
        }
      }
    }
  } else if (ecosystem === 'go') {
    // Parse go.mod
    const goMatch = sourceCode.match(/--- FILE: go\.mod ---\n([\s\S]*?)(?=\n--- FILE:|$)/);
    if (goMatch) {
      const requireBlock = goMatch[1].match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        const lines = requireBlock[1].split('\n').filter(l => l.trim() && !l.startsWith('//'));
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            deps.push({ name: parts[0], version: parts[1] || '*', ecosystem: 'go' });
          }
        }
      }
    }
  }

  return deps;
}
