import { useSettingsStore } from '../../store/settingsStore';
import type { SourceChunk, SourceChunkResult } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = ['.js', '.ts', '.py', '.go', '.rs', '.rb', '.java', '.cs', '.php', '.mjs', '.cjs', '.jsx', '.tsx', '.yml', '.yaml'];
/** Maximum characters per chunk when in multi-pass (monorepo) mode */
const MAX_CHUNK_CHARS  = 14000;
/** Maximum characters for the single-pass (simple repo) combined string */
const MAX_TOTAL_CHARS  = 32000;
/** Maximum characters read from any single file before truncation */
const MAX_FILE_CHARS   = 10000;
/** Maximum number of workspace directories to scan in a monorepo */
const MAX_WORKSPACE_DIRS = 4;
/** Maximum chunks total (root + workspaces) */
const MAX_CHUNKS = 5;

const SECURITY_SENSITIVE_NAMES = ['auth', 'crypto', 'token', 'secret', 'password', 'eval', 'exec', 'shell', 'spawn', 'request', 'http', 'fetch', 'network'];
const TELEMETRY_NAMES           = ['telemetry', 'analytics', 'track', 'beacon', 'collect', 'metrics', 'logging', 'reporter'];
const INSTALL_NAMES             = ['install', 'postinstall', 'setup', 'hook', 'preinstall', 'prepare'];

/** Root-level directories that are unlikely to contain security-relevant code */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.github', 'docs', 'doc', 'documentation',
  'test', 'tests', 'e2e', 'examples', 'example', 'assets', 'public', 'static', 'vendor',
  '__pycache__', '.venv', 'venv', 'coverage', '.nyc_output', 'charts', 'specs',
  'agentic-e2e-tests', 'bullboard', 'dev', 'benchmark', 'benchmarks',
]);

/** Repo-root files that signal a monorepo workspace layout */
const MONOREPO_INDICATORS = ['pnpm-workspace.yaml', 'lerna.json', 'rush.json', 'nx.json', 'turbo.json'];

// ── Lightweight GitHub file descriptor ───────────────────────────────────────

type GHFile = { name: string; path: string; download_url: string; type: string };

// ── Workflow scoring ──────────────────────────────────────────────────────────

/**
 * Score a CI/CD workflow filename by security relevance.
 * Higher score = more interesting for a security review.
 * This prevents picking the first file alphabetically (e.g. clickhouse-*.yml)
 * when a far more relevant publish/deploy workflow exists.
 */
function scoreWorkflowFile(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('publish') || n.includes('release'))          return 10;
  if (n.includes('security') || n.includes('codeql') || n.includes('scan')) return 9;
  if (n.includes('deploy') || n.includes('cd'))                return 8;
  if (n.includes('install') || n.includes('setup'))            return 7;
  if (n.includes('ci') || n.includes('build'))                 return 6;
  return 1; // infrastructure / helm charts / etc.
}

/** Pick the single most security-relevant workflow file from the listing */
function pickBestWorkflow(files: GHFile[]): GHFile | null {
  const ymls = files.filter(f => (f.name.endsWith('.yml') || f.name.endsWith('.yaml')) && f.download_url);
  if (ymls.length === 0) return null;
  return ymls.reduce((best, cur) =>
    scoreWorkflowFile(cur.name) > scoreWorkflowFile(best.name) ? cur : best
  );
}

// ── Workspace directory scoring ───────────────────────────────────────────────

/**
 * Score a root-level directory name by likelihood of containing
 * security-relevant source code.  Used to prioritise which workspace
 * directories to scan in a monorepo.
 */
function scoreWorkspaceDir(name: string): number {
  const n = name.toLowerCase();
  // Very likely to be code packages
  if (['sdk', 'server', 'app', 'lib', 'core', 'api', 'client', 'service', 'packages', 'pkg'].includes(n)) return 10;
  if (n.endsWith('-sdk') || n.endsWith('-server') || n.endsWith('-app') || n.endsWith('-client')) return 9;
  if (n.includes('sdk') || n.includes('service') || n.includes('server')) return 8;
  if (n.includes('app') || n.includes('client') || n.includes('web'))     return 7;
  if (n.includes('lib') || n.includes('core') || n.includes('api'))       return 6;
  // Infrastructure / documentation / testing — lower priority
  if (['infra', 'charts', 'deploy', 'docs', 'spec', 'specs',
       'test', 'tests', 'e2e', 'fixtures', 'migrations', 'scripts'].some(s => n.includes(s))) return 0;
  return 3; // unknown but potentially interesting
}

