import type { ManifestParser } from './types';
import { packageJsonParser } from './packageJson';
import { requirementsTxtParser } from './requirementsTxt';
import { pubspecYamlParser } from './pubspecYaml';
import { pyprojectTomlParser } from './pyprojectToml';

const PARSERS: ManifestParser[] = [
  packageJsonParser,
  requirementsTxtParser,
  pubspecYamlParser,
  pyprojectTomlParser
];

export function getParserForFile(filename: string): ManifestParser | null {
  return PARSERS.find(p => p.canParse(filename)) || null;
}
