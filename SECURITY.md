# Security Policy

The Kwegatta core team takes security, privacy, and responsible disclosure seriously. Because Kwegatta connects students and builders and processes public profile information and private contact details, protecting user data and preserving system integrity is our highest priority.

---

## Supported Versions

Only the latest release on the primary branch is currently supported for security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Reporting a Vulnerability

**Please do NOT file public GitHub issues for security vulnerabilities.**

If you discover or suspect a security flaw in Kwegatta:

1. **Email the Maintainers Privately**:
   Send an encrypted or private email to:
   * **`security@kwegatta.org`**
   * Lead maintainer: **`saifuddin.ai.dev@gmail.com`**

2. **Include the Following Details**:
   * Type of issue (e.g. unauthorized data exposure, CSRF, broken access control, model proxy bypass, denial of service).
   * Exact steps to reproduce the vulnerability or proof-of-concept payload.
   * Affected URLs, endpoints, or components.
   * Potential impact on members or server infrastructure.

---

## Response Commitments

* **Initial Acknowledgement**: Within **48 hours** of receiving your report.
* **Triage & Assessment**: Within **5 business days**, detailing validity and severity.
* **Remediation & Patch**: A fix will be developed in a private branch, verified, and released.
* **Public Disclosure**: Coordinated disclosure after a patch is deployed to production, with full attribution to the researcher.

---

## Security Architectural Guarantees

* **Zero Browser API Keys**: All AI calls to Google's generative endpoints occur strictly on the server backend (`server.ts` or Cloud Run proxy). The `GEMINI_API_KEY` is never transmitted to or executed in client browsers.
* **Contact Privacy & Scrape Protection**: Phone numbers are redacted in public member directory queries (`GET /api/data/profiles`) and are only revealed upon an explicit, logged `POST /api/connect` interaction.
* **Fact-Bounded Prompts**: AI generation pipelines are constrained to facts provided directly by members; the model prompt strictly prohibits inventing credentials.
* **Client-Side Sanitization**: All user-generated text is rendered with React text nodes and sanitized against script injection.
* **Data Sovereignty**: Any member may permanently delete their account or export their complete data archive via the profile settings.
