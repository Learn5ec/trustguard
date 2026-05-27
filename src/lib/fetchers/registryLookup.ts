/**
 * Official Package Registry Lookup
 *
 * Given a package name, version, and ecosystem, fetches from the OFFICIAL
 * registry API only (whitelist enforced) and extracts:
 *   - The canonical GitHub repository URL (if available)
 *   - Deprecation status
 *   - Latest version
 *
 * SECURITY: This module ONLY contacts the whitelisted registry APIs.
 * The extracted GitHub URL is returned as a string — it is NEVER fetched
 * by this module. It is later passed to fetchGitHubStats() which only
 * contacts api.github.com.
 */
import type { Ecosystem } from '../../types/analysis';

export interface RegistryLookupResult {
  githubUrl: string | null;
  resolvedVia: 'registry_lookup';
  resolvedRegistryUrl?: string;      // Exact URL contacted (or attempted) for this lookup
  confirmedVersion?: string;
  latestVersion?: string;
  isDeprecated?: boolean;
  deprecationMessage?: string;
  description?: string;
  /** Normalised SPDX license identifier extracted from the registry (may differ from GitHub) */
  licenseId?: string;
  /** When the requested version was first published on this registry */
  latestVersionPublishedAt?: Date;
}

// ── SPDX normalisation map ────────────────────────────────────────────────────
// PyPI's info.license field is free-text and commonly returns non-SPDX strings.
// Map the most common ones to their canonical SPDX identifiers.
const SPDX_NORMALIZE: Record<string, string> = {
  // MIT variants
  'MIT':                    'MIT',
  'MIT License':            'MIT',
  'MIT license':            'MIT',
  // Apache variants
  'Apache':                 'Apache-2.0',
  'Apache 2':               'Apache-2.0',
  'Apache 2.0':             'Apache-2.0',
  'Apache License 2.0':     'Apache-2.0',
  'Apache Software License':'Apache-2.0',
  'ASL 2':                  'Apache-2.0',
  'ASL2':                   'Apache-2.0',
  // BSD variants (default to BSD-3-Clause which is more common in Python ecosystem)
  'BSD':                    'BSD-3-Clause',
  'BSD License':            'BSD-3-Clause',
  'BSD license':            'BSD-3-Clause',
  'BSD-2':                  'BSD-2-Clause',
  'BSD-3':                  'BSD-3-Clause',
  'Simplified BSD':         'BSD-2-Clause',
  'New BSD':                'BSD-3-Clause',
  'Modified BSD':           'BSD-3-Clause',
  '2-Clause BSD':           'BSD-2-Clause',
  '3-Clause BSD':           'BSD-3-Clause',
  // ISC
  'ISC':                    'ISC',
  'ISC License':            'ISC',
  // GPL variants
  'GPL':                    'GPL-3.0',
  'GPL2':                   'GPL-2.0',
  'GPL3':                   'GPL-3.0',
  'GPLv2':                  'GPL-2.0',
  'GPLv3':                  'GPL-3.0',
  'GNU GPL':                'GPL-3.0',
  'GNU GPLv2':              'GPL-2.0',
  'GNU GPLv3':              'GPL-3.0',
  'GPL-2':                  'GPL-2.0',
  'GPL-3':                  'GPL-3.0',
  'GNU General Public License v2 (GPLv2)': 'GPL-2.0',
  'GNU General Public License v3 (GPLv3)': 'GPL-3.0',
  // LGPL variants
  'LGPL':                   'LGPL-2.1',
  'LGPLv2':                 'LGPL-2.1',
  'LGPLv3':                 'LGPL-3.0',
  'GNU LGPL':               'LGPL-2.1',
  'GNU Lesser General Public License v2 (LGPLv2)': 'LGPL-2.1',
  // AGPL variants
  'AGPL':                   'AGPL-3.0',
  'AGPLv3':                 'AGPL-3.0',
  'GNU AGPL':               'AGPL-3.0',
  // Mozilla
  'MPL':                    'MPL-2.0',
  'MPL 2.0':                'MPL-2.0',
  'Mozilla Public License 2.0 (MPL 2.0)': 'MPL-2.0',
  // Other common
  'PSF':                    'Python-2.0',
  'PSFL':                   'Python-2.0',
  'Python Software Foundation License': 'Python-2.0',
  'CC0':                    'CC0-1.0',
  'Unlicense':              'Unlicense',
  'Public Domain':          'Unlicense',
  'WTFPL':                  'WTFPL',
  'Proprietary':            'LicenseRef-Proprietary',
  'Commercial':             'LicenseRef-Proprietary',
  'All Rights Reserved':    'LicenseRef-Proprietary',
};

