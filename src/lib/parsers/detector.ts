import type { ManifestParser } from './types';
import type { Ecosystem } from '../../types/analysis';
import { packageLockJsonParser } from './packageLockJson';
import { packageJsonParser } from './packageJson';
import { requirementsTxtParser } from './requirementsTxt';
import { pubspecYamlParser } from './pubspecYaml';
import { pyprojectTomlParser } from './pyprojectToml';
import { cargoTomlParser } from './cargoToml';
import { gemfileLockParser } from './gemfileLock';
import { goModParser } from './goMod';
import { composerJsonParser } from './composerJson';

const PARSERS: ManifestParser[] = [
  packageLockJsonParser,
  packageJsonParser,
  requirementsTxtParser,
  pubspecYamlParser,
  pyprojectTomlParser,
  cargoTomlParser,
  gemfileLockParser,
  goModParser,
  composerJsonParser,
];

export function getParserForFile(filename: string): ManifestParser | null {
  return PARSERS.find(p => p.canParse(filename)) || null;
}

/**
 * Detect the primary ecosystem from a manifest filename alone.
 * Returns null if the filename doesn't match any known manifest.
 *
 * Used by SearchBar when a file is uploaded — avoids showing the ecosystem dropdown
 * since the ecosystem is deterministically known from the file type.
 */
export function detectEcosystemFromFilename(filename: string): Ecosystem | null {
  const lower = filename.toLowerCase();
  const base  = lower.split('/').pop() || lower; // strip any path prefix

  // npm
  if (base === 'package.json' || base === 'package-lock.json' || base === 'npm-shrinkwrap.json') return 'npm';

  // PyPI / Python (pyproject.toml used by both uv and pip as well)
  if (base === 'requirements.txt' || (base.startsWith('requirements') && base.endsWith('.txt'))) return 'pypi';
  if (base === 'setup.py' || base === 'setup.cfg') return 'pypi';
  if (base === 'pyproject.toml') return 'pypi';
  if (base === 'uv.lock') return 'uv';
  if (base === 'pip.conf' || base === 'pip.ini') return 'pip';

  // Dart / Flutter
  if (base === 'pubspec.yaml' || base === 'pubspec.yml') return 'pub';

  // Rust
  if (base === 'cargo.toml' || base === 'cargo.lock') return 'rust';

  // Go
  if (base === 'go.mod' || base === 'go.sum') return 'go';

  // Java / Maven / Gradle
  if (base === 'pom.xml') return 'maven';
  if (base === 'build.gradle' || base === 'build.gradle.kts') return 'maven';

  // Ruby
  if (base === 'gemfile' || base === 'gemfile.lock' || base.endsWith('.gemspec')) return 'ruby';

  // PHP / Packagist
  if (base === 'composer.json' || base === 'composer.lock') return 'packagist';

  // Elixir / Hex
  if (base === 'mix.exs' || base === 'mix.lock') return 'hex';

  // .NET / NuGet
  if (base.endsWith('.csproj') || base.endsWith('.fsproj') || base === 'packages.config') return 'nuget';
  if (base === 'paket.dependencies' || base === 'paket.lock') return 'nuget';

  // Conda
  if (base === 'environment.yml' || base === 'environment.yaml') return 'conda';

  return null;
}
