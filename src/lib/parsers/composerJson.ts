/**
 * Parser for composer.json and composer.lock (PHP Composer).
 * Ecosystem: packagist
 */
import type { ManifestParser, ParsedDependency } from './types';

export const composerJsonParser: ManifestParser = {
  ecosystem: 'packagist',
  canParse: (filename: string) => {
    const lower = filename.toLowerCase();
    return lower === 'composer.json' || lower === 'composer.lock';
  },
  parse: (content: string, filename?: string): ParsedDependency[] => {
    const deps: ParsedDependency[] = [];
    const seen = new Set<string>();

    try {
      const data = JSON.parse(content);

      if ((filename || '').toLowerCase() === 'composer.lock') {
        // composer.lock: packages array
        const packages = [...(data.packages || []), ...(data['packages-dev'] || [])];
        for (const pkg of packages) {
          if (pkg.name) {
            const key = `packagist:${pkg.name}`;
            if (!seen.has(key)) {
              seen.add(key);
              deps.push({
                name: pkg.name,
                version: (pkg.version || 'latest').replace(/^v/, ''),
                ecosystem: 'packagist',
                isDev: false,
                depth: 0,
              });
            }
          }
        }
      } else {
        // composer.json: require and require-dev sections
        const addDeps = (section: Record<string, string>, isDev: boolean) => {
          for (const [name, version] of Object.entries(section || {})) {
            if (name === 'php' || name.startsWith('ext-')) continue; // skip PHP itself
            const key = `packagist:${name}`;
            if (!seen.has(key)) {
              seen.add(key);
              deps.push({
                name,
                version: String(version) || 'latest',
                ecosystem: 'packagist',
                isDev,
                depth: 0,
              });
            }
          }
        };

        addDeps(data.require || {}, false);
        addDeps(data['require-dev'] || {}, true);
      }
    } catch {
      // Invalid JSON — return empty
    }

    return deps;
  },
};
