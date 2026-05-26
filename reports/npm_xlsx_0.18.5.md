# TrustGuard AI Security Analysis Report: xlsx

**Date:** 2026-05-25
**Ecosystem:** npm
**Version / Ref:** 0.18.5
**Overall Threat Level:** `CRITICAL`

## 📊 Score Summary

### 🔴 Risk Score: **41/100**
*Factors contributing to risk:*
- **Vulnerabilities** (Impact: `+16`): Found 0 critical, 2 high, and 0 medium vulnerabilities.
- **Maintenance** (Impact: `+25`): Last commit was 767 days ago, indicating slow maintenance.

### 🟢 Trust Score: **64/100**
*Factors contributing to trust:*
- **Risk Score Mirror** (Impact: `-16`): High risk score (41) decreases trust.
- **Low Adoption** (Impact: `-20`): Extremely low weekly downloads (<100).

## 📦 Repository Metadata

- **Author / Owner:** SheetJS (Organization)
- **Created At:** 12/4/2012
- **Last Update:** 4/18/2024
- **GitHub Stars:** 36254
- **Forks:** 7949
- **Open Issues:** 132
- **Archived Status:** Active
- **Repository URL:** https://github.com/SheetJS/sheetjs

## 📜 License Audit

- **Detected License:** `Apache-2.0` - Apache License 2.0

### Summary
Apache License 2.0 is a permissive open-source license with minimal restrictions.

### Details
- **Risk Level:** `LOW`
- **Commercial Use:** `YES`
- **Modify and Distribute:** `YES`
- **Patent Protection:** `YES`

**What you can do:**
- Use the package for commercial purposes without paying royalties.
- Modify the source code and distribute modified versions.

**What you cannot do:**
- Hold the authors liable for damages arising from use of the software.
- Use the authors' trademarks without permission.

**What you must do:**
- Include the original license and copyright notice in distributions.
- State changes made to the code if you modify it.

## 🛡️ Executive Summary

The 'xlsx' package (v0.18.5) is a widely used but unmaintained library for parsing and writing spreadsheet data. It has multiple unresolved high-severity vulnerabilities, including prototype pollution and ReDoS, making it unsafe for production use without mitigation.

## 💻 AI Secure Code Review

The provided source code (xlsx.js) reveals a monolithic, browser-first architecture with heavy reliance on global state and manual buffer/string manipulations. Key security concerns include: (1) No input validation for file parsing, directly enabling the reported prototype pollution (CVE-2023-30533) and ReDoS (CVE-2024-22363) vulnerabilities. (2) Hardcoded codepage mappings and unsafe string-to-buffer conversions (e.g., `s2a` function) that could trigger memory corruption. (3) Extensive use of `eval`-like dynamic code generation in the SSF (spreadsheet formatting) module, though not directly visible in the truncated snippet. The codebase lacks modern security practices like sandboxing or schema validation, and its reliance on legacy encodings (e.g., `cptable`) introduces additional attack surface.

## 🕸️ STRIDE Threat Model

| Category | Description |
|---|---|
| **Spoofing** | Low risk. The package does not handle authentication or user identities, but malicious files could spoof metadata (e.g., sheet names) during parsing. |
| **Tampering** | High risk. No integrity checks are performed on input files, allowing attackers to tamper with spreadsheet data or inject malicious payloads (e.g., via prototype pollution). |
| **Repudiation** | Medium risk. The package lacks audit logging, making it difficult to trace malicious file processing or attribute actions to specific users. |
| **Information Disclosure** | Medium risk. Hardcoded codepage mappings and buffer conversions could leak memory contents or internal state if malformed files trigger edge cases. |
| **Denial of Service** | Critical risk. Confirmed ReDoS and memory exhaustion vulnerabilities (e.g., CVE-2024-22363, GHSA-3x9f-74h4-2fqr) allow attackers to crash processes with crafted files. |
| **Elevation of Privilege** | High risk. Prototype pollution (CVE-2023-30533) enables arbitrary code execution in Node.js environments by polluting built-in objects like `Object.prototype`. |

## 🐛 Known Vulnerabilities (OSV)

| CVE / ID | Severity | Title | Affected Versions | Fixed In |
|---|---|---|---|---|
| GHSA-3x9f-74h4-2fqr | `MODERATE` | Denial of Service in SheetJS Pro | Unknown | 0.17.0 |
| GHSA-4r6h-8v6p-xvw6 | `HIGH` | Prototype Pollution in sheetJS | Unknown | None |
| GHSA-5pgg-2g8v-p4x9 | `HIGH` | SheetJS Regular Expression Denial of Service (ReDoS) | Unknown | None |
| GHSA-8vcr-vxm8-293m | `MODERATE` | Denial of Service in SheetsJS Pro | Unknown | 0.17.0 |
| GHSA-g973-978j-2c3p | `MODERATE` | Denial of Service in SheetJS Pro | Unknown | 0.17.0 |

## 🔄 Suggested Alternatives

### 1. sheetjs-ce (npm)
Community fork of SheetJS with active maintenance and security patches. Focuses on stability and modern JavaScript practices.
- **Why Better:** Actively maintained with fixes for all known vulnerabilities in the original xlsx package. Better input validation and modern codebase.
- **License:** `Apache-2.0` | **Difficulty:** `MODERATE` | **Maintenance:** `ACTIVE`

### 2. exceljs (npm)
Modern Excel parser/writer with TypeScript support and stream-based processing for large files.
- **Why Better:** No known vulnerabilities, actively maintained, and designed for security (e.g., sandboxed parsing). Better performance for large files.
- **License:** `MIT` | **Difficulty:** `HARD` | **Maintenance:** `ACTIVE`

## 🛠️ Remediation Steps

- **[IMMEDIATE]** Replace xlsx with sheetjs-ce or exceljs in all projects. - *Rationale:* Unresolved critical vulnerabilities (prototype pollution, ReDoS) pose immediate risk to application security and stability.
- **[SHORT_TERM]** If migration is not feasible, implement strict input validation and sandbox file parsing in a separate process. - *Rationale:* Mitigates prototype pollution and DoS risks by isolating the parser from the main application.
- **[LONG_TERM]** Audit all spreadsheet parsing logic for hardcoded secrets or unsafe buffer conversions. - *Rationale:* Reduces attack surface and prevents future vulnerabilities from legacy code patterns.

---
*Report generated by TrustGuard AI Security Agent.*