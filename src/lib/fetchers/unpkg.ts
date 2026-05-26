const MAX_FILE_CHARS = 12000;
const MAX_TOTAL_CHARS = 25000;

export async function fetchPackageSourceCode(packageName: string, version: string = 'latest'): Promise<string | null> {
  try {
    const pkgJsonRes = await fetch(`https://unpkg.com/${encodeURIComponent(packageName)}@${version}/package.json`);
    if (!pkgJsonRes.ok) return null;
    const pkgJson = await pkgJsonRes.json();

    // Extract scripts block for postinstall risk analysis
    const scripts = pkgJson.scripts || {};
    const dangerousScriptKeys = ['postinstall', 'preinstall', 'install', 'prepare'];
    const foundDangerous = dangerousScriptKeys.filter((k: string) => scripts[k]);

    const candidates = [
      pkgJson.main,
      pkgJson.module,
      pkgJson.exports?.import,
      pkgJson.exports?.require,
      pkgJson.exports?.['.']?.import,
      pkgJson.exports?.['.']?.require,
      'index.js',
    ].filter(Boolean).map((f: string) => f.replace(/^\.\//, ''));

    const filesToFetch = [...new Set(candidates)].slice(0, 3);

    const results: string[] = [];
    let totalChars = 0;

    // Prepend the package.json scripts block if dangerous hooks found
    if (foundDangerous.length > 0) {
      const notice = `--- POSTINSTALL RISK NOTICE ---\npackage.json "scripts" block contains install-time hooks:\n${
        foundDangerous.map((k: string) => `  "${k}": "${scripts[k]}"`).join('\n')
      }\nThese scripts execute AUTOMATICALLY at npm install time.\n`;
      results.push(notice);
      totalChars += notice.length;
    }

    // Also include the full scripts block from package.json for analysis
    if (Object.keys(scripts).length > 0) {
      const scriptsNote = `--- FILE: package.json (scripts section) ---\n${JSON.stringify({ name: pkgJson.name, version: pkgJson.version, scripts, dependencies: pkgJson.dependencies, devDependencies: pkgJson.devDependencies }, null, 2)}`;
      results.push(scriptsNote);
      totalChars += scriptsNote.length;
    }

    for (const file of filesToFetch) {
      if (totalChars >= MAX_TOTAL_CHARS) break;
      try {
        const res = await fetch(`https://unpkg.com/${encodeURIComponent(packageName)}@${version}/${file}`);
        if (!res.ok) continue;
        let code = await res.text();
        if (code.length > MAX_FILE_CHARS) code = code.substring(0, MAX_FILE_CHARS) + '\n// ... [TRUNCATED]';
        results.push(`--- FILE: ${file} ---\n${code}`);
        totalChars += code.length;
      } catch { /* skip */ }
    }

    return results.length > 0 ? results.join('\n\n') : null;
  } catch (err) {
    console.error('Failed to fetch source code from unpkg', err);
    return null;
  }
}
