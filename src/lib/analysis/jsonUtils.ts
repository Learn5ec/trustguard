/**
 * Shared JSON parsing utilities used by both analysisStore (single-package)
 * and runFullAnalysis (batch pipeline).
 */
import type { SecurityFinding } from '../../types/analysis';

export const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4
};

export function deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const map = new Map<string, SecurityFinding>();
  for (const f of findings) {
    const key = `${f.category}::${f.title.toLowerCase().slice(0, 40)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, f);
    } else {
      const existingRank = SEVERITY_RANK[existing.severity] ?? 4;
      const newRank = SEVERITY_RANK[f.severity] ?? 4;
      if (newRank < existingRank || (newRank === existingRank && f.confirmed && !existing.confirmed)) {
        map.set(key, f);
      }
    }
  }
  return Array.from(map.values());
}

export function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
}

export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape)                   { escape = false; continue; }
    if (ch === '\\' && inString)  { escape = true;  continue; }
    if (ch === '"')               { inString = !inString; continue; }
    if (inString)                 { continue; }
    if (ch === '{')               { depth++; }
    else if (ch === '}')          { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export function extractBalancedArray(text: string, startPos: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];
    if (escape)                   { escape = false; continue; }
    if (ch === '\\' && inString)  { escape = true;  continue; }
    if (ch === '"')               { inString = !inString; continue; }
    if (inString)                 { continue; }
    if (ch === '[')               { depth++; }
    else if (ch === ']')          { depth--; if (depth === 0) return text.slice(startPos, i + 1); }
  }
  return depth > 0 ? text.slice(startPos) + ']'.repeat(depth) : null;
}

export function repairJson(raw: string): string {
  return raw.replace(/,(\s*[}\]])/g, '$1');
}

export function extractObjectsFromArrayText(arrayText: string): any[] {
  const results: any[] = [];
  let i = 0;
  while (i < arrayText.length) {
    const nextBrace = arrayText.indexOf('{', i);
    if (nextBrace === -1) break;
    const objStr = extractFirstJsonObject(arrayText.slice(nextBrace));
    if (!objStr) { i = nextBrace + 1; continue; }
    try { results.push(JSON.parse(repairJson(objStr))); } catch { /* skip malformed */ }
    i = nextBrace + objStr.length;
  }
  return results;
}

/** 3-tier extraction: full object → repaired object → per-object fallback */
export function extractFindingsFromResponse(text: string): SecurityFinding[] {
  const clean = stripFences(text);
  const objStr = extractFirstJsonObject(clean);
  if (objStr) {
    for (const candidate of [objStr, repairJson(objStr)]) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed.securityFindings)) return parsed.securityFindings;
      } catch { /* fall through */ }
    }
  }
  const arrayKeyMatch = clean.match(/"securityFindings"\s*:\s*\[/);
  if (arrayKeyMatch && arrayKeyMatch.index !== undefined) {
    const bracketPos = clean.indexOf('[', arrayKeyMatch.index);
    if (bracketPos !== -1) {
      const arrayStr = extractBalancedArray(clean, bracketPos);
      if (arrayStr) {
        for (const candidate of [arrayStr, repairJson(arrayStr)]) {
          try {
            const arr = JSON.parse(candidate);
            if (Array.isArray(arr)) return arr;
          } catch { /* fall through */ }
        }
        return extractObjectsFromArrayText(arrayStr);
      }
    }
  }
  return [];
}

/** Parse a full LLM response as a JSON object (synthesis / single-pass). */
export function parseFullJsonResponse(text: string): any {
  const clean = stripFences(text);
  const objStr = extractFirstJsonObject(clean);
  if (!objStr) throw new Error('No JSON object found in response');
  try { return JSON.parse(objStr); } catch { /* fall through */ }
  return JSON.parse(repairJson(objStr));
}
