/**
 * PyPI Download Statistics Fetcher
 *
 * Uses the pypistats.org public API (free, no auth, CORS-open) to retrieve
 * real download counts for Python packages.
 *
 * Endpoint: GET https://pypistats.org/api/packages/{name}/recent
 * Response:  { data: { last_day, last_week, last_month }, package, type }
 */

export interface PyPIStatsResult {
  weeklyDownloads: number;
  monthlyDownloads: number;
}

/**
 * Fetch recent download statistics for a PyPI package.
 * Returns null if the package is not found or the API is unreachable.
 */
export async function fetchPyPIStats(packageName: string): Promise<PyPIStatsResult | null> {
  // Normalise package name (PyPI uses lowercase hyphenated names in the stats API)
  const normalised = packageName.toLowerCase().replace(/_/g, '-');

  try {
    const res = await fetch(
      `https://pypistats.org/api/packages/${encodeURIComponent(normalised)}/recent`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const data = json?.data;

    if (!data || typeof data.last_week !== 'number') return null;

    return {
      weeklyDownloads: data.last_week,
      monthlyDownloads: typeof data.last_month === 'number' ? data.last_month : data.last_week * 4,
    };
  } catch {
    return null;
  }
}