/** Return workspace directories sorted by relevance score (highest first) */
function getWorkspaceDirs(rootContents: GHFile[], workspaceGlobs: string[]): string[] {
  // Explicit workspace declarations (pnpm / lerna / yarn workspaces)
  const fromGlobs: string[] = [];
  for (const glob of workspaceGlobs) {
    // "packages/*" → "packages",  "./sdk" → "sdk"
    const base = glob.replace(/\/\*.*$/, '').replace(/^\.\//,'').trim();
    if (base && !base.includes('*') && !SKIP_DIRS.has(base)) fromGlobs.push(base);
  }

  // All non-skipped root directories
  const allDirs = rootContents
    .filter(f => f.type === 'dir' && !SKIP_DIRS.has(f.name) && !f.name.startsWith('.'))
    .map(f => f.name);

  const merged = [...new Set([...fromGlobs, ...allDirs])];
  return merged
    .filter(d => scoreWorkspaceDir(d) > 0)
    .sort((a, b) => scoreWorkspaceDir(b) - scoreWorkspaceDir(a))
    .slice(0, MAX_WORKSPACE_DIRS);
}

// ── Priority file selection ───────────────────────────────────────────────────

/**
 * From a flat directory listing, select up to ~7 files in priority order.
 * Files already captured in a previous chunk are skipped.
 */
function selectPriorityFiles(
  contents: GHFile[],
  alreadyIncluded: Set<string>,
  workflowOverride?: GHFile | null
): Array<GHFile & { priority: number }> {
  const selected: Array<GHFile & { priority: number }> = [];
  const addIfNew = (f: GHFile | undefined | null, priority: number) => {
    if (f?.download_url && !alreadyIncluded.has(f.path) && !selected.some(s => s.path === f.path)) {
      selected.push({ ...f, priority });
    }
  };

  // P1 — README
  addIfNew(contents.find(f => f.name.toLowerCase().startsWith('readme') && f.download_url), 1);

  // P2 — Dependency manifest (first match)
  addIfNew(
    contents.find(f => ['package.json','pyproject.toml','setup.py','go.mod','Cargo.toml','requirements.txt','pom.xml'].includes(f.name) && f.download_url),
    2
  );

  // P3 — Best CI/CD workflow (use override if provided, otherwise re-score)
  if (workflowOverride) {
    addIfNew(workflowOverride, 3);
  }

  // P4 — Telemetry / analytics files
  addIfNew(
    contents.find(f =>
      f.type === 'file' &&
      CODE_EXTENSIONS.some(e => f.name.endsWith(e)) &&
      TELEMETRY_NAMES.some(n => f.name.toLowerCase().includes(n))
    ),
    4
  );

  // P5 — Install / postinstall hooks
  addIfNew(
    contents.find(f =>
      f.type === 'file' &&
      CODE_EXTENSIONS.some(e => f.name.endsWith(e)) &&
      INSTALL_NAMES.some(n => f.name.toLowerCase().includes(n))
    ),
    5
  );

  // P6 — Security-sensitive files (auth, crypto, token, etc.)
  addIfNew(
    contents.find(f =>
      f.type === 'file' &&
      CODE_EXTENSIONS.some(e => f.name.endsWith(e)) &&
      SECURITY_SENSITIVE_NAMES.some(n => f.name.toLowerCase().includes(n)) &&
      !selected.some(s => s.path === f.path)
    ),
    6
  );

  // P7 — Common entry points
  for (const ep of ['index.js','index.ts','main.py','main.go','app.py','server.js','index.mjs']) {
    const f = contents.find(cf => cf.name === ep && cf.download_url);
    if (f && !alreadyIncluded.has(f.path) && !selected.some(s => s.path === f.path)) {
      selected.push({ ...f, priority: 7 });
      break;
    }
  }

  return selected.sort((a, b) => a.priority - b.priority);
}

// ── File content fetching ─────────────────────────────────────────────────────

/**
 * Fetch a set of files in parallel and concatenate them into a single string.
 * Respects per-file and total character limits.
 * Returns the combined string and the set of paths that were successfully included.
 */
async function fetchAndBuildContent(
  files: Array<GHFile & { priority: number }>,
  headers: HeadersInit,
  pkgJsonScripts: Record<string, string>,
  maxTotalChars: number
): Promise<{ content: string; includedPaths: Set<string> }> {
  const fetches = await Promise.allSettled(
    files.map(f => fetch(f.download_url, { headers }).then(r => r.text()))
  );

  let combined = '';
  const includedPaths = new Set<string>();
  let totalChars = 0;

  // Prepend postinstall risk notice when dangerous install hooks are present
  const dangerousKeys = ['postinstall', 'preinstall', 'install', 'prepare'];
  const foundDangerous = dangerousKeys.filter(k => pkgJsonScripts[k]);
  if (foundDangerous.length > 0) {
    combined += `--- POSTINSTALL RISK NOTICE ---\n`;
    combined += `package.json "scripts" contains install-time hooks that execute automatically at npm install:\n`;
    foundDangerous.forEach(k => { combined += `  "${k}": "${pkgJsonScripts[k]}"\n`; });
    combined += '\n';
  }

  for (let i = 0; i < files.length; i++) {
    if (fetches[i].status !== 'fulfilled') continue;
    let code = (fetches[i] as PromiseFulfilledResult<string>).value;
    if (code.length > MAX_FILE_CHARS) code = code.substring(0, MAX_FILE_CHARS) + '\n// ... [TRUNCATED]';
    combined += `\n\n--- FILE: ${files[i].path || files[i].name} ---\n${code}`;
    includedPaths.add(files[i].path);
    totalChars += code.length;
    if (totalChars >= maxTotalChars) {
      combined += '\n\n// ... [ADDITIONAL FILES OMITTED DUE TO SIZE LIMIT]';
      break;
    }
  }

  return { content: combined.trim(), includedPaths };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the best `ref` string for a given version, trying `v{version}` then `{version}`.
 * Returns the ref string to use, or undefined if no specific version (→ default branch).
 */
async function resolveVersionRef(
  owner: string,
  cleanRepo: string,
  version: string | undefined,
  headers: Record<string, string>
): Promise<string | undefined> {
  if (!version || version === 'latest') return undefined;

  // Try v{version} first (most common tag convention)
  const vRef = `v${version}`;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/git/ref/tags/${vRef}`,
      { headers }
    );
    if (r.ok) return vRef;
  } catch { /* ignore */ }

  // Try bare version as tag
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/git/ref/tags/${version}`,
      { headers }
    );
    if (r.ok) return version;
  } catch { /* ignore */ }

  // No matching tag found — fall back to default branch
  return undefined;
}

