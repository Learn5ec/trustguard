/**
 * Parser for go.mod (Go modules manifest) and go.sum files.
 * Ecosystem: go
 */
import type { ManifestParser, ParsedDependency } from './types';

export const goModParser: ManifestParser = {
  ecosystem: 'go',
  canParse: (filename: string) => {
    const lower = filename.toLowerCase();
    return lower === 'go.mod' || lower === 'go.sum';
  },
  parse: (content: string, filename?: string): ParsedDependency[] => {
    const deps: ParsedDependency[] = [];
    const seen = new Set<string>();

    if ((filename || '').toLowerCase() === 'go.sum') {
      // go.sum: "module@version hash" lines — deduplicate by module@version
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^([^\s@]+)@([^\s/]+)/);
        if (match) {
          const name = match[1];
          const version = match[2].replace(/^v/, '');
          const key = `go:${name}@${version}`;
          if (!seen.has(key)) {
            seen.add(key);
            deps.push({ name, version, ecosystem: 'go', isDev: false, depth: 0 });
          }
        }
      }
    } else {
      // go.mod: parse require blocks
      const lines = content.split('\n');
      let inRequire = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === 'require (') { inRequire = true; continue; }
        if (inRequire && trimmed === ')') { inRequire = false; continue; }

        // Single-line require: require module version
        const singleMatch = trimmed.match(/^require\s+([^\s]+)\s+(v[^\s]+)/);
        if (singleMatch) {
          const name = singleMatch[1];
          const version = singleMatch[2].replace(/^v/, '');
          const key = `go:${name}`;
          if (!seen.has(key)) {
            seen.add(key);
            deps.push({ name, version, ecosystem: 'go', isDev: false, depth: 0 });
          }
          continue;
        }

        // Inside require block: "module version // indirect"
        if (inRequire && trimmed && !trimmed.startsWith('//')) {
          const match = trimmed.match(/^([^\s]+)\s+(v[^\s]+)/);
          if (match) {
            const name = match[1];
            const version = match[2].replace(/^v/, '');
            const isDev = trimmed.includes('// indirect');
            const key = `go:${name}`;
            if (!seen.has(key)) {
              seen.add(key);
              deps.push({ name, version, ecosystem: 'go', isDev, depth: 0 });
            }
          }
        }
      }
    }

    return deps;
  },
};
