import TOML from '@iarna/toml';
import type { ManifestParser, ParsedDependency } from './types';

/**
 * Parser for Python pyproject.toml manifest files.
 * Ecosystem: 'pypi'
 *
 * Supports two common schemas:
 *
 * 1. PEP 517/518/621 (standard):
 *    [project]
 *    dependencies = ["requests>=2.28", "pandas"]
 *    [project.optional-dependencies]
 *    dev = ["pytest>=7", "black"]
 *
 * 2. Poetry:
 *    [tool.poetry.dependencies]
 *    requests = "^2.28.0"
 *    [tool.poetry.dev-dependencies]   (old style)
 *    [tool.poetry.group.dev.dependencies]  (new style)
 *    pytest = "^7.0"
 */

// ── PEP 508 string parser ───────────────────────────────────────────────────
// "requests>=2.28.0,<3.0", "pandas[excel]>=1.5; python_version>='3.8'"
// → { name: "requests", version: ">=2.28.0,<3.0" }
function parsePep508(spec: string): { name: string; version: string } | null {
  const trimmed = spec.split(';')[0].trim(); // drop environment markers
  const match = trimmed.match(/^([A-Za-z0-9_\-.]+)(?:\[.*?])?\s*(.*)/);
  if (!match) return null;
  const name = match[1].trim();
  const version = match[2].trim() || 'any';
  return { name, version };
}

// ── Poetry version value ────────────────────────────────────────────────────
// Value may be string "^1.0.0" or object { version: "^1.0.0", optional: true }
function poetryVersion(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || 'any';
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Path / git / url sources — not a PyPI package
    if ('path' in obj || 'git' in obj || 'url' in obj) return null;
    if (typeof obj.version === 'string') return obj.version.trim() || 'any';
  }
  return null;
}

function collectPoetrySection(
  section: Record<string, unknown> | undefined,
  isDev: boolean,
  deps: ParsedDependency[]
) {
  if (!section || typeof section !== 'object') return;
  for (const [name, value] of Object.entries(section)) {
    if (name.toLowerCase() === 'python') continue; // python itself is not a PyPI dep
    const version = poetryVersion(value);
    if (version === null) continue;
    deps.push({ name, version, ecosystem: 'pypi', isDev, depth: 0 });
  }
}

export const pyprojectTomlParser: ManifestParser = {
  canParse: (filename) => filename === 'pyproject.toml',

  parse: (content) => {
    const deps: ParsedDependency[] = [];
    let doc: Record<string, unknown>;

    try {
      doc = TOML.parse(content) as Record<string, unknown>;
    } catch {
      return deps;
    }

    // ── 1. PEP 621 standard [project] section ──────────────────────────────
    const project = doc.project as Record<string, unknown> | undefined;
    if (project) {
      // [project].dependencies — array of PEP 508 requirement strings
      const direct = project.dependencies;
      if (Array.isArray(direct)) {
        for (const spec of direct) {
          if (typeof spec !== 'string') continue;
          const parsed = parsePep508(spec);
          if (parsed) {
            deps.push({ ...parsed, ecosystem: 'pypi', isDev: false, depth: 0 });
          }
        }
      }

      // [project.optional-dependencies] — dict of group → PEP 508 string[]
      const optDeps = project['optional-dependencies'];
      if (optDeps && typeof optDeps === 'object' && !Array.isArray(optDeps)) {
        for (const [group, specs] of Object.entries(optDeps as Record<string, unknown>)) {
          if (!Array.isArray(specs)) continue;
          const isDev = /^(dev|test|lint|docs?|check|ci)$/i.test(group);
          for (const spec of specs) {
            if (typeof spec !== 'string') continue;
            const parsed = parsePep508(spec);
            if (parsed) {
              deps.push({ ...parsed, ecosystem: 'pypi', isDev, isOptional: true, depth: 0 });
            }
          }
        }
      }
    }

    // ── 2. Poetry [tool.poetry] section ─────────────────────────────────────
    const tool = doc.tool as Record<string, unknown> | undefined;
    const poetry = tool?.poetry as Record<string, unknown> | undefined;
    if (poetry) {
      collectPoetrySection(
        poetry.dependencies as Record<string, unknown> | undefined,
        false,
        deps
      );

      // Old-style [tool.poetry.dev-dependencies]
      collectPoetrySection(
        (poetry['dev-dependencies'] ?? poetry.dev_dependencies) as Record<string, unknown> | undefined,
        true,
        deps
      );

      // New-style [tool.poetry.group.<name>.dependencies]
      const groups = poetry.group as Record<string, unknown> | undefined;
      if (groups && typeof groups === 'object') {
        for (const [groupName, groupObj] of Object.entries(groups)) {
          const isDev = /^(dev|test|lint|docs?|check|ci)$/i.test(groupName);
          const groupDeps = (groupObj as Record<string, unknown>)?.dependencies as
            | Record<string, unknown>
            | undefined;
          collectPoetrySection(groupDeps, isDev, deps);
        }
      }
    }

    // Deduplicate: keep first occurrence per name (PEP 621 takes precedence over Poetry)
    const seen = new Set<string>();
    return deps.filter(d => {
      const key = d.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
};