/**
 * Fetch source code from a GitHub repo and return it as labelled chunks.
 *
 * Simple (non-monorepo) repos → single chunk, same behaviour as before.
 * Monorepos → one chunk per workspace directory (root + up to MAX_WORKSPACE_DIRS),
 *   each staying within MAX_CHUNK_CHARS so every chunk fits comfortably in a
 *   single LLM context window.
 *
 * @param url - GitHub repo URL (https://github.com/owner/repo)
 * @param version - Optional version string. When provided, tries to fetch from
 *   the matching git tag (v{version} or {version}) instead of the default branch.
 *
 * The caller (analysisStore) decides whether to run a single-pass or
 * multi-pass LLM analysis based on chunks.length.
 *
 * @returns SourceChunkResult containing the chunks and the resolved git ref (tag),
 *   or null if the repo could not be fetched.
 */
export async function fetchGitHubRepoSourceChunks(url: string, version?: string): Promise<SourceChunkResult | null> {
  const token = useSettingsStore.getState().githubToken;

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, '');

  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Resolve the correct ref for this version (if any)
  const ref = await resolveVersionRef(owner, cleanRepo, version, headers);
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';

  try {
    // Fetch root contents and .github/workflows in parallel
    const [rootRes, workflowsRes] = await Promise.allSettled([
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contents${refQuery}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contents/.github/workflows${refQuery}`, { headers })
    ]);

    if (rootRes.status === 'rejected' || !(rootRes.value as Response).ok) return null;
    const rootContents: GHFile[] = await (rootRes.value as Response).json();
    if (!Array.isArray(rootContents)) return null;


    // Pick the most security-relevant workflow (not the first alphabetically)
    let bestWorkflow: GHFile | null = null;
    if (workflowsRes.status === 'fulfilled' && (workflowsRes.value as Response).ok) {
      const wfList = await (workflowsRes.value as Response).json();
      if (Array.isArray(wfList)) bestWorkflow = pickBestWorkflow(wfList);
    }

    // Read root manifest for scripts + workspace declarations
    const rootPkgFile = rootContents.find(f => f.name === 'package.json' && f.download_url);
    let rootPkgScripts: Record<string, string> = {};
    let workspaceGlobs: string[] = [];
    let isMonorepo = rootContents.some(f => MONOREPO_INDICATORS.includes(f.name));

    if (rootPkgFile) {
      try {
        const pkg = await fetch(rootPkgFile.download_url, { headers }).then(r => r.json());
        rootPkgScripts = pkg.scripts || {};
        const ws = pkg.workspaces;
        if (ws) {
          workspaceGlobs = Array.isArray(ws) ? ws : (ws.packages || []);
          if (workspaceGlobs.length > 0) isMonorepo = true;
        }
      } catch { /* ignore — continue without workspace info */ }
    }

    const includedPaths = new Set<string>();

    // ── SIMPLE REPO: single chunk (original behaviour) ────────────────────────
    if (!isMonorepo) {
      const files = selectPriorityFiles(rootContents, includedPaths, bestWorkflow).slice(0, 8);
      const { content } = await fetchAndBuildContent(files, headers, rootPkgScripts, MAX_TOTAL_CHARS);
      if (!content) return null;
      return { chunks: [{ label: `${owner}/${cleanRepo}`, content }], resolvedRef: ref };
    }

    // ── MONOREPO: multi-chunk analysis ────────────────────────────────────────
    const chunks: SourceChunk[] = [];

    // Chunk 0 — root manifests + best CI/CD workflow
    const rootFiles = selectPriorityFiles(rootContents, includedPaths, bestWorkflow).slice(0, 6);
    const rootResult = await fetchAndBuildContent(rootFiles, headers, rootPkgScripts, MAX_CHUNK_CHARS);
    if (rootResult.content) {
      chunks.push({ label: 'root manifests + CI/CD', content: rootResult.content });
      rootResult.includedPaths.forEach(p => includedPaths.add(p));
    }

    // Determine which workspace directories to scan
    const workspaceDirs = getWorkspaceDirs(rootContents, workspaceGlobs);

    // Fetch each workspace directory's contents concurrently (with version ref if applicable)
    const wsDirFetches = workspaceDirs.map(dir =>
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contents/${dir}${refQuery}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(data => ({ dir, contents: Array.isArray(data) ? data as GHFile[] : null }))
        .catch(() => ({ dir, contents: null as GHFile[] | null }))
    );
    const wsDirResults = await Promise.all(wsDirFetches);

    for (const { dir, contents } of wsDirResults) {
      if (!contents || chunks.length >= MAX_CHUNKS) break;

      // Read this workspace's manifest for its own scripts (e.g. sub-package postinstall)
      let wsPkgScripts: Record<string, string> = {};
      const wsPkgFile = contents.find((f: GHFile) =>
        ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'].includes(f.name) && f.download_url
      );
      if (wsPkgFile?.name === 'package.json') {
        try {
          const pkg = await fetch(wsPkgFile.download_url, { headers }).then(r => r.json());
          wsPkgScripts = pkg.scripts || {};
        } catch { /* ignore */ }
      }

      // Also peek into a src/ subdirectory if present, to find telemetry/auth source files
      // (common pattern: workspace root has package.json but code lives in src/)
      let srcContents: GHFile[] = [];
      const srcDir = contents.find((f: GHFile) => f.type === 'dir' && f.name === 'src');
      if (srcDir) {
        try {
          const srcRes = await fetch(
            `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${dir}/src${refQuery}`,
            { headers }
          );
          if (srcRes.ok) {
            const srcData = await srcRes.json();
            if (Array.isArray(srcData)) srcContents = srcData as GHFile[];
          }
        } catch { /* ignore */ }
      }

      // Merge workspace root + src/ for file selection (src/ files have paths like dir/src/file.py)
      const combinedContents = [
        ...contents,
        ...srcContents.map(f => ({ ...f, path: f.path || `${dir}/src/${f.name}` }))
      ];

      const wsFiles = selectPriorityFiles(combinedContents, includedPaths, null).slice(0, 5);
      if (wsFiles.length === 0) continue;

      const wsResult = await fetchAndBuildContent(wsFiles, headers, wsPkgScripts, MAX_CHUNK_CHARS);
      if (wsResult.content) {
        chunks.push({ label: dir, content: wsResult.content });
        wsResult.includedPaths.forEach(p => includedPaths.add(p));
      }
    }

    return chunks.length > 0 ? { chunks, resolvedRef: ref } : null;

  } catch (err) {
    console.error('Failed to fetch GitHub repository source chunks', err);
    return null;
  }
}

/**
 * Backward-compatible convenience wrapper.
 * Returns all chunks concatenated into a single string (used by unpkg flow,
 * dep scanner, and exports that expect a flat sourceCode string).
 */
export async function fetchGitHubRepoSourceCode(url: string, version?: string): Promise<string | null> {
  const result = await fetchGitHubRepoSourceChunks(url, version);
  if (!result || result.chunks.length === 0) return null;
  if (result.chunks.length === 1) return result.chunks[0].content;
  // Multi-chunk: label each section so the content is still readable in exports
  return result.chunks
    .map(c => `=== SOURCE SECTION: ${c.label} ===\n${c.content}`)
    .join('\n\n');
}
