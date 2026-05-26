import type { Ecosystem } from '../../types/analysis';

export interface ParsedDependency {
  name: string;
  version: string;
  exactVersion?: string;
  ecosystem: Ecosystem;
  isDev: boolean;
  isPeer?: boolean;
  isOptional?: boolean;
  depth?: number;
}

export interface ManifestParser {
  canParse: (filename: string) => boolean;
  parse: (content: string) => ParsedDependency[];
}
