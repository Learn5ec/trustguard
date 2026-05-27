/**
 * Parser for Gemfile.lock (Ruby bundler lock file).
 * Ecosystem: ruby
 */
import type { ManifestParser, ParsedDependency } from './types';

export const gemfileLockParser: ManifestParser = {
  ecosystem: 'ruby',
  canParse: (filename: string) => {
    const lower = filename.toLowerCase();
    return lower === 'gemfile.lock' || lower === 'gemfile' || lower.endsWith('.gemspec');
  },
  parse: (content: string, filename?: string): ParsedDependency[] => {
    const deps: ParsedDependency[] = [];
    const seen = new Set<string>();

    if ((filename || '').toLowerCase() === 'gemfile.lock') {
      // Parse Gemfile.lock: look for the GEM > specs: section
      const lines = content.split('\n');
      let inSpecs = false;

      for (const line of lines) {
        if (line.trim() === 'GEM') { inSpecs = false; continue; }
        if (line.trim() === 'specs:') { inSpecs = true; continue; }
        if (inSpecs && /^    [A-Z]/.test(line)) { inSpecs = false; continue; } // new section

        if (inSpecs) {
          // Format: "    gemname (1.2.3)"
          const match = line.match(/^\s{4}([a-zA-Z0-9_-]+)\s+\(([^)]+)\)/);
          if (match) {
            const name = match[1];
            const version = match[2];
            const key = `ruby:${name}`;
            if (!seen.has(key)) {
              seen.add(key);
              deps.push({ name, version, ecosystem: 'ruby', isDev: false, depth: 0 });
            }
          }
        }
      }
    } else {
      // Parse Gemfile: look for gem '...' lines
      const gemRegex = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/gm;
      let match;
      while ((match = gemRegex.exec(content)) !== null) {
        const name = match[1];
        const version = match[2] || 'latest';
        const key = `ruby:${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          deps.push({ name, version, ecosystem: 'ruby', isDev: false, depth: 0 });
        }
      }
    }

    return deps;
  },
};
