/**
 * Source Resolver — 3-Layer Package Source Resolution with Confidence Scoring
 *
 * Layer 1: Google deps.dev API (free, no auth, covers npm/PyPI/Cargo/Go/Maven/NuGet/RubyGems)
 * Layer 2: Existing registryLookup.ts as fallback
 * Layer 3: Cross-validation via raw.githubusercontent.com manifest name check
 *
 * Returns a SourceResolverResult with a confidence level indicating how reliably
 * the GitHub URL and registry URL were resolved.
 */

import type { Ecosystem } from '../../types/analysis';
import { lookupRegistry } from './registryLookup';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResolverConfidence = 'VERIFIED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';

export interface SourceResolverResult {
  githubUrl: string | null;
  registryUrl?: string;
  resolvedVia: 'deps_dev' | 'registry_lookup' | 'user_input';
  confidence: ResolverConfidence;
  confirmedVersion?: string;
  latestVersion?: string;
  isDeprecated?: boolean;
  deprecationMessage?: string;
  description?: string;
  crossValidated?: boolean;
  crossValidationNote?: string;
  /** Normalised SPDX license ID from registry (e.g. PyPI info.license) */
  licenseId?: string;
  /** When the requested version was first published on the registry */
  latestVersionPublishedAt?: Date;
}

// ── deps.dev ecosystem mapping ────────────────────────────────────────────────
// Maps our internal ecosystem IDs to the deps.dev "system" identifiers
const DEPS_DEV_SYSTEM: Partial<Record<Ecosystem, string>> = {
  npm:       'NPM',
  pypi:      'PYPI',
  uv:        'PYPI',
  pip:       'PYPI',
  pipx:      'PYPI',
  rust:      'CARGO',
  go:        'GO',
  maven:     'MAVEN',
  nuget:     'NUGET',
  ruby:      'RUBYGEMS',
};

// ── Manifest files to check per ecosystem for cross-validation ────────────────
const MANIFEST_FILES: Partial<Record<Ecosystem, string[]>> = {
  npm:       ['package.json'],
  pypi:      ['pyproject.toml', 'setup.cfg', 'setup.py'],
  uv:        ['pyproject.toml', 'setup.cfg'],
  pip:       ['pyproject.toml', 'setup.cfg', 'setup.py'],
  pipx:      ['pyproject.toml', 'setup.cfg', 'setup.py'],
  rust:      ['Cargo.toml'],
  ruby:      ['*.gemspec'],
  nuget:     ['*.csproj', '*.nuspec'],
  go:        ['go.mod'],
};

// ── Name normalization ────────────────────────────────────────────────────────

/**
 * Normalize a package name for comparison:
 * - strips scope (@scope/) for npm
 * - lowercases
 * - unifies `-`, `_`, `.` as equivalent
 */
export function normalizePackageName(name: string): string {
  // Strip npm scope prefix
  const stripped = name.replace(/^@[^/]+\//, '');
  return stripped.toLowerCase().replace(/[-_.]/g, '-');
}

// ── Layer 1: Google deps.dev ──────────────────────────────────────────────────

interface DepsDotDevResult {
  githubUrl: string | null;
  latestVersion?: string;
  description?: string;
  isDeprecated?: boolean;
  deprecationMessage?: string;
}

async function queryDepsDev(packageName: string, ecosystem: Ecosystem): Promise<DepsDotDevResult | null> {
  const system = DEPS_DEV_SYSTEM[ecosystem];
  if (!system) return null;

  const encodedName = encodeURIComponent(packageName);
  const url = `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodedName}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();

    // Extract GitHub URL from links (can be array or object)
    let githubUrl: string | null = null;
    const links: Array<{ url: string; label?: string }> = [];

    if (Array.isArray(data.links)) {
      links.push(...data.links);
    } else if (data.links && typeof data.links === 'object') {
      // Some versions return an object with named keys
      for (const val of Object.values(data.links)) {
        if (typeof val === 'string') links.push({ url: val });
        else if (val && typeof (val as any).url === 'string') links.push(val as { url: string });
      }
    }

    // Also check versions[0].links if package-level links are absent
    if (links.length === 0 && Array.isArray(data.versions) && data.versions.length > 0) {
      const latestVer = data.versions[data.versions.length - 1];
      if (Array.isArray(latestVer?.links)) links.push(...latestVer.links);
    }

    for (const link of links) {
      const u = link.url || '';
      if (u.includes('github.com') && !u.includes('github.com/marketplace') && !u.includes('github.com/apps')) {
        // Clean the URL to canonical repo form
        const m = u.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/.*)?$/);
        if (m) {
          githubUrl = `https://github.com/${m[1]}`;
          break;
        }
      }
    }

    // Extract latest version from versions array (last entry tends to be latest)
    let latestVersion: string | undefined;
    let isDeprecated = false;
    let deprecationMessage: string | undefined;

    if (Array.isArray(data.versions) && data.versions.length > 0) {
      // Find the latest non-prerelease, or just the last one
      const stable = data.versions.filter((v: any) => !v.isDefault === false || v.isDefault);
      const last = stable[stable.length - 1] || data.versions[data.versions.length - 1];
      latestVersion = last?.versionKey?.version;
      isDeprecated = last?.isDeprecated || data.isDeprecated || false;
      deprecationMessage = last?.deprecatedMessage || data.deprecatedMessage;
    }

    const description = data.description || undefined;

    return { githubUrl, latestVersion, description, isDeprecated, deprecationMessage };
  } catch {
    return null;
  }
}

