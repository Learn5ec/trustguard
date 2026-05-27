/**
 * Timestamp formatting utility with timezone support.
 * Supports IST, UTC, GMT, EST, EDT timezones.
 */

export type TimezoneId = 'IST' | 'UTC' | 'GMT' | 'EST' | 'EDT';

const TIMEZONE_IANA: Record<TimezoneId, string> = {
  IST: 'Asia/Kolkata',
  UTC: 'UTC',
  GMT: 'Etc/GMT',
  EST: 'America/New_York',
  EDT: 'America/New_York',
};

/**
 * Format an ISO timestamp string into a human-readable format with the given timezone.
 * Example output: "27 May 2026, 10:30:45 AM IST"
 */
export function formatTimestamp(isoString: string, timezone: TimezoneId = 'IST'): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const iana = TIMEZONE_IANA[timezone];
    const formatted = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: iana,
    }).format(date);

    return `${formatted} ${timezone}`;
  } catch {
    return new Date(isoString).toLocaleString();
  }
}

/**
 * Calculate duration between two ISO timestamps and return a human-readable string.
 * Example: "1m 23s" or "45s"
 */
export function formatDuration(startIso: string, endIso: string): string {
  try {
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const diffSec = Math.round((endMs - startMs) / 1000);
    if (diffSec < 60) return `${diffSec}s`;
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  } catch {
    return '';
  }
}

/**
 * Get current ISO timestamp string.
 */
export function now(): string {
  return new Date().toISOString();
}
