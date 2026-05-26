import type { ManifestParser, ParsedDependency } from './types';

export const requirementsTxtParser: ManifestParser = {
  canParse: (filename) => filename.endsWith('requirements.txt'),
  parse: (content) => {
    const deps: ParsedDependency[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Extract basic name and version, ignoring environment markers
      const match = trimmed.match(/^([a-zA-Z0-9_\-.]+)(?:\[.*?\])?\s*([><=!~]+\s*[\d.]+(?:\.\*)?)?/);
      if (match) {
        deps.push({
          name: match[1],
          version: match[2] ? match[2].trim() : '*',
          ecosystem: 'pypi',
          isDev: false,
          depth: 0
        });
      }
    }

    return deps;
  }
};
