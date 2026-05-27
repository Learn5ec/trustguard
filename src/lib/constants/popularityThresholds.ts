/**
 * Popularity label thresholds — shared constants used by both the
 * orchestrator (scoring) and the Technical Appendix (export documentation).
 *
 * For npm and PyPI, signal = weekly downloads.
 * For other ecosystems, signal = GitHub stars.
 */

export const DOWNLOAD_BASED_ECOSYSTEMS = new Set(['npm', 'pypi', 'uv', 'pip', 'pipx']);

export const DOWNLOAD_THRESHOLDS = [100, 10_000, 100_000, 1_000_000];
export const STAR_THRESHOLDS     = [100, 1_000,  10_000,  50_000];

export const POPULARITY_LABELS = [
  'Niche',
  'Small community',
  'Established',
  'Popular',
  'Industry Standard',
] as const;

export type PopularityLabel = typeof POPULARITY_LABELS[number];

/**
 * Compute the popularity label for a package.
 */
export function computePopularityLabel(
  stars: number,
  weeklyDownloads: number,
  ecosystem: string
): string {
  const useDownloads = DOWNLOAD_BASED_ECOSYSTEMS.has(ecosystem);
  const signal = useDownloads ? weeklyDownloads : stars;
  const thresholds = useDownloads ? DOWNLOAD_THRESHOLDS : STAR_THRESHOLDS;

  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (signal >= thresholds[i]) return POPULARITY_LABELS[i + 1];
  }
  return POPULARITY_LABELS[0];
}

/**
 * Returns a human-readable description of each popularity label for use in reports.
 */
export const POPULARITY_LABEL_DESCRIPTIONS: Record<string, string> = {
  'Niche':              'Fewer than 100 weekly downloads / GitHub stars. Very limited adoption.',
  'Small community':    '100–9,999 weekly downloads / GitHub stars. Growing but limited usage.',
  'Established':        '10,000–99,999 weekly downloads / GitHub stars. Solid, proven usage.',
  'Popular':            '100,000–999,999 weekly downloads / GitHub stars. Widely adopted.',
  'Industry Standard':  '1,000,000+ weekly downloads / GitHub stars. Dominant in its domain.',
};