/**
 * Normalise a free-text license string from a registry to a canonical SPDX ID.
 * Returns the input unchanged if it already looks like a valid SPDX ID or is unknown.
 */
function normalizeSpdxId(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'UNKNOWN' || trimmed === 'unknown') return undefined;
  // Direct hit in normalisation map
  if (SPDX_NORMALIZE[trimmed]) return SPDX_NORMALIZE[trimmed];
  // Already looks like SPDX (contains dash+digit or is 2–3 uppercase chars)
  if (/^[A-Z][-A-Z0-9.+]+\d/.test(trimmed)) return trimmed;
  return trimmed; // pass through — better than dropping it
}

// ── Whitelist: ONLY these base URLs are contacted by this module ──────────────
const REGISTRY_BASES: Partial<Record<Ecosystem, string>> = {
  npm:       'https://registry.npmjs.org/',
  pypi:      'https://pypi.org/pypi/',
  uv:        'https://pypi.org/pypi/',   // uv packages are on PyPI
  pip:       'https://pypi.org/pypi/',   // pip packages are on PyPI
  pipx:      'https://pypi.org/pypi/',   // pipx packages are on PyPI
  rust:      'https://crates.io/api/v1/crates/',
  pub:       'https://pub.dev/api/packages/',
  ruby:      'https://rubygems.org/api/v1/gems/',
  nuget:     'https://api.nuget.org/v3/registration5/',
  hex:       'https://hex.pm/api/packages/',
  packagist: 'https://packagist.org/packages/',
  // go: No API call needed — GitHub URL derived from module path
  // maven: Uses search.maven.org (handled separately)
  // conda: No structured JSON API available
};

// Also whitelist Maven's repository
const MAVEN_SEARCH_BASE = 'https://search.maven.org/solrsearch/select';
const MAVEN_REPO_BASE   = 'https://repo1.maven.org/maven2/';

// ── URL canonicalization ─────────────────────────────────────────────────────

/**
 * Normalize a raw VCS URL to a canonical https://github.com/owner/repo form.
 * Returns null if it can't be confirmed as a GitHub URL.
 */
export function canonicalizeGithubUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let url = raw.trim();

  // Strip common prefixes/wrappers
  url = url.replace(/^git\+/, '');
  url = url.replace(/^git:\/\//, 'https://');
  url = url.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/');
  url = url.replace(/^git@github\.com:/, 'https://github.com/');
  url = url.replace(/\.git$/, '');
  url = url.replace(/\/$/, '');

  // Must match https://github.com/owner/repo
  const match = url.match(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (!match) return null;

  return `https://github.com/${match[1]}/${match[2]}`;
}

// ── Per-ecosystem lookup functions ────────────────────────────────────────────

async function lookupNpm(name: string, version?: string): Promise<RegistryLookupResult> {
  const url = `${REGISTRY_BASES.npm}${encodeURIComponent(name)}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`npm registry returned ${resp.status} for ${name}`);
  const data = await resp.json();

  // Version existence check
  if (version && version !== 'latest' && data.versions && !data.versions[version]) {
    throw new Error(`Version ${version} not found in npm registry for ${name}`);
  }

  const versionData = version && version !== 'latest' && data.versions
    ? data.versions[version]
    : data.versions?.[data['dist-tags']?.latest];

  const repoUrl = versionData?.repository?.url
    || data.repository?.url
    || null;

  const isDeprecated = !!(versionData?.deprecated || data.deprecated);
  const deprecationMessage = versionData?.deprecated || data.deprecated || undefined;

  return {
    githubUrl: canonicalizeGithubUrl(repoUrl),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    confirmedVersion: version !== 'latest' ? version : data['dist-tags']?.latest,
    latestVersion: data['dist-tags']?.latest,
    isDeprecated,
    deprecationMessage: typeof deprecationMessage === 'string' ? deprecationMessage : undefined,
    description: data.description,
  };
}

async function lookupPypi(name: string, version?: string): Promise<RegistryLookupResult> {
  const endpoint = version && version !== 'latest'
    ? `${REGISTRY_BASES.pypi}${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
    : `${REGISTRY_BASES.pypi}${encodeURIComponent(name)}/json`;

  const resp = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    if (resp.status === 404 && version) {
      throw new Error(`Version ${version} not found in PyPI for ${name} (checked: ${endpoint})`);
    }
    throw new Error(`PyPI returned ${resp.status} for ${name} (checked: ${endpoint})`);
  }
  const data = await resp.json();
  const info = data.info || {};

  // Extract GitHub URL from various fields
  const candidates: (string | null | undefined)[] = [
    info.project_urls?.['Source Code'],
    info.project_urls?.['Source'],
    info.project_urls?.['Repository'],
    info.project_urls?.['Homepage'],
    info.home_page,
  ];

  let githubUrl: string | null = null;
  for (const c of candidates) {
    githubUrl = canonicalizeGithubUrl(c);
    if (githubUrl) break;
  }

  // Check for inactive/deprecated classifiers
  const classifiers: string[] = info.classifiers || [];
  const isDeprecated = classifiers.some(c =>
    c.includes('Development Status :: 7 - Inactive') ||
    (c.includes('Development Status :: 1 - Planning') && classifiers.some(d => d.includes('Inactive')))
  );

  // Extract license SPDX id with normalisation
  const rawLicense: string | undefined = info.license || undefined;
  const licenseId = normalizeSpdxId(rawLicense);

  // Extract publish date for the requested version
  let latestVersionPublishedAt: Date | undefined;
  const requestedVer = version !== 'latest' ? version : info.version;
  if (requestedVer && data.releases?.[requestedVer]?.[0]?.upload_time) {
    try {
      // PyPI returns "2024-03-15T12:00:00" without a timezone — it is UTC
      latestVersionPublishedAt = new Date(data.releases[requestedVer][0].upload_time + 'Z');
    } catch { /* ignore */ }
  }

  return {
    githubUrl,
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: endpoint,
    confirmedVersion: requestedVer,
    latestVersion: info.version,
    isDeprecated,
    description: info.summary,
    licenseId,
    latestVersionPublishedAt,
  };
}

async function lookupCratesIo(name: string, version?: string): Promise<RegistryLookupResult> {
  const url = `${REGISTRY_BASES.rust}${encodeURIComponent(name)}`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TrustGuard/1.0' }
  });
  if (!resp.ok) throw new Error(`crates.io returned ${resp.status} for ${name}`);
  const data = await resp.json();

  // Version check
  if (version && version !== 'latest') {
    const versions: any[] = data.versions || [];
    const found = versions.find((v: any) => v.num === version || v.num === `v${version}`);
    if (!found) throw new Error(`Version ${version} not found in crates.io for ${name}`);
  }

  const repoUrl = data.crate?.repository || null;
  return {
    githubUrl: canonicalizeGithubUrl(repoUrl),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    confirmedVersion: version !== 'latest' ? version : data.crate?.newest_version,
    latestVersion: data.crate?.newest_version,
    description: data.crate?.description,
  };
}

