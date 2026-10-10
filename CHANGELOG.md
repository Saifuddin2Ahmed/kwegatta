# Changelog

All notable changes to **Kwegatta** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.2] - 2026-10-10

### Fixed (Root Fix for Firestore Event Persistence & Error Propagation)
- **Fix 1: Never send undefined to Firestore**:
  - Configured Firestore with `firestoreDb.settings({ ignoreUndefinedProperties: true })` immediately following instance initialization.
  - Implemented recursive `stripUndefined` helper to deeply strip `undefined` properties from objects and arrays across all write paths (set, batch) while strictly preserving `null`, `false`, `0`, and `''`.
- **Fix 2: Never leave a request hanging**:
  - Implemented `asyncHandler` wrapper ensuring all rejected promises from async route handlers are forwarded to Express `next(err)`.
  - Added final Express error handling middleware logging route errors and returning HTTP 500 JSON (`{ error: 'Something went wrong. Please try again.' }`) without leaking internal stack traces.
- **Fix 3: Do not keep an event that was not saved**:
  - Reordered `POST /api/events` to persist to storage via `persistDoc` before adding items to in-memory `store.events`. If persistence fails, the event is rejected with 500 JSON and left out of memory.
  - Applied identical ordering to event notification broadcasts.
- **Fix 4: Show the member what happened**:
  - Updated create and edit forms in `EventsView.tsx` and `api.ts` to handle non-JSON responses and network failures gracefully, displaying `"Could not save the event. Please try again."` and safely re-enabling the submission button.
  - Submit button shows `"Creating..."` and remains disabled while the request is in flight.
- Upgraded service worker cache name to `kwegatta-1.4.2`.

## [1.4.1] - 2026-10-10

### Fixed (Timezone Wall-Clock Conversion & DST Handling)
- Fixed event start/end ISO timestamp generation in `EventsView.tsx`: replaced browser-local `new Date(`${date}T${time}`)` conversion with `zonedTimeToUtcIso(date, time, timeZone)`, converting entered wall-clock date and time in the selected IANA timezone to UTC ISO 8601 timestamps using native `Intl.DateTimeFormat`.
- Correctly handles daylight-saving time (DST) transitions across all IANA time zones without external date libraries.
- Added matching fallback conversion on the server in `validateEventTimesAndFormat` for `start_date` and `start_time` inputs using the event's specified timezone.
- Fixed event editing: the edit modal displays stored UTC timestamps back in the event's own IANA timezone rather than the viewer browser's timezone using `utcToZonedParts`.
- Upgraded PWA service worker cache name to `kwegatta-1.4.1`.

## [1.4.0] - 2026-10-10

### Security Fix (Auth Middleware)
- Hardened server authentication middleware in `server.ts`: removed `!adminAuth` and `token.startsWith('test-')` bypass conditions outside test environments (`NODE_ENV === 'test' || VITEST`).
- In production, if `adminAuth` is unavailable, all requests bearing unverified tokens are strictly treated as unauthenticated (401), logging a clear error at startup.

