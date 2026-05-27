export type Ecosystem = 'npm' | 'pypi' | 'go' | 'maven' | 'nuget' | 'ruby' | 'rust' | 'pub' | 'github' | 'hex' | 'packagist' | 'conda' | 'uv' | 'pip' | 'pipx' | 'unknown';

/** Confidence level for how reliably the GitHub URL and registry URL were resolved */
export type ResolverConfidence = 'VERIFIED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';

export interface ScoreBreakdown {
  factor: string;
  impact: number;
  description: string;
}

export interface PackageAnalysisData {
  packageName: string;
  version: string;
  ecosystem: Ecosystem;
  vulnerabilities: Vulnerability[];
  github: GitHubStats;
  scorecard?: ScorecardData;
  license?: LicenseData;
  packageStats?: PackageStats;
  sourceCode?: string;
  securityFindings?: SecurityFinding[];
  dependencyVulnerabilities?: DependencyVuln[];
  riskScore: number;
  riskScoreBreakdown?: ScoreBreakdown[];
  trustScore: number;
  trustScoreBreakdown?: ScoreBreakdown[];
  popularityLabel?: string;          // NEW - "Niche" | "Small community" | "Established" | "Popular" | "Industry Standard"
  resolvedGithubUrl?: string;         // Canonical GitHub URL actually analyzed
  resolvedVia?: 'direct_url' | 'registry_lookup' | 'user_input'; // How the repo URL was resolved
  resolvedRegistryUrl?: string;       // The registry API URL contacted (or attempted)
  resolvedGitRef?: string;            // Confirmed git tag used for source fetch (e.g. "v0.111.0" or "0.111.0")
  resolverConfidence?: ResolverConfidence; // How reliably was the GitHub URL resolved
  /** How complete the data is — FULL means all APIs responded */
  dataCompleteness?: 'FULL' | 'PARTIAL' | 'METADATA_ONLY' | 'NONE';
  /** When the current version was first published on the registry (e.g. PyPI upload_time) */
  latestVersionPublishedAt?: Date;
  scanStartedAt?: string;             // ISO timestamp when scan began
  scanEndedAt?: string;               // ISO timestamp when scan ended
  reportGeneratedAt?: string;         // ISO timestamp when report was generated
  isDeprecated?: boolean;             // Package is marked deprecated
  isUnmaintained?: boolean;           // No commits for 3+ years
  deprecationMessage?: string;        // Deprecation notice text
  commercialModel?: 'open-source' | 'freemium' | 'paid' | 'unknown'; // Licensing model
  commercialUseClassification?: 'allowed' | 'restricted' | 'needs-permission' | 'unknown'; // Commercial use
}

export interface Vulnerability {
  id: string; // CVE or GHSA
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  cvssScore?: number;
  cvssVector?: string;
  title: string;
  description: string;
  affectedVersions: string;
  fixedInVersion: string;
  publishedDate: string;
  modifiedDate: string;
  cweIds: string[];
  references: string[];
  isTransitive: boolean;
  source: 'OSV' | 'NVD' | 'GitHub Advisory';
  /** false = fixed in a version ≤ the installed version (already patched) */
  isApplicable?: boolean;
  /** Human-readable note explaining why this CVE is or isn't applicable */
  applicabilityNote?: string;
}

export interface GitHubStats {
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  archived: boolean;
  lastCommitDate: Date;
  contributorsCount: number;
  commitsLast90Days?: number;        // NEW
  authorPublicRepos?: number;        // NEW
  authorFollowers?: number;          // NEW
  latestRelease?: string;            // NEW - e.g. "v2.1.0"
  createdAt?: Date;
  owner?: {
    login: string;
    avatarUrl: string;
    type: string;
  };
  license?: {
    spdxId: string;
    name: string;
  };
}

export interface ScorecardData {
  score: number;
  checks: Record<string, { score: number; reason: string }>;
}

export interface LicenseData {
  spdxId: string;
  name: string;
  content?: string;
  isOSIApproved?: boolean;
}

export interface PackageStats {
  weeklyDownloads: number;
  monthlyDownloads: number;
  publishedDate: Date;
  latestVersion: string;
  latestSecureVersion?: string;      // NEW - latest version without critical CVEs
  description: string;
  homepage?: string;
  dependentsCount?: number;          // NEW - how many packages depend on this
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  model: string;
  provider: string;
  /** true when counts are estimated from character length, not reported by the API */
  isEstimated: boolean;
}

export interface SecurityFinding {
  category:
    | 'README_CODE_MISMATCH'
    | 'SILENT_TELEMETRY'
    | 'THIRD_PARTY_DATA_EXFILTRATION'
    | 'INSECURE_TRANSMISSION'
    | 'SENSITIVE_OUTBOUND'
    | 'BACKGROUND_PROCESS'
    | 'POSTINSTALL_RISK'
    | 'EXCESSIVE_PERMISSIONS'
    | 'HARDCODED_SECRET'
    | 'DANGEROUS_API_USAGE'
    | 'PROTOTYPE_POLLUTION'
    | 'OBFUSCATION_INDICATOR'
    | 'DEPENDENCY_CVE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  confirmed: boolean;
}

export interface DependencyVuln {
  dependencyName: string;
  dependencyVersion: string;
  vulnerabilityCount: number;
  highestSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  topCVEs: string[];
}

export interface AnalysisReport {
  packageName: string;
  version: string;
  ecosystem: Ecosystem;
  dateGenerated: string;
  executiveSummary: string;
  codeReview?: string;
  securityFindings?: SecurityFinding[];
  dependencyVulnerabilities?: DependencyVuln[];
  communityAssessment?: string;
  threatModel: {
    spoofing: string;
    tampering: string;
    repudiation: string;
    informationDisclosure: string;
    denialOfService: string;
    elevationOfPrivilege: string;
    overallThreatLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';
  };
  licenseExplanation: {
    summary: string;
    canYou: string[];
    cannotYou: string[];
    mustYou: string[];
    commercialUse: 'YES' | 'NO' | 'CONDITIONS';
    modifyAndDistribute: 'YES' | 'NO' | 'CONDITIONS';
    patentProtection: 'YES' | 'NO' | 'UNCLEAR';
    riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    plainEnglish: string;
  };
  alternatives: Array<{
    name: string;
    ecosystem: string;
    description: string;
    whyBetter: string;
    license: string;
    weeklyDownloads: string;
    githubStars: string;
    maintenanceStatus: 'ACTIVE' | 'MAINTAINED' | 'SLOW' | 'ABANDONED';
    migrationDifficulty: 'EASY' | 'MODERATE' | 'HARD';
    notableFeatures: string[];
  }>;
  remediationSteps: Array<{
    priority: 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM';
    action: string;
    rationale: string;
  }>;
  developerVerdict: 'USE' | 'USE_WITH_CAUTION' | 'AVOID' | 'REPLACE_SOON';
  rawAnalysisData: PackageAnalysisData;
}