async function lookupPubDev(name: string, _version?: string): Promise<RegistryLookupResult> {
  const url = `${REGISTRY_BASES.pub}${encodeURIComponent(name)}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`pub.dev returned ${resp.status} for ${name}`);
  const data = await resp.json();

  const latest = data.latest?.pubspec || {};
  const repoUrl = latest.repository || latest.homepage || null;

  return {
    githubUrl: canonicalizeGithubUrl(repoUrl),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    latestVersion: data.latest?.version,
    description: latest.description,
  };
}

async function lookupRubyGems(name: string): Promise<RegistryLookupResult> {
  const url = `${REGISTRY_BASES.ruby}${encodeURIComponent(name)}.json`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`RubyGems returned ${resp.status} for ${name}`);
  const data = await resp.json();

  const repoUrl = data.source_code_uri || data.homepage_uri || null;
  return {
    githubUrl: canonicalizeGithubUrl(repoUrl),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    latestVersion: data.version,
    description: data.info,
  };
}

async function lookupNuGet(name: string): Promise<RegistryLookupResult> {
  const url = `${REGISTRY_BASES.nuget}${encodeURIComponent(name.toLowerCase())}/index.json`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`NuGet returned ${resp.status} for ${name}`);
  const data = await resp.json();

  // Navigate: items[0].items[-1].catalogEntry.projectUrl
  let projectUrl: string | null = null;
  try {
    const item = data.items?.[data.items.length - 1];
    const entry = item?.items?.[item.items.length - 1]?.catalogEntry;
    projectUrl = entry?.projectUrl || null;
  } catch { /* ignore */ }

  return {
    githubUrl: canonicalizeGithubUrl(projectUrl),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    description: undefined,
  };
}

async function lookupHex(name: string): Promise<RegistryLookupResult> {
  const url = `${REGISTRY_BASES.hex}${encodeURIComponent(name)}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Hex.pm returned ${resp.status} for ${name}`);
  const data = await resp.json();

  const githubLink = data.meta?.links?.GitHub || data.meta?.links?.github || null;
  return {
    githubUrl: canonicalizeGithubUrl(githubLink),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    latestVersion: data.releases?.[0]?.version,
    description: data.meta?.description,
  };
}

async function lookupPackagist(name: string): Promise<RegistryLookupResult> {
  // name format: vendor/package
  const url = `${REGISTRY_BASES.packagist}${encodeURIComponent(name)}.json`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Packagist returned ${resp.status} for ${name}`);
  const data = await resp.json();

  // Get latest version data
  const versions: Record<string, any> = data.package?.versions || {};
  const latestKey = Object.keys(versions).find(v => !v.includes('dev') && !v.startsWith('9999'));
  const latest = latestKey ? versions[latestKey] : null;
  const repoUrl = latest?.source?.url || null;

  return {
    githubUrl: canonicalizeGithubUrl(repoUrl),
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: url,
    latestVersion: latestKey,
    description: latest?.description,
  };
}