### Real Event Times & Timezones
- Replaced free-text datetime fields with ISO 8601 UTC timestamps (`starts_at` and `ends_at`) and IANA timezone tracking (defaulting to creator's browser timezone).
- Added structured form fields for start date, start time, end date, end time, and timezone. Enforced that end time is after start time (defaulting to start + 2 hours if omitted), and start time cannot be in the past when creating.
- Introduced format selection (`in_person`, `online`, `hybrid`) with strict location and HTTPS join link validation.
- Viewer time conversion implemented via `Intl.DateTimeFormat` displaying localized viewer time with event origin timezone annotation. Legacy text events remain visible with "Time needs updating" notification.

### Automatic Event Lifecycles
- Dynamic server-side phase calculation at read time (`upcoming`, `live`, `past`) from timestamps without scheduled cron jobs.
- Events view separated into "Upcoming" (soonest first with "Live now" badge) and "Past" (most recent first) tabs with clean one-sentence, one-button empty states.
- Past events automatically close RSVPs with HTTP 409, replace the RSVP button with "Event ended", and conceal online meeting join links.

### Direct Member Publishing (Luma-style)
- Any authenticated member with a completed profile can publish events immediately without pre-approval. Renamed "Suggest an event" to "Create event" across navigation and UI.
- Enforced server rate limits: maximum 3 created events per member per 24 hours and at most 10 active upcoming events per member at once.
- Full author controls to edit details or cancel their event (marking it "Cancelled" and closing RSVPs while preserving the page).

### Post-Publication Moderation & Admin Dashboard
- Added confidential "Report event" feature for signed-in members with structured categories (Not a real event, Spam or scam, Offensive, Other) and optional notes.
- Automatic moderation: events with 3 or more reports from distinct members are hidden from public listings automatically until administrator review (marked "Under review" for authors and admins).
- Admin dashboard Events tab equipped with filters (All, Reported, Hidden, Cancelled), author details, creation timestamps, report counts, and reasons.
- Admin actions: Hide, Restore, Delete, and Block/Unblock author from creating events, with complete audit logging.

### Event Page, ICS & Calendar Sharing
- Dedicated permalink page at `#/events/<id>` showing full cover image, host card, date/time, format, attendee counts, RSVP actions, and moderation reporting.
- Native sharing and "Add to calendar" integrations: prefilled Google Calendar link and RFC 5545 `.ics` file generation and download in the browser.
- Privacy boundary: signed-out visitors see only aggregate attendee counts without individual profile lists or meeting links.

---

## [1.3.3] - 2026-10-09

### Security & Privacy Hardening
- **Part 1: Test Isolation & Production Data Protection**:
  - The test suite is strictly restricted to an isolated in-memory store only (`storageMode: 'memory'`).
  - Added an assertion guard (`assertStorageModeForTest`) that throws immediately if a test run ever attempts to resolve `storageMode` to `"firestore"`.
  - Firestore is never initialized, snapshot listeners are never started, and `persistDoc` cannot call Firestore when `NODE_ENV === 'test'` or `VITEST` is set.
  - Implemented one-time cleanup function (`cleanupTestEvents`) guarded by migration flag `cleanup_test_events_unapproved_author_v1` that permanently removes test events with `author_id === "test-user-unapproved-author"` from Firestore, disk, and in-memory store while deleting nothing else.
- **Part 2: Generic Data Route Event Visibility & Cover Image Sanitization**:
  - Aligned generic route `GET /api/data/events` with `GET /api/events` visibility rules: anonymous callers can only see approved and published events; authors can also see their own pending submissions; platform admins see all submissions.
  - Ensured raw `cover_image` data URLs are never returned from any list or detail route, serving only the sanitized `/api/event-image/:id` URL path.
  - Enforced ownership verification for `PATCH` and `DELETE` on `/api/data/events/:id`.
- **Part 3: Event Cover Image Access Control & Approval Workflow**:
  - In `handleEventImageUpload`: when `event_id` is supplied, callers who are neither the event's author nor a platform admin are rejected with `403 Forbidden` and no changes are made.
  - Successfully persisted cover image updates using `persistDoc`.
  - When an approved/published event receives a new image from a non-admin, non-organiser author, the event status is automatically set back to `pending` and `published: false` for re-review.
  - Added comprehensive test coverage confirming member B cannot alter member A's event image (403) and the author can update their event image.
- **PWA Service Worker**:
  - Upgraded service worker cache name to `kwegatta-1.3.3`.

---

## [1.3.2] - 2026-10-09

### Changed
- **Part 1: Live Wall Feed Data Minimization (`GET /api/wall/feed`)**:
  - Expose per match item strictly `{ id, first_name_a, first_name_b, spark }` with opaque random identifiers.
  - Suppressed member ids, avatar URLs, scores, and match reasons.
  - Projector wall displays initials in coloured circles instead of photos.
  - Filtered out any item with empty spark, length < 20 chars, trailing dangling punctuation/commas, broken punctuation `, .`, or cut-off fragments.
  - Deduplicated pairs across feed cycles.
- **Part 2: Signed-Out 401 Noise Elimination**:
  - Guarded client data fetching for `/api/data/matches`, `/api/data/follows`, and `/api/data/notifications` to only execute once a member is authenticated and their ID token is ready.
- **Part 3: Light-Theme Contrast Hardening**:
  - Replaced raw `#F5B700` and `#12B5A6` text classes with `--gold-text` and `--teal-text` across all views (About page, landing stat tiles, desktop onboarding, mobile active navigation, Matches, Learn, Feed, Inbox, Profile, Admin, and modals).
  - Maintained bright accents on dark-only surfaces (such as the live wall).
- **Part 4: Footer Bottom Lines**:
  - Updated `Footer.tsx` bottom section to two centered lines separated by a 4px gap (`Line 1: © 2026 Kwegatta`, `Line 2: Powered by Gemma 4` linking to Google Gemma docs without "open-weight" here).
- **Part 5: Notifications Modal Popup & Mark as Read**:
  - Clicking any notification in the Inbox opens a centered accessible modal (`role="dialog"`, `aria-modal="true"`, bottom sheet on mobile) displaying sender info, full body text, and relative time.
  - Contextual action buttons: WhatsApp direct link (with consent/number guard), Follow back, and View profile.
  - Trap keyboard focus while open and restore focus to trigger row upon close (Escape key or click outside).
  - Automatically marks notification as read via `PATCH /api/notifications/:id/read` (with user ownership validation) and updates unread badge counter.
- **Part 6: Event Cover Image Support**:
  - Added optional cover image upload to event suggestion and admin create/edit forms.
  - Client-side pre-upload resizing to max 1200px width with JPEG/WebP compression (~80% quality) and 400 KB limit validation.
  - Previews with "Replace" and "Remove" controls before submission.
  - Server-side byte inspection validating JPEG, PNG, and WebP, rejecting SVG and remote URLs.
  - Served via `GET /api/event-image/:id` with `Cache-Control` and `ETag` headers; hidden until admin approval.
  - Fixed 16:9 aspect ratio display with `object-fit: cover` on event cards and detail view; no empty box for events without an image.
  - Event deletion automatically purges associated cover image.
- **Part 7: Service Worker & Quality Assurance**:
  - Upgraded service worker cache name to `kwegatta-1.3.2`.
  - Added security and regression tests verifying upload auth guards, file size/type rejection, and unapproved event visibility controls.

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
