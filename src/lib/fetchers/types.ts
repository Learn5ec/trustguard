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