// ── Layer 3: Cross-validation ─────────────────────────────────────────────────

/**
 * Fetch a manifest file from the repo's HEAD and extract the declared package name.
 * Returns the extracted name or null if it cannot be determined.
 */
async function extractManifestName(rawUrl: string, ecosystem: Ecosystem): Promise<string | null> {
  try {
    const res = await fetch(rawUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const text = await res.text();

    switch (ecosystem) {
      case 'npm': {
        // package.json: "name": "foo"
        const m = text.match(/"name"\s*:\s*"([^"]+)"/);
        return m ? m[1] : null;
      }
      case 'pypi':
      case 'uv':
      case 'pip':
      case 'pipx': {
        // pyproject.toml: name = "foo" or name = 'foo'
        const toml = text.match(/^name\s*=\s*["']([^"']+)["']/m);
        if (toml) return toml[1];
        // setup.cfg: name = foo
        const cfg = text.match(/^name\s*=\s*(.+)$/m);
        if (cfg) return cfg[1].trim();
        return null;
      }
      case 'rust': {
        // Cargo.toml: name = "foo"
        const m = text.match(/^name\s*=\s*"([^"]+)"/m);
        return m ? m[1] : null;
      }
      case 'go': {
        // go.mod: module github.com/owner/repo
        const m = text.match(/^module\s+(\S+)/m);
        return m ? m[1] : null;
      }
      case 'ruby': {
        // .gemspec: spec.name = "foo" or s.name = "foo"
        const m = text.match(/\.\s*name\s*=\s*["']([^"']+)["']/);
        return m ? m[1] : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Cross-validate that a GitHub URL actually hosts the package we think it does.
 * Fetches the primary manifest from HEAD and compares the declared name.
 */
async function crossValidate(
  githubUrl: string,
  packageName: string,
  ecosystem: Ecosystem
): Promise<{ matched: boolean; note: string }> {
  const manifestFiles = MANIFEST_FILES[ecosystem];
  if (!manifestFiles || manifestFiles.length === 0) {
    return { matched: false, note: 'No manifest file defined for this ecosystem' };
  }

  // Extract owner/repo from GitHub URL
  const repoMatch = githubUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git|\/.*)?$/);
  if (!repoMatch) return { matched: false, note: 'Could not parse GitHub URL' };

  const [, owner, repo] = repoMatch;

  // Try manifest files in order (skip glob patterns like *.gemspec)
  for (const manifest of manifestFiles) {
    if (manifest.includes('*')) continue; // skip glob patterns for now
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${manifest}`;
    const declaredName = await extractManifestName(rawUrl, ecosystem);

    if (declaredName !== null) {
      const normalizedDeclared = normalizePackageName(declaredName);
      const normalizedExpected = normalizePackageName(packageName);

      if (normalizedDeclared === normalizedExpected) {
        return { matched: true, note: `Manifest ${manifest} declares name "${declaredName}"` };
      } else {
        return {
          matched: false,
          note: `Manifest ${manifest} declares "${declaredName}", expected "${packageName}"`,
        };
      }
    }
  }

  return { matched: false, note: 'Could not read manifest from repository HEAD' };
}

// ── Main Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve the canonical GitHub URL and registry URL for a package using a
 * 3-layer strategy with confidence scoring.
 *
 * @param packageName - Package name (without version)
 * @param version     - Optional version string (for registry lookup)
 * @param ecosystem   - Ecosystem identifier
 */
export async function resolvePackageSource(
  packageName: string,
  version: string | undefined,
  ecosystem: Ecosystem
): Promise<SourceResolverResult> {
  // Direct GitHub URL — no resolution needed
  if (packageName.startsWith('https://github.com/') || ecosystem === 'github') {
    return {
      githubUrl: packageName,
      resolvedVia: 'user_input',
      confidence: 'HIGH',
    };
  }

  // Run Layer 1 (deps.dev) and Layer 2 (registry lookup) in parallel
  const [depsDev, registry] = await Promise.allSettled([
    queryDepsDev(packageName, ecosystem),
    lookupRegistry(packageName, version === 'latest' ? undefined : version, ecosystem).catch(() => null),
  ]);

  const depsDevResult = depsDev.status === 'fulfilled' ? depsDev.value : null;
  const registryResult = registry.status === 'fulfilled' ? registry.value : null;

  // Pick the best GitHub URL (deps.dev preferred, registry as fallback)
  let githubUrl: string | null = depsDevResult?.githubUrl || registryResult?.githubUrl || null;
  const registryUrl: string | undefined = registryResult?.resolvedRegistryUrl;
  const resolvedVia: SourceResolverResult['resolvedVia'] = depsDevResult?.githubUrl
    ? 'deps_dev'
    : registryResult?.githubUrl
    ? 'registry_lookup'
    : 'user_input';

  const latestVersion = depsDevResult?.latestVersion || registryResult?.latestVersion;
  const isDeprecated = depsDevResult?.isDeprecated || registryResult?.isDeprecated || false;
  const deprecationMessage = depsDevResult?.deprecationMessage || registryResult?.deprecationMessage;
  const description = depsDevResult?.description || registryResult?.description;
  const licenseId = registryResult?.licenseId;
  const latestVersionPublishedAt = registryResult?.latestVersionPublishedAt;

  // ── Cross-validate if we have a GitHub URL ────────────────────────────────
  let crossValidated = false;
  let crossValidationNote: string | undefined;
  let confidence: ResolverConfidence;

  if (githubUrl) {
    const validation = await crossValidate(githubUrl, packageName, ecosystem);
    crossValidated = validation.matched;
    crossValidationNote = validation.note;

    if (depsDevResult?.githubUrl && crossValidated) {
      // Best case: deps.dev found it AND manifest confirms it
      confidence = 'VERIFIED';
    } else if (depsDevResult?.githubUrl && !crossValidated && crossValidationNote?.includes('Could not read')) {
      // deps.dev found it but manifest was unreachable (monorepo, etc.) — still HIGH
      confidence = 'HIGH';
    } else if (depsDevResult?.githubUrl && !crossValidated) {
      // deps.dev found it but manifest name didn't match — suspicious
      confidence = 'LOW';
      // Keep the URL but flag it
    } else if (registryResult?.githubUrl && crossValidated) {
      // Registry only, but manifest confirms
      confidence = 'HIGH';
    } else if (registryResult?.githubUrl && !crossValidated && crossValidationNote?.includes('Could not read')) {
      // Registry found it, manifest unreachable
      confidence = 'MEDIUM';
    } else if (registryResult?.githubUrl && !crossValidated) {
      // Registry found it but manifest didn't match
      confidence = 'LOW';
    } else {
      confidence = 'MEDIUM';
    }
  } else {
    confidence = 'UNRESOLVED';
    crossValidationNote = 'No GitHub URL found from any source';
  }

  return {
    githubUrl,
    registryUrl,
    resolvedVia,
    confidence,
    confirmedVersion: version && version !== 'latest' ? version : undefined,
    latestVersion,
    isDeprecated,
    deprecationMessage,
    description,
    crossValidated,
    crossValidationNote,
    licenseId,
    latestVersionPublishedAt,
  };
}
