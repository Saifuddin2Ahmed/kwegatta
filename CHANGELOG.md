# Changelog

All notable changes to **Kwegatta** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-10-06

### Added
- **Designated Open-Weight Models (`gemma-4-26b-a4b-it` default & `gemma-4-31b-it` alternative)**:
  - Default production inference model upgraded to `gemma-4-26b-a4b-it`, delivering 732ms avg TTFT (~24x speedup) and 100% benchmark reliability.
  - Retained `gemma-4-31b-it` as designated high-capacity alternative.
  - Published comprehensive benchmark comparison table in `docs/AI-USAGE.md`.
- **Member Safety (Report & Block)**:
  - Added "Report profile" and "Block member" in a "More" menu next to Connect and Follow on another member's profile (`/#/u/:id`), along with direct quick-action buttons.
  - Connected reports to the `/admin` dashboard under Safety Reports for instant moderation review.
- **Profile Photo Controls**:
  - Added visible "Change photo" button on "My profile" with real-time feedback (preview, processing spinner, confirmation checkmark, error retry).

### Changed
- **Privacy Standard Alignment**:
  - Replaced heading on `/privacy` with "Aligned with the Digital Public Goods Standard", ensuring clear self-assessment language without implying formal certification.
- **Sign-up Resilience**:
  - Profiles are committed immediately to Firestore before AI synthesis, preventing answer loss on network dropouts.

---

## [1.0.0] - 2026-10-02 — Hack Day Kampala Release

### Added
- **PWA & Mobile Installability**:
  - Web app manifest with 192px and 512px icons, maskable icons, and standalone theme support.
  - Service worker caching for fast offline shell loading.
  - In-header and profile install prompts with special guidance for iPhone users.
- **Living Network Hero (Moment 1)**:
  - Interactive canvas showing real members as drifting nodes connected by dynamic match lines.
  - Live counters for real active members, matches made, and posts.
  - Recent matches ticker with smooth animation and reduced-motion fallback.
- **Reactive Onboarding Chat (Moment 2)**:
  - Typing indicator and contextual reactive guidance for each step.
  - Dynamic suggested chips for offers, needs, and teachings.
  - Stepper progress line with checkmarks and estimated completion time.
  - Staggered profile reveal upon Gemma 4 synthesis.
- **Refined Match Experience (Moment 3)**:
  - Overlapping rings avatar presentation with animated score counter from 0 to final percentage.
  - First match confetti burst and mobile vibration feedback.
  - One-tap WhatsApp connect with instant message preparation.
- **Privacy Plan & Open Contact Model**:
  - Open contact: Any signed-in member can view another member's WhatsApp number and connect in one tap.
  - Clear sign-up prompt explaining WhatsApp visibility with an optional toggle to hide (default: visible).
  - Anonymous caller protection: phone numbers are never returned to unauthenticated requests.
  - Phase 0 security: strict authentication token validation, ownership protection on writes/deletes, and sliding-window rate limiting on all API routes.

### Changed
- Official Kwegatta linked-rings branding (`kwegatta-mark.svg`, `kwegatta-icon.svg`) applied across headers, favicons, PWA icons, and about view.
- High-contrast gold and teal palette with WCAG compliant text shades and smooth hover/press states.
- Replaced public "Setup" link with secured administration access inside `/admin`.

---

## [0.1.1] - 2026-10-02

### Added
- Digital Public Goods Standard alignment with JSON data export and permanent profile deletion.
- Deterministic initials avatar fallback system.
- Gemma 4 open-weight model timeout increase (90s) and minimal thinking tokens configuration for 60% faster inference.

---

## [0.1.0] - 2026-10-02

### Added
- Initial release for **Hacktoberfest 2026 Hack Day Kampala x MUBS**.
- Conversational onboarding powered by `gemma-4-31b-it`.
- GitHub REST API enrichment for public repositories and languages.
- Heuristic fallback matchmaking engine.
- Peer learning mentor pairing in the Learn tab.
- Projector wall view at `/wall` for hackathon halls.
