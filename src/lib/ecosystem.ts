import type { Ecosystem } from '../types/analysis';

export function detectEcosystem(input: string): Ecosystem {
  // Guard: HTTPS URLs should never reach here (validation catches them), but just in case:
  if (input.startsWith('https://') || input.startsWith('http://')) return 'github';
  if (input.startsWith('@')) return 'npm'; // Scoped npm packages
  if (input.includes('/') === false) return 'npm'; // No slash = likely npm
  if (input.includes('==') || input.includes('>=')) return 'pypi'; // requirements syntax
  if (input.startsWith('github.com/') && input.split('/').length === 3) return 'go';
  if (input.match(/^[a-z_]+$/)) return 'pypi'; // Python naming style
  if (input.includes(':') && !input.startsWith('@')) return 'maven'; // group:artifact
  if (input.match(/^[A-Z][a-zA-Z]+$/)) return 'nuget'; // PascalCase
  return 'npm';
}