function lookupGo(modulePath: string): RegistryLookupResult {
  // For Go modules, the module path IS the URL for github.com/* paths
  // No HTTP fetch needed for most cases
  const githubUrl = canonicalizeGithubUrl(
    modulePath.startsWith('github.com/')
      ? `https://${modulePath}`
      : null
  );

  return {
    githubUrl,
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: modulePath.startsWith('github.com/')
      ? `https://pkg.go.dev/${modulePath}`
      : undefined,
  };
}

async function lookupMaven(groupArtifact: string): Promise<RegistryLookupResult> {
  // Format: groupId:artifactId or groupId/artifactId
  const parts = groupArtifact.split(/[:/ ]/);
  if (parts.length < 2) throw new Error(`Maven artifact must be in groupId:artifactId format, got: ${groupArtifact}`);

  const [groupId, artifactId] = parts;
  const searchUrl = `${MAVEN_SEARCH_BASE}?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&rows=1&wt=json`;

  const resp = await fetch(searchUrl, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Maven Central search returned ${resp.status}`);
  const data = await resp.json();

  const doc = data.response?.docs?.[0];
  if (!doc) throw new Error(`Package ${groupArtifact} not found in Maven Central`);

  const latestVersion = doc.latestVersion || doc.v;

  // Try to fetch POM for SCM URL (only from whitelisted repo1.maven.org)
  let githubUrl: string | null = null;
  if (latestVersion) {
    try {
      const pomUrl = `${MAVEN_REPO_BASE}${groupId.replace(/\./g, '/')}/${artifactId}/${latestVersion}/${artifactId}-${latestVersion}.pom`;
      const pomResp = await fetch(pomUrl);
      if (pomResp.ok) {
        const pomText = await pomResp.text();
        const scmMatch = pomText.match(/<scm>[\s\S]*?<url>([^<]+)<\/url>[\s\S]*?<\/scm>/);
        if (scmMatch) githubUrl = canonicalizeGithubUrl(scmMatch[1]);
      }
    } catch { /* POM fetch is best-effort */ }
  }

  return {
    githubUrl,
    resolvedVia: 'registry_lookup',
    resolvedRegistryUrl: searchUrl,
    latestVersion,
    description: doc.latestVersion ? `${groupId}:${artifactId}` : undefined,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Look up a package in its official registry and extract the GitHub URL.
 *
 * @param packageName - Package name (exact format depends on ecosystem)
 * @param version - Optional version (pass 'latest' or undefined for latest)
 * @param ecosystem - The ecosystem to look up in
 * @returns RegistryLookupResult with githubUrl and metadata
 * @throws Error if the package or version is not found
 */
export async function lookupRegistry(
  packageName: string,
  version: string | undefined,
  ecosystem: Ecosystem
): Promise<RegistryLookupResult> {
  const ver = version === 'latest' ? undefined : version;

  switch (ecosystem) {
    case 'npm':                   return lookupNpm(packageName, ver);
    case 'pypi':
    case 'uv':
    case 'pip':
    case 'pipx':                  return lookupPypi(packageName, ver);
    case 'rust':                  return lookupCratesIo(packageName, ver);
    case 'pub':                   return lookupPubDev(packageName, ver);
    case 'ruby':                  return lookupRubyGems(packageName);
    case 'nuget':                 return lookupNuGet(packageName);
    case 'hex':                   return lookupHex(packageName);
    case 'packagist':             return lookupPackagist(packageName);
    case 'go':                    return lookupGo(packageName);
    case 'maven':                 return lookupMaven(packageName);
    case 'conda':
      // Conda doesn't have a clean JSON API — return null GitHub URL
      return { githubUrl: null, resolvedVia: 'registry_lookup', resolvedRegistryUrl: `https://anaconda.org/search?q=${encodeURIComponent(packageName)}` };
    default:
      return { githubUrl: null, resolvedVia: 'registry_lookup' };
  }
}
