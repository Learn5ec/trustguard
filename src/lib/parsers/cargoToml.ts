/**
 * Parser for Cargo.toml (Rust package manifest) and Cargo.lock files.
 * Ecosystem: rust
 */
import type { ManifestParser, ParsedDependency } from './types';

function parseCargoToml(content: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];
  const seen = new Set<string>();

  const lines = content.split('\n');
  let inDepsSection = false;
  let isDev = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section header
    if (/^\[/.test(trimmed)) {
      inDepsSection = /\[(dev-|build-)?dependencies\]/.test(trimmed);
      isDev = trimmed.includes('dev-');
      continue;
    }

    if (!inDepsSection || !trimmed || trimmed.startsWith('#')) continue;

    // Simple format: name = "version"
    const simpleMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (simpleMatch) {
      const name = simpleMatch[1];
      const version = simpleMatch[2];
      const key = `rust:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        deps.push({ name, version, ecosystem: 'rust', isDev, depth: 0 });
      }
      continue;
    }

    // Table format: name = { version = "..." }
    const tableMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
    if (tableMatch) {
      const name = tableMatch[1];
      const version = tableMatch[2];
      const key = `rust:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        deps.push({ name, version, ecosystem: 'rust', isDev, depth: 0 });
      }
    }
  }

  return deps;
}

function parseCargoLock(content: string): ParsedDependency[] {
  const deps: ParsedDependency[] = [];
  const seen = new Set<string>();

  // Cargo.lock has [[package]] blocks
  const packageBlocks = content.split(/^\[\[package\]\]/m);

  for (const block of packageBlocks) {
    const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);

    if (nameMatch && versionMatch) {
      const name = nameMatch[1];
      const version = versionMatch[1];
      const key = `rust:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        deps.push({ name, version, ecosystem: 'rust', isDev: false, depth: 0 });
      }
    }
  }

  return deps;
}

export const cargoTomlParser: ManifestParser = {
  ecosystem: 'rust',
  canParse: (filename: string) => {
    const lower = filename.toLowerCase();
    return lower === 'cargo.toml' || lower === 'cargo.lock';
  },
  parse: (content: string, filename?: string) => {
    const lower = (filename || '').toLowerCase();
    if (lower === 'cargo.lock') return parseCargoLock(content);
    return parseCargoToml(content);
  },
};
