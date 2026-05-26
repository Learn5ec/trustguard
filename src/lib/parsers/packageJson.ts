import type { ManifestParser, ParsedDependency } from './types';

export const packageJsonParser: ManifestParser = {
  canParse: (filename) => filename === 'package.json',
  parse: (content) => {
    try {
      const json = JSON.parse(content);
      const deps: ParsedDependency[] = [];

      const addDeps = (obj: Record<string, string> | undefined, isDev: boolean, isPeer = false, isOptional = false) => {
        if (!obj) return;
        for (const [name, version] of Object.entries(obj)) {
          deps.push({
            name,
            version,
            ecosystem: 'npm',
            isDev,
            isPeer,
            isOptional,
            depth: 0
          });
        }
      };

      addDeps(json.dependencies, false);
      addDeps(json.devDependencies, true);
      addDeps(json.peerDependencies, false, true);
      addDeps(json.optionalDependencies, false, false, true);

      return deps;
    } catch {
      return [];
    }
  }
};
