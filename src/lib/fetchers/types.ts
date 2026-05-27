export interface FetchResult<T> {
  data: T | null;
  error?: string;
  source: string;
}

/**
 * A labelled slice of source code to be analysed in one LLM pass.
 * Simple repos produce a single chunk; monorepos produce one chunk per
 * workspace directory so each LLM pass stays within the context budget.
 */
export interface SourceChunk {
  /** Human-readable label shown in status messages, e.g. "python-sdk" */
  label: string;
  /** Concatenated file contents for this chunk (≤ MAX_CHUNK_CHARS) */
  content: string;
}

/**
 * Return type of fetchGitHubRepoSourceChunks.
 * Includes the resolved git ref (tag) so callers can record exactly which
 * version was fetched and build release URLs for the report.
 */
export interface SourceChunkResult {
  /** The fetched source chunks (one for simple repos, N for monorepos). */
  chunks: SourceChunk[];
  /**
   * The git tag that matched the requested version, e.g. "v0.111.0" or "0.111.0".
   * Undefined when no version was requested or no matching tag was found
   * (in which case source was fetched from the default branch).
   */
  resolvedRef?: string;
}
