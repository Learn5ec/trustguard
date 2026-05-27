import { detectEcosystem } from './ecosystem';
import type { Ecosystem } from '../types/analysis';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  type?: Ecosystem | 'github';
  value?: string;
  version?: string;
}

const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;
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
    // Strip .git suffix before validation
    const cleaned = trimmed.replace(/\.git$/, '').replace(/\/$/, '');
    return GITHUB_URL_REGEX.test(cleaned)
      ? { valid: true, type: 'github', value: cleaned }
      : { valid: false, error: 'Invalid GitHub URL format. Expected: https://github.com/owner/repo' };
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
