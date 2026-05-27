import type { ManifestParser, ParsedDependency } from './types';

export const packageLockJsonParser: ManifestParser = {
  canParse: (filename) => filename === 'package-lock.json' || filename === 'npm-shrinkwrap.json',
  parse: (content) => {
    const deps: ParsedDependency[] = [];
    try {
      const lock = JSON.parse(content);
      const version = lock.lockfileVersion ?? 1;

      if (version >= 2 && lock.packages && typeof lock.packages === 'object') {
        // v2/v3: root entry is packages[""]
        const root = lock.packages[''] as Record<string, any> | undefined;
        if (!root) return deps;

        const addDirect = (obj: Record<string, string> | undefined, isDev: boolean) => {
          if (!obj) return;
          for (const [name, versionRange] of Object.entries(obj)) {
            // Look up resolved version from packages map
            const pkgEntry = lock.packages[`node_modules/${name}`] as Record<string, any> | undefined;
            const resolvedVersion = pkgEntry?.version ?? String(versionRange).replace(/^[\^~>=<]/, '');
            deps.push({
              name,
              version: resolvedVersion,
              ecosystem: 'npm',
              isDev,
              depth: 0,
            });
          }
        };

        addDirect(root.dependencies, false);
        addDirect(root.devDependencies, true);
        addDirect(root.peerDependencies, false);
        addDirect(root.optionalDependencies, false);

      } else if (lock.dependencies && typeof lock.dependencies === 'object') {
        // v1: flat list — all packages at top level, nested ones inside each package's `dependencies`
        const seen = new Set<string>();

        const visit = (obj: Record<string, any>, depth: number) => {
          for (const [name, pkg] of Object.entries(obj)) {
            if (typeof pkg !== 'object' || pkg === null) continue;
            const key = `${name}@${pkg.version ?? ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deps.push({
              name,
              version: pkg.version ?? '*',
              ecosystem: 'npm',
              isDev: pkg.dev === true,
              isOptional: pkg.optional === true,
              depth,
            });
            // Recurse into nested deps (hoisted packages can be nested)
            if (pkg.dependencies && typeof pkg.dependencies === 'object') {
              visit(pkg.dependencies, depth + 1);
            }
          }
        };

        visit(lock.dependencies, 0);
      }
    } catch {
      // Malformed JSON — return empty
    }
    return deps;
  },
};
