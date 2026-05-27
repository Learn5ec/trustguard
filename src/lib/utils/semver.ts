/**
 * Minimal semver utilities for CVE applicability checking.
 *
 * These are intentionally lightweight — no full semver parser.
 * The goal is to determine whether a fix version is ≤ the installed version,
 * so we can mark a CVE as "already patched".
 */

/**
 * Strip version range operators and return a clean dotted numeric string.
 *
 * Examples:
 *   "^2.1.0"  → "2.1.0"
 *   ">=1.3.0" → "1.3.0"
 *   "~=2.0.0" → "2.0.0"
 *   "1.0,<2"  → "1.0"        (takes first segment of comma/space-separated range)
 *   "None"    → ""
 *   "Unknown" → ""
 */
export function cleanVersionString(v: string): string {
  if (!v || v === 'None' || v === 'Unknown' || v === 'latest' || v === '*') return '';

  // Take the first segment for ranges like ">=1.0,<2.0" or ">=1.0 <2.0"
  const first = v.split(/[,\s]+/)[0] || '';

  // Strip leading operators: ^, ~, >=, <=, >, <, =, ~=, !=
  const stripped = first.replace(/^[~^!=<>]+/, '').replace(/^=/, '');

  // Accept only dotted version-like strings (digits and dots)
  if (/^\d[\d.]*$/.test(stripped)) return stripped;

  return '';
}

/**
 * Compare two version strings numerically, segment by segment.
 *
 * Returns:
 *  -1 if a < b
 *   0 if a === b
 *  +1 if a > b
 *
 * Empty strings are treated as "unknown" and always return 0 (equal / inconclusive).
 */
export function compareVersions(a: string, b: string): number {
  if (!a || !b) return 0; // inconclusive when either is unknown

  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (isNaN(na) || isNaN(nb)) return 0; // inconclusive if non-numeric segment
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * Returns true if `fixedIn` is a real version AND it is ≤ `installed`.
 * A CVE fixed in v1.2.0 with installed v2.0.30 → the fix is already included.
 */
export function isAlreadyFixed(fixedIn: string, installed: string): boolean {
  const fix = cleanVersionString(fixedIn);
  const inst = cleanVersionString(installed);
  if (!fix || !inst) return false;
  // fixedIn ≤ installed means the patch is already applied
  return compareVersions(fix, inst) <= 0;
}
