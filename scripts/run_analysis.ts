import fs from 'fs';
import path from 'path';
import { analyzePackage } from '../src/lib/fetchers/orchestrator';
import { fetchPackageSourceCode } from '../src/lib/fetchers/unpkg';
import { fetchGitHubRepoSourceCode } from '../src/lib/fetchers/githubSource';
import { calculateRiskScore } from '../src/lib/scoring/riskScore';
import { calculateTrustScore } from '../src/lib/scoring/trustScore';
import { SYSTEM_PROMPT, buildAnalysisPrompt } from '../src/lib/llm/prompts';
import type { PackageAnalysisData, Ecosystem } from '../src/types/analysis';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure output directory exists
const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Mistral query helper
async function queryMistral(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY environment variable is required. Set it before running this script.');
  const url = 'https://api.mistral.ai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral API error (${response.status}): ${errText}`);
  }

  const resData = await response.json();
  const text = resData.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty response from Mistral API');
  }
  return text;
}

// Generate the final Markdown report in the format expected by ReportExporter but richer
function generateFullMarkdown(data: Partial<PackageAnalysisData>, parsedReport: any): string {
  const d = new Date().toISOString().split('T')[0];
  let md = `# TrustGuard AI Security Analysis Report: ${data.packageName}\n\n`;
  md += `**Date:** ${d}\n`;
  md += `**Ecosystem:** ${data.ecosystem}\n`;
  md += `**Version / Ref:** ${data.version || 'latest'}\n`;
  md += `**Overall Threat Level:** \`${parsedReport?.threatModel?.overallThreatLevel || 'UNKNOWN'}\`\n\n`;

  md += `## 📊 Score Summary\n\n`;
  md += `### 🔴 Risk Score: **${data.riskScore ?? 0}/100**\n`;
  if (data.riskScoreBreakdown && data.riskScoreBreakdown.length > 0) {
    md += `*Factors contributing to risk:*\n`;
    data.riskScoreBreakdown.forEach(b => {
      md += `- **${b.factor}** (Impact: \`+${b.impact}\`): ${b.description}\n`;
    });
  }
  md += `\n`;

  md += `### 🟢 Trust Score: **${data.trustScore ?? 0}/100**\n`;
  if (data.trustScoreBreakdown && data.trustScoreBreakdown.length > 0) {
    md += `*Factors contributing to trust:*\n`;
    data.trustScoreBreakdown.forEach(b => {
      md += `- **${b.factor}** (Impact: \`${b.impact > 0 ? '+' : ''}${b.impact}\`): ${b.description}\n`;
    });
  }
  md += `\n`;

  md += `## 📦 Repository Metadata\n\n`;
  if (data.github) {
    md += `- **Author / Owner:** ${data.github.owner?.login || 'Unknown'} (${data.github.owner?.type || 'User'})\n`;
    md += `- **Created At:** ${data.github.createdAt ? new Date(data.github.createdAt).toLocaleDateString() : 'Unknown'}\n`;
    md += `- **Last Update:** ${data.github.lastCommitDate ? new Date(data.github.lastCommitDate).toLocaleDateString() : 'Unknown'}\n`;
    md += `- **GitHub Stars:** ${data.github.stars || 0}\n`;
    md += `- **Forks:** ${data.github.forks || 0}\n`;
    md += `- **Open Issues:** ${data.github.openIssues || 0}\n`;
    md += `- **Archived Status:** ${data.github.archived ? 'Archived' : 'Active'}\n`;
    md += `- **Repository URL:** ${data.github.url || 'None'}\n`;
  } else {
    md += `No repository metadata found.\n`;
  }
  md += `\n`;

  md += `## 📜 License Audit\n\n`;
  if (data.license) {
    md += `- **Detected License:** \`${data.license.spdxId}\` - ${data.license.name}\n\n`;
  } else {
    md += `- **Detected License:** \`Unknown\`\n\n`;
  }
  if (parsedReport?.licenseExplanation) {
    const lic = parsedReport.licenseExplanation;
    md += `### Summary\n${lic.summary || 'N/A'}\n\n`;
    md += `### Details\n`;
    md += `- **Risk Level:** \`${lic.riskLevel || 'LOW'}\`\n`;
    md += `- **Commercial Use:** \`${lic.commercialUse || 'YES'}\`\n`;
    md += `- **Modify and Distribute:** \`${lic.modifyAndDistribute || 'YES'}\`\n`;
    md += `- **Patent Protection:** \`${lic.patentProtection || 'YES'}\`\n\n`;
    
    if (lic.canYou && lic.canYou.length > 0) {
      md += `**What you can do:**\n`;
      lic.canYou.forEach((s: string) => md += `- ${s}\n`);
      md += `\n`;
    }
    if (lic.cannotYou && lic.cannotYou.length > 0) {
      md += `**What you cannot do:**\n`;
      lic.cannotYou.forEach((s: string) => md += `- ${s}\n`);
      md += `\n`;
    }
    if (lic.mustYou && lic.mustYou.length > 0) {
      md += `**What you must do:**\n`;
      lic.mustYou.forEach((s: string) => md += `- ${s}\n`);
      md += `\n`;
    }
  }

  md += `## 🛡️ Executive Summary\n\n`;
  md += `${parsedReport?.executiveSummary || 'No summary available.'}\n\n`;

  md += `## 💻 AI Secure Code Review\n\n`;
  md += `${parsedReport?.codeReview || 'No code review details available.'}\n\n`;

  md += `## 🕸️ STRIDE Threat Model\n\n`;
  if (parsedReport?.threatModel) {
    const tm = parsedReport.threatModel;
    md += `| Category | Description |\n`;
    md += `|---|---|\n`;
    md += `| **Spoofing** | ${tm.spoofing} |\n`;
    md += `| **Tampering** | ${tm.tampering} |\n`;
    md += `| **Repudiation** | ${tm.repudiation} |\n`;
    md += `| **Information Disclosure** | ${tm.informationDisclosure} |\n`;
    md += `| **Denial of Service** | ${tm.denialOfService} |\n`;
    md += `| **Elevation of Privilege** | ${tm.elevationOfPrivilege} |\n`;
  }
  md += `\n`;

  md += `## 🐛 Known Vulnerabilities (OSV)\n\n`;
  if (!data.vulnerabilities || data.vulnerabilities.length === 0) {
    md += `No known vulnerabilities found in the database.\n\n`;
  } else {
    md += `| CVE / ID | Severity | Title | Affected Versions | Fixed In |\n`;
    md += `|---|---|---|---|---|\n`;
    data.vulnerabilities.forEach(v => {
      md += `| ${v.id} | \`${v.severity}\` | ${v.title} | ${v.affectedVersions} | ${v.fixedInVersion} |\n`;
    });
    md += `\n`;
  }

  md += `## 🔄 Suggested Alternatives\n\n`;
  if (parsedReport?.alternatives && parsedReport.alternatives.length > 0) {
    parsedReport.alternatives.forEach((alt: any, index: number) => {
      md += `### ${index + 1}. ${alt.name} (${alt.ecosystem})\n`;
      md += `${alt.description || ''}\n`;
      md += `- **Why Better:** ${alt.whyBetter || ''}\n`;
      md += `- **License:** \`${alt.license || 'Unknown'}\` | **Difficulty:** \`${alt.migrationDifficulty || 'EASY'}\` | **Maintenance:** \`${alt.maintenanceStatus || 'ACTIVE'}\`\n\n`;
    });
  }

  md += `## 🛠️ Remediation Steps\n\n`;
  if (parsedReport?.remediationSteps && parsedReport.remediationSteps.length > 0) {
    parsedReport.remediationSteps.forEach((step: any) => {
      md += `- **[${step.priority || 'MEDIUM'}]** ${step.action} - *Rationale:* ${step.rationale}\n`;
    });
  }

  md += `\n---\n*Report generated by TrustGuard AI Security Agent.*`;
  return md;
}

