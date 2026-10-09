# Changelog

All notable changes to **Kwegatta** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.1] - 2026-10-09

### Changed
- **Privacy & Resource Isolation**:
  - Protected `GET /api/data/notifications`: requires authenticated member; returns strictly notifications where `to_id` matches caller profile id.
  - Protected `GET /api/data/matches`: requires authenticated member; returns strictly matches where caller is `a_id` or `b_id`.
  - Protected `GET /api/data/follows`: requires authenticated member; returns strictly rows where caller is follower or following.
  - Excluded private collections from unauthorized requests (anonymous callers receive HTTP 401).
  - Public follower and following counts served with public profiles as numbers without leaking individual relation rows.
  - Public live projector wall endpoint at `GET /api/wall/feed` returning strictly first names, avatars, scores, and match spark sentences.
- **Service Worker & Update Notification**:
  - Fixed "A new version is ready" notification bar to display only when replacing an existing controller, never on first install.
  - Positioned slim bar above mobile navigation tab bar, dismissible per session via `sessionStorage`.
  - Upgraded service worker cache name to `kwegatta-1.3.1`.
- **UI Contrast & Centered Footer**:
  - Replaced footer with centered design across all screen sizes, featuring top gold-to-teal gradient line, outlined pill buttons, and removal of "Made in Kampala".
  - Renamed "Inbox & Notifications" to "Inbox" throughout the application.
  - Introduced `--gold-text` and `--teal-text` high-contrast tokens for WCAG AA compliance in light mode (`#8A6100` and `#0B6F66`), maintaining bright accents in dark mode.
  - Raised dark mode caption text contrast to exceed 4.5:1.
  - Redefined `.text-xs` utility to 13px at 1.45 line-height globally.
  - Fixed mobile card layout for long names to wrap cleanly without overlapping the Follow button.
  - Fixed people directory search field icon padding.
  - Standardized About page story and copy ("A short guided chat, about 2 minutes", sentence-case headings).
- **SEO & Profile Migration**:
  - Added dedicated `/robots.txt` and `/sitemap.xml` with appropriate MIME types.
  - Added migration v3 (`saifuddin_profile_migration_v3`) setting skills to empty array for Saifuddin's profile.
  - Suppressed "Core competencies" display when member skills list is empty.

---

## [1.3.0] - 2026-10-08

### Changed
- **PWA Service Worker & Cache (`public/sw.js`)**:
  - Upgraded service worker cache name to `kwegatta-1.3.0`.
- **UI Polish & Contrast**:
  - Removed fetch interceptor override in `index.html`.
  - Redesigned and streamlined `Footer.tsx` with mobile-first grid, sentence-case headings, and open-weight Gemma 4 documentation link.
  - Implemented system-aware color scheme with cycle switch (System → Light → Dark) and zero-flash inline head initialization script.
  - Full WCAG AA compliant light mode palette with gold/teal accents and high-contrast dark text.
  - Self-hosted Inter and Space Grotesk woff2 fonts with local font-face definitions, removing Google Fonts external connections and updating CSP.
  - Standardized font sizing across the app with minimum user-facing text size of 13px.
  - Unified container layout (`.kw-container`, max 1200px, 16px mobile/24px desktop) and 24px/40px vertical rhythm across all inner pages.
  - Simplified navigation: single desktop header row, visitor vs authenticated item segmentation, mobile bottom tab bar with visual indicators, and non-blocking update notification toast.
  - Honest numbers: concealed small counters and stat tiles until network reaches 25 members (`MIN_MEMBERS_FOR_STATS = 25`), deduplicated live wall pairs, and verified profile badge labeling.
  - Profile migration v2 (`saifuddin_profile_migration_v2`): appended Al Neelain University degree sentence to bio, updated tags, and updated core competencies skills without Gemma rewriting or touching account credentials.

---

## [1.2.1] - 2026-10-07

### Changed
- **PWA Service Worker Cache Strategy (`public/sw.js`)**:
  - Network-first caching for page navigations, `/`, and `/index.html` to guarantee visitors always receive the latest release, falling back to cache when offline.
  - Hashed `/assets/` served cache-first.
  - Stale-while-revalidate strategy for icons, manifest, and static images.
  - Upgraded cache bucket to `kwegatta-1.2.1` with automatic stale cache eviction on activate.
  - Retained `skipWaiting` and `clients.claim` with new version notification bar: "A new version is ready" with a "Refresh" button.
- **Server Cache-Control Headers (`server.ts`)**:
  - Added `Cache-Control: no-cache` for `index.html` and `sw.js`.
  - Added long-lived immutable caching (`Cache-Control: public, max-age=31536000, immutable`) for `/assets/`.

---

## [1.2.0] - 2026-10-07

### Added
- **Security Hardening**:
  - Administrative endpoint protected by timing-safe authentication, 15-minute lock after 5 failed attempts, and persistent audit logging.
  - Strict security headers (`Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and granular `Content-Security-Policy`).
  - Zero-vulnerability dependency chain with `@grpc/grpc-js` and `uuid` overrides.
- **Scale & Performance**:
  - Account-aware rate limiting: 240 req/min for authenticated members and 1200 req/min for visitor networks.
  - Efficient `/api/avatar/:id` endpoint with HTTP 304 ETag caching, reducing member list payloads by >90%.
  - Combined `/api/sync` delta endpoint polling every 30s with tab visibility detection.
  - Full code-splitting for admin, wall, onboarding, and share card modals, reducing initial JS bundle to 210 kB gzip.
- **First-Day Experience**:
  - Empty state onboarding with "What happens next" guide, "Invite people" action with personalized QR code and link, and "Share my profile".
  - Accessible AuthModal with focus trap, Escape key closing, and focus restoration.
  - System health monitoring endpoint at `GET /api/health/status`.
  - Comprehensive unit test suite with Vitest in CI workflow.

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
