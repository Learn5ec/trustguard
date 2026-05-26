import yaml from 'js-yaml';
import type { ManifestParser, ParsedDependency } from './types';

/**
 * Parser for Flutter / Dart pubspec.yaml manifest files.
 * Ecosystem: 'pub'  (OSV: "Pub")
 *
 * Handles:
 *   - dependencies, dev_dependencies, dependency_overrides sections
 *   - Simple version constraints:  package: ^1.2.3 | >=1.0.0 <2.0.0 | any | null
 *   - Hosted overrides:            package: { version: ^1.0.0, hosted: … }
 * Skips:
 *   - SDK pseudo-packages:         flutter: { sdk: flutter }
 *   - Git / path references:       package: { git: … } | { path: … }
 */
function extractVersion(value: unknown): string | null {
  if (value === null || value === undefined) return 'any';
  if (typeof value === 'string') return value.trim() || 'any';
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // Skip SDK, git, path — these aren't pub.dev packages
    if ('sdk' in obj || 'git' in obj || 'path' in obj) return null;
    // Hosted package with explicit version key
    if (typeof obj.version === 'string') return obj.version.trim() || 'any';
  }
  return null;
}

function collectSection(
  section: Record<string, unknown> | undefined,
  isDev: boolean,
  isOverride: boolean,
  deps: ParsedDependency[]
) {
  if (!section || typeof section !== 'object') return;
  for (const [name, value] of Object.entries(section)) {
    const version = extractVersion(value);
    if (version === null) continue; // SDK / git / path — skip
    deps.push({
      name,
      version,
      ecosystem: 'pub',
      isDev,
      isOptional: isOverride,
      depth: 0
    });
  }
}

export const pubspecYamlParser: ManifestParser = {
  canParse: (filename) => filename === 'pubspec.yaml' || filename === 'pubspec.yml',

  parse: (content) => {
    const deps: ParsedDependency[] = [];
    try {
      const doc = yaml.load(content) as Record<string, unknown> | null;
      if (!doc || typeof doc !== 'object') return deps;

      collectSection(
        doc.dependencies as Record<string, unknown> | undefined,
        false,
        false,
        deps
      );
      collectSection(
        doc.dev_dependencies as Record<string, unknown> | undefined,
        true,
        false,
        deps
      );
      // dependency_overrides supersede both — expose them as optional so users
      // can choose whether to include them in batch analysis.
      collectSection(
        doc.dependency_overrides as Record<string, unknown> | undefined,
        false,
        true,
        deps
      );
    } catch {
      // Malformed YAML — return whatever was collected so far
    }
    return deps;
  }
};