// Run single analysis
async function runAnalysis(packageName: string, version: string, ecosystem: Ecosystem) {
  console.log(`\n======================================================`);
  console.log(`Analyzing: ${packageName}@${version} (Ecosystem: ${ecosystem})`);
  console.log(`======================================================`);

  try {
    // 1. Fetch metadata and vuln data
    const fetchedData = await analyzePackage(packageName, version, ecosystem);
    console.log(`Fetched metadata and vulnerability information.`);
    console.log(`Detected license:`, fetchedData.license);

    // 2. Fetch source code
    if (fetchedData.ecosystem === 'github' && fetchedData.github?.url) {
      console.log(`Fetching github repository source code...`);
      const sourceCode = await fetchGitHubRepoSourceCode(fetchedData.github.url);
      if (sourceCode) {
        fetchedData.sourceCode = sourceCode;
        console.log(`Fetched GitHub code payload (${sourceCode.length} chars).`);
      }
    } else if (fetchedData.ecosystem === 'npm') {
      console.log(`Fetching npm package source code...`);
      const sourceCode = await fetchPackageSourceCode(packageName, fetchedData.version || version);
      if (sourceCode) {
        fetchedData.sourceCode = sourceCode;
        console.log(`Fetched NPM code payload (${sourceCode.length} chars).`);
      }
    }

    // 3. Compute risk/trust scores
    console.log(`Computing risk and trust scores...`);
    const riskResult = calculateRiskScore(fetchedData);
    const trustResult = calculateTrustScore({ ...fetchedData, riskScore: riskResult.score });

    const enrichedData: Partial<PackageAnalysisData> = {
      ...fetchedData,
      riskScore: riskResult.score,
      riskScoreBreakdown: riskResult.breakdown,
      trustScore: trustResult.score,
      trustScoreBreakdown: trustResult.breakdown
    };

    console.log(`Risk Score:`, riskResult.score);
    console.log(`Trust Score:`, trustResult.score);

    // 4. Query LLM for Threat Model & Code Review
    console.log(`Querying LLM (Mistral) for synthesis...`);
    const userPrompt = buildAnalysisPrompt(enrichedData);
    const textOutput = await queryMistral(SYSTEM_PROMPT, userPrompt);
    
    // Parse JSON output
    let parsedReport: any = {};
    try {
      const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedReport = JSON.parse(jsonMatch[0]);
      } else {
        parsedReport = JSON.parse(textOutput);
      }
    } catch (e: any) {
      console.error(`Failed to parse LLM JSON: ${e.message}. Using raw output.`);
      parsedReport = { executiveSummary: textOutput };
    }

    // 5. Generate Markdown
    const markdown = generateFullMarkdown(enrichedData, parsedReport);
    
    // Determine filename
    let safeName = packageName.replace(/[^a-zA-Z0-9.-]/g, '_');
    if (ecosystem === 'github') {
      safeName = `github_${safeName}`;
    } else {
      safeName = `${ecosystem}_${safeName}_${version}`;
    }
    const outputPath = path.join(reportsDir, `${safeName}.md`);
    fs.writeFileSync(outputPath, markdown, 'utf-8');
    console.log(`Report successfully written to: ${outputPath}`);

  } catch (err: any) {
    console.error(`Analysis failed for ${packageName}:`, err.message);
  }
}

// Run sequentially
async function main() {
  // Test Case 1: https://github.com/romrider/apexcharts-card
  await runAnalysis('https://github.com/romrider/apexcharts-card', 'latest', 'github');

  // Test Case 2: https://github.com/Learn5ec/unauth-checker
  await runAnalysis('https://github.com/Learn5ec/unauth-checker', 'latest', 'github');

  // Test Case 3: dotenv@17.2.3 package
  // Note: if npm registry reports dotenv version 17.2.3 doesn't exist, it will fallback gracefully.
  await runAnalysis('dotenv', '17.2.3', 'npm');

  // Test Case 4: xlsx@0.18.5 package
  await runAnalysis('xlsx', '0.18.5', 'npm');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
});
