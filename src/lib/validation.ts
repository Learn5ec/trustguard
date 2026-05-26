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

  // Parse @version suffix
  // For scoped packages like @types/node@18.0.0, only split on the LAST @
  let packageName = trimmed;
  let version: string | undefined;

  if (trimmed.startsWith('@')) {
    // Scoped package: @scope/name@version
    const withoutAt = trimmed.slice(1); // 'scope/name@version' or 'scope/name'
    const lastAt = withoutAt.lastIndexOf('@');
    if (lastAt !== -1 && withoutAt.slice(lastAt + 1).length > 0) {
      packageName = '@' + withoutAt.slice(0, lastAt);
      version = withoutAt.slice(lastAt + 1);
    }
  } else {
    // Regular package: name@version
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
