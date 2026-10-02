# Contributing to Kwegatta

Thank you for your interest in contributing to **Kwegatta**! We are building an open-source student and builder networking platform aligned with the **Digital Public Goods Standard**, first launched at **Hacktoberfest 2026 Hack Day Kampala x Makerere University Business School (MUBS)**.

Whether you are fixing a typo, designing a better empty state, improving matchmaking logic, or writing documentation, every contribution helps students find the peers they should build and learn with.

---

## Code of Conduct

This project is governed by the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to `conduct@kwegatta.org`.

---

## Ways to Contribute

### 1. Good First Issues for Beginners

If you are new to open-source or web development, check out our repository issues tagged `good first issue` and `hacktoberfest`. Great starting points include:
* Improving responsive layout on ultra-small mobile screens (< 360px).
* Adding new campus demo cohorts in `server.ts` (e.g., Makerere Main Campus, Kyambogo, MUST).
* Polishing Primer-styled accessibility badges and ARIA labels.
* Adding unit tests for heuristic match calculations and keyword extraction.
* Translating onboarding prompts into local languages (e.g., Luganda, Swahili).

### 2. Reporting a Bug

Before submitting an issue, search existing issues to see if the bug has already been reported.

To submit a new bug report:
1. Open the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md).
2. Clearly describe the problem and include reproducible steps.
3. Specify your device, browser, and whether you were running in local or production mode.
4. If applicable, mention if Gemma 4 AI was active or if the keyword fallback was in use.

### 3. Suggesting an Enhancement or Feature

We welcome ideas that make student collaboration more accessible:
1. Open the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md).
2. Explain the problem student builders are facing and how your proposed feature solves it.
3. Keep our core constraints in mind:
   * **AI Constraint**: We strictly call ONLY the open-weight model `gemma-4-31b-it`. Closed models (e.g. Gemini, GPT) are never permitted.
   * **Privacy Constraint**: Sensitive contact information (e.g. WhatsApp phone numbers) must remain protected until an intentional peer connection occurs.
   * **No Hallucinations**: AI may only synthesize facts explicitly provided by members; it must never invent credentials.

### 4. Opening a Pull Request (PR)

1. **Fork the Repository**:
   Click "Fork" on GitHub and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/kwegatta.git
   cd kwegatta
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY for local Gemma 4 testing
   ```

4. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or fix/your-bug-fix
   ```

5. **Make Your Changes**:
   * Follow GitHub Primer design principles (6px radius, system fonts, clear contrast, dark/light theme support).
   * Ensure sentence case and plain English in all user-facing copy.
   * Never commit secret keys or put API keys into client-side files.
   * Verify build and type integrity:
     ```bash
     npm run lint
     npm run build
     ```

6. **Submit PR**:
   * Push your branch to GitHub and open a Pull Request using our [PR Template](.github/PULL_REQUEST_TEMPLATE.md).
   * Reference any relevant issue number (e.g., `Fixes #12`).
   * Include screenshots or a short screen recording for UI changes.

---

## Coding Standards & Architectural Guardrails

* **TypeScript**: Strict typing across all components and API services.
* **Server-Only AI Calls**: All model invocations go through `POST /api/gemma` in `server.ts`. Never call AI endpoints from React components directly.
* **Model ID**: The model identifier must always be `gemma-4-31b-it`.
* **Zero Disruption Fallback**: If the upstream model times out or returns an error, the application must gracefully degrade to keyword matching without crashing.
* **Data Sovereignty**: Maintainers must adhere to the data privacy and export mechanisms outlined in `PRIVACY.md` and `docs/DPG-ALIGNMENT.md`.

---

## Recognition & Attribution

All contributors are recognized in [TEAM.md](TEAM.md) and repository release notes. Thank you for making open-source learning and peer building possible!
