import { detectEcosystem } from './ecosystem';
import type { Ecosystem } from '../types/analysis';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  type?: Ecosystem | 'github';
  value?: string;
  version?: string;
  /** Sub-directory or file path within a GitHub repo (from /tree/branch/path URLs) */
  subPath?: string;
  /** Branch or ref extracted from a GitHub /tree/ or /blob/ URL */
  gitBranch?: string;
}

/**
 * Parses any GitHub URL form:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch
 *   https://github.com/owner/repo/tree/branch/path/to/subdir
 *   https://github.com/owner/repo/blob/branch/path/to/file.ts
 *
 * Captures: owner, repo, (optional) tree|blob, (optional) branch, (optional) subPath
 */
const GITHUB_PARSE_REGEX =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(tree|blob)\/([^/?#\s]+)(?:\/([^?#\s]+?))?)?(?:\/)?$/i;

const MAX_INPUT_LENGTH = 500;

const ECOSYSTEM_PREFIXES: Record<string, Ecosystem> = {
  'npm:': 'npm',
  'pypi:': 'pypi',
  'go:': 'go',
  'maven:': 'maven',
  'nuget:': 'nuget',
  'rust:': 'rust',
  'ruby:': 'ruby',
  'pub:': 'pub',
  'dart:': 'pub',
};

export function validatePackageInput(input: string): ValidationResult {
  if (!input || input.trim().length === 0) return { valid: false, error: 'Input required' };
  if (input.length > MAX_INPUT_LENGTH) return { valid: false, error: 'Input too long' };

  let trimmed = input.trim();

  // Handle GitHub URLs first
  if (trimmed.startsWith('https://github.com/')) {
    const m = GITHUB_PARSE_REGEX.exec(trimmed);
    if (!m) {
      return {
        valid: false,
        error: 'Invalid GitHub URL. Accepted formats:\n  • https://github.com/owner/repo\n  • https://github.com/owner/repo/tree/branch/path',
      };
    }
    const [, owner, repo, , branch, subPath] = m;
    return {
      valid: true,
      type: 'github',
      value: `https://github.com/${owner}/${repo}`,   // always base repo URL
      subPath:   subPath  || undefined,
      gitBranch: branch   || undefined,
    };
  }

  // Sanitise: strip any HTML/script injection attempts
  if (/<|>|script|javascript:/i.test(trimmed)) {
    return { valid: false, error: 'Invalid characters in input' };
  }

  // Detect and strip ecosystem prefix
  let detectedEcosystem: Ecosystem | undefined;
  for (const [prefix, eco] of Object.entries(ECOSYSTEM_PREFIXES)) {
    if (trimmed.toLowerCase().startsWith(prefix)) {
      trimmed = trimmed.slice(prefix.length);
      detectedEcosystem = eco;
      break;
    }
  }

  // ── Parse version from various notation formats ──────────────────────────────
  // Priority order: TOML inline table → TOML simple → pip specifiers → space-sep → @-sep
  let packageName = trimmed;
  let version: string | undefined;

  // 1. TOML inline table: `name = { version = "^1.2.3", ... }`
  const tomlInlineMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*\{\s*version\s*=\s*"([^"]+)"/);
  if (tomlInlineMatch) {
    packageName = tomlInlineMatch[1].trim();
    const rawVer = tomlInlineMatch[2].trim().replace(/^[\^~>=<!]+/, '').trim();
    version = (rawVer && rawVer !== '*') ? rawVer : undefined;

  // 2. TOML simple: `name = "^1.2.3"` or `name = "*"`
  } else if (/^[A-Za-z0-9_.-]+\s*=\s*"/.test(trimmed)) {
    const tomlSimpleMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"/);
    if (tomlSimpleMatch) {
      packageName = tomlSimpleMatch[1].trim();
      const rawVer = tomlSimpleMatch[2].trim().replace(/^[\^~>=<!]+/, '').trim();
      version = (rawVer && rawVer !== '*') ? rawVer : undefined;
    }

  // 3. pip/semver specifiers: `name>=1.2.3`, `name==1.2.3`, `name~=1.2.3`, etc.
  } else if (/^[A-Za-z0-9_.-]+\s*(?:>=|<=|==|!=|~=|>|<)/.test(trimmed)) {
    const pipMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*(?:>=|<=|==|!=|~=|>|<)\s*([\d][^\s,;]*)/);
    if (pipMatch) {
      packageName = pipMatch[1].trim();
      // Take only the first constraint (before any comma/semicolon)
      version = pipMatch[2].split(/[,;]/)[0].trim();
    }

  // 4. Space-separated: `name 1.2.3`
  } else if (/^[A-Za-z0-9_.-]+\s+[\d]/.test(trimmed) && !trimmed.startsWith('@')) {
    const spaceMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s+([\d][^\s]*)/);
    if (spaceMatch) {
      packageName = spaceMatch[1].trim();
      version = spaceMatch[2].trim();
    }

  // 5. Scoped npm package: @scope/name@version
  } else if (trimmed.startsWith('@')) {
    const withoutAt = trimmed.slice(1); // 'scope/name@version' or 'scope/name'
    const lastAt = withoutAt.lastIndexOf('@');
    if (lastAt !== -1 && withoutAt.slice(lastAt + 1).length > 0) {
      packageName = '@' + withoutAt.slice(0, lastAt);
      version = withoutAt.slice(lastAt + 1);
    }

  // 6. Regular @-sep: `name@version`
  } else {
    const atIdx = trimmed.indexOf('@');
    if (atIdx > 0) {
      packageName = trimmed.slice(0, atIdx);
      version = trimmed.slice(atIdx + 1);
    }
  }

  // Validate version format if present (basic semver check)
  if (version && !/^[\d.*+~^-]/.test(version)) {
    return { valid: false, error: `Invalid version format: "${version}"` };
  }

  const ecosystem = detectedEcosystem || detectEcosystem(packageName);

  return { valid: true, type: ecosystem, value: packageName, version };
}
