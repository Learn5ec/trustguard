/**
 * LLM Rate Limiter — enforces strictly 1 LLM request per second globally.
 *
 * All LLM calls in batch mode must go through globalLLMRateLimiter.scheduleRequest().
 * Non-LLM work (GitHub/OSV fetches, scoring) is NOT affected — only wrap LLM calls.
 *
 * Usage:
 *   const result = await globalLLMRateLimiter.scheduleRequest(async () => {
 *     // ... LLM call here ...
 *   });
 */

export class LLMRateLimiter {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];
  private lastFiredAt = 0;
  private processing = false;
  private readonly minIntervalMs: number;

  constructor(requestsPerSecond = 1) {
    this.minIntervalMs = Math.ceil(1000 / requestsPerSecond);
  }

  /**
   * Schedule an LLM request. The request will execute after waiting at least
   * minIntervalMs since the last request fired.
   */
  scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastFiredAt;
      const waitMs = Math.max(0, this.minIntervalMs - elapsed);

      if (waitMs > 0) {
        await new Promise<void>(r => setTimeout(r, waitMs));
      }

      const item = this.queue.shift();
      if (!item) continue;

      this.lastFiredAt = Date.now();

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (e) {
        item.reject(e);
      }
    }

    this.processing = false;
  }

  /**
   * Check if an error is a rate limit error (HTTP 429 or contains 'rate limit').
   */
  static isRateLimitError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return /429|rate.?limit|too many requests|quota/i.test(msg);
  }

  /** How many requests are currently queued. */
  get queueLength(): number {
    return this.queue.length;
  }
}

/** Global singleton rate limiter — 1 LLM request per second */
export const globalLLMRateLimiter = new LLMRateLimiter(1);
