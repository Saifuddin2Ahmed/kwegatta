# Changelog

All notable changes to **Kwegatta** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.2] - 2026-10-15

### Added & Fixed (Release 1.9.2)
- **Check-in scanner: viewfinder, faster auto-capture, clear camera errors; typo-tolerant ticket codes**:
  - Created shared `src/components/QrScanner.tsx` with a square viewfinder, gold corner brackets, dimmed outer mask, scan line animation (`prefers-reduced-motion` safe), ~120ms `requestAnimationFrame` decode loop (`BarcodeDetector` with cropped `480×480` `jsQR` fallback), audio/haptic feedback, 1.5s post-detect flash & auto-resume, and a 3s per-code cooldown.
  - Added clear camera status states ("Starting camera…", permission denied instructions with "Try again", "No camera available — use the ticket code below.", and "Switch camera").
  - Updated `HostScannerModal.tsx` with live `"Checked in X / Y"` counter, clear status-mapped error messages (409, 404, 403, 503, network), and auto-formatted manual code input (`ABCDE-FGHIJ`).
  - Added shared `src/lib/ticketCode.ts` (`normalizeTicketCode`, `isValidTicketCode`, `formatTicketCode`) used across server and client so lowercase, spaces, hyphens, `KWG1:` payloads, and `0→O`/`1→I`/`8→B` substitutions resolve seamlessly.

## [1.9.1] - 2026-10-15

### Fixed (Release 1.9.1)
- **Tailwind v4 `@layer components` Precedence Fix**: Moved custom `.kw-*` component classes (`.kw-input`, `.kw-textarea`, `.kw-btn*`, `.kw-card`, `.kw-badge*`, `.kw-container`) into `@layer components { ... }` in `src/index.css` so Tailwind utility classes (such as `pl-10` on search inputs) properly override base component padding and prevent search icon overlap at 375px and across viewports.

## [1.9.0] - 2026-10-15

### Added & Fixed (Release 1.9.0)
- **"People to meet here" AI Event Networking**: Signed-in event attendees receive AI-ranked matches of fellow attendees using Gemma task `event_matches` (with heuristic fallback, 6h caching, and rate limiting). Includes thumbs up/down feedback (`POST /api/events/:id/people-to-meet/feedback`), feedback persistence (`event_match_feedback` collection with Firestore `onSnapshot` listener), and opt-in/opt-out toggles per event (`match_optout_ids`).
- **Host & Admin Summary**: Event hosts and platform admins view total opt-in counts ("N attendees opted into matching") without individual match pairs.
- **Member Data Cascade Cleanup**: `cascadeDeleteMemberData` cleans up member feedback rows and removes member IDs from event `match_optout_ids`.
- **Search Box UX Fix**: Added `pl-10` padding and `pointer-events-none` positioning to the search input icon across event search inputs.

## [1.8.2] - 2026-10-15

### Fixed (Release 1.8.2)
- **Form Validation for Events**: Added `noValidate` to event creation and editing forms. Implemented inline field validation error messaging, scrolling and focusing the first invalid field, displaying error toasts (rendered above modals via `z-[100]`), and re-enabling submit buttons on completion or failure.
- **Cover Image Cards**: Event list cards display a 16:9 cover image banner with rounded top corners, `loading="lazy"`, `decoding="async"`, and `alt` text, or a gradient placeholder with the event's first letter when no cover image is provided.
- **Image Caching**: Updated `/api/event-image/:id` response headers to send `Cache-Control: public, max-age=3600` alongside `ETag`.

## [1.8.1] - 2026-10-15

### Fixed & Security (Release 1.8.1)
- **Lockfile & CI**: Updated `package-lock.json` with missing dependencies (`nodemailer`, `@types/nodemailer`, `jsqr`) for `npm ci` compatibility; removed `bun.lock`; added CI lockfile integrity test.
- **Ticket Secret Security**: Restricted HMAC derivation exclusively to `TICKET_HMAC_SECRET` (removing fallback to `ADMIN_CODE` and hardcoded secrets). Gracefully disables ticket endpoints with HTTP 503 "Check-in is not configured" when secret is unconfigured or under 32 characters in production.
- **Bundle Optimization**: Converted `jsQR` and host camera scanner UI to lazy-loaded dynamic imports (`React.lazy` / `import()`), returning main bundle to 1.6.0 size.

## [1.8.0] - 2026-10-14

### Added & Improved (Release 1.8.0)
- **Check-in (host scan + venue QR self check-in) + confirmation email**:
  - **Check-in records & personal tickets (`event_checkins`)**: Private collection with Firestore snapshot listener and cascade deletion on profile removal. 10-character base32 personal ticket codes stored only as SHA-256 hashes (`KWG1:<eventId>:<code>` QR payload with zero personal data), invalidated on RSVP/guest cancellation.
  - **Host ticket scanner & manual check-in**: `POST /api/events/:id/checkin` and host "Check in guests" scanner (`getUserMedia` + `BarcodeDetector` with `jsQR` fallback) plus manual check-in list and search.
  - **Venue QR self check-in**: Per-event `Allow self check-in` toggle (`self_checkin_enabled`), full-screen rotating 30s HMAC QR display (`#/checkin/<eventId>/<token>`), and `POST /api/events/:id/self-checkin` for RSVP'd members and registered guests with rate limiting and 15-minute failed guest-email lockout.
  - **Attendees panel & CSV export**: Added `Checked in` / `Not yet` tabs, live check-in counter, `checked_in_at` and `method` columns in CSV export, and `Permissions-Policy: camera=(self)`.
  - **Confirmation email with `.ics` attachment**: Optional Gmail SMTP (`nodemailer`) confirmation email on RSVP and guest registration with `.ics` calendar invite and ticket link (silently disabled when SMTP env vars are absent; capped at 400/day).

## [1.6.1] - 2026-10-14

### Fixed (Release 1.6.1)
- Fix: events, guest registrations and questions are now loaded from the database after a restart (`onSnapshot` listeners added for `events`, `event_guests`, and `event_questions` in `setupFirestoreListeners()`, completing initial load before migrations/cleanups, with audited `PERSISTED_COLLECTIONS`).

## [1.6.0] - 2026-10-14

### Added & Improved (Release 1.6.0)
- **Complete event management (attendees panel, capacity, tags, venue)**:
  - **Host "Attendees" panel**: Prominent `Attendees (N)` button on the event detail and host's event card (visible to event author and admins only, where `N = members + guests`). Opens a view-only panel with `All · Members · Guests` tabs, name search, avatar/initials, type badge (`Member` / `Guest`), registration timestamp, member profile links, host/admin-only guest emails, and `Export CSV` (`name, type, email (guests only), registered_at`).
  - **Host status**: Event authors see a `You're hosting` badge in place of the RSVP button.
  - **Capacity**: Optional capacity (1–5000, empty = unlimited) in create/edit forms, validated on the server. Displays `X spots left` when capacity is set and `Full` (with disabled RSVP/Register button) when full; server blocks both member RSVPs and guest registrations when full.
  - **Event tags**: Up to 5 tags (≤ 24 chars, lowercase letters/numbers/hyphens) sanitized on the server, displayed as chips on cards and detail pages, and searchable from the events list.
  - **Venue & Map link**: `Venue / address` (≥ 5 chars) required when saving `in_person` or `hybrid` events (existing events without a venue remain viewable). Optional `Map link` (`https://` Google Maps or OpenStreetMap only) displays `Open in Maps` on the event page.
  - **API 404**: Unknown `/api/*` routes return `404` JSON `{ error: "Not found" }` instead of SPA HTML.

## [1.5.13] - 2026-10-14

### Fixed (Release 1.5.13)
- **Fix: editing a post no longer removes its reactions**:
  - Removed destructive deletion of `existing.reactions`, `existing.reactions_by`, and `existing.reaction_counts` in `PATCH /api/data/posts/:id` so post edits preserve member reactions, legacy reactions, and comments.
  - `PATCH /api/data/posts/:id` continues stripping reaction and comment fields from the request body and returns the public sanitized post shape (`reaction_counts` and `my_reaction`, without `reactions_by`).

## [1.5.12] - 2026-10-14

### Fixed (Release 1.5.12)
- **Fix: one reaction per member, comments saved for everyone, SVG reaction icons**:
  - Server-side reaction tracking (`POST /api/posts/:id/react`) enforces one reaction per member, toggling off on repeat and replacing on change.
  - Server-side comments handling (`POST /api/posts/:id/comments`, `DELETE /api/posts/:id/comments/:cid`) protects against author spoofing and enforces deletion permissions.
  - Public post responses exclude internal `reactions_by` and return computed `reaction_counts` and caller `my_reaction` (including legacy reaction mapping).
  - FeedView updated with Lucide SVG reaction icons, accessibility (`aria-pressed`, `aria-label`), optimistic updates with rollback, and comment deletion.

## [1.5.11] - 2026-10-14

### Security (Release 1.5.11)
- **Security fixes (pair-cache, account deletion, connect limits)**:
  - **Match Pair Cache**: Authenticated endpoints (`GET` and `POST /api/matches/pair-cache`) require the caller to be one of the paired members (or an admin); reject requests with 401 or 403 otherwise. Validates that cached result objects strictly contain only `score` (0–100) and `reason` (≤ 300 chars, sanitized), rejecting extra fields or invalid inputs with 400. In-memory pair cache is capped at 5,000 entries with LRU/oldest-updated eviction. Client calls include authorization headers.
  - **Comprehensive Account Deletion Cascade**: Permanent profile deletion cascades across all associated data: authored events (along with their guests, questions, and uploaded cover images), attendee lists in other events, questions asked and host replies, moderation reports (anonymized to 'deleted-member'), team member profile linkages (set to null), and match pair cache entries. `PrivacyView` updated with complete deletion disclosures.
  - **Connection Request Rate Limits & Duplicate Prevention**: `POST /api/connect` limits members to at most 5 requests per minute and 20 per day (returning 429), prevents duplicate requests to the same member within 7 days (returning 409), while exempting administrators from limits.

## [1.5.10] - 2026-10-13

### Changed (Release 1.5.10)
- **Admin: remove a team member's photo; hidden team members and raw photos are no longer exposed publicly**:
  - Admin team editor includes a "Remove photo" action with confirmation to restore initial letter placeholder.
  - Team member photos can be cleared via `PATCH /api/admin/team/:id` with `{ photo: '' }`.
  - Public endpoints (`/api/data/team` and `/api/team`) exclude hidden members and return `photo_url` instead of raw base64 data.
  - `GET /api/team-photo/:id` returns 404 for hidden members and members without photos.
  - `AboutView` updated to display team member images via `photo_url`.

## [1.5.9] - 2026-10-13

### Fixed (Release 1.5.9)
- **Fix: easier role and intent selection; tap removes, star sets main role**:
  - Tapping a selected chip removes it across roles and intents.
  - Tapping an unselected chip at the limit replaces the last selected item.
  - Role chips support setting the main role via a star (★) button, labeling the first chip "Main", with a helper line.
  - Intents display an "x / 3 selected" counter and helper line.
  - Stage allows deselection on tapping the selected choice again.
  - Save button in Edit Profile disabled with "Pick at least one role" when roles list is empty.
  - Shared `toggleChoice` and `makeFirst` logic in `src/lib/profileChoices.ts` applied across Edit Profile and Onboarding.

## [1.5.8] - 2026-10-13

### Fixed (Release 1.5.8)
- **Fix: profile photo now appears on the downloaded share card**:
  - Updated `ShareCardModal.tsx` `avatarSrc` helper to support same-origin paths (`/api/avatar/...`).
  - Added 5-second timeout for image loading with initial letter fallback.
  - Implemented aspect-ratio cover cropping inside the avatar circle.
  - Added automatic fallback and redraw if drawing taints the canvas and `toDataURL` throws.

## [1.5.7] - 2026-10-13

### Fixed (Release 1.5.7)
- **Fix: saving profile edits no longer removes the profile photo**:
  - Updated client `handleSaveProfile` in `ProfileView.tsx` to send only user-edited form fields without spreading `...profile` (omitting `avatar`, `id`, `account_uid`, `email`, etc.).
  - Added `resolveAvatar` server helper in `server.ts` for profile create/save and PATCH endpoints to safely retain existing profile photo when receiving `/api/avatar/...` or empty values.

## [1.5.6] - 2026-10-13

### Fixed (Release 1.5.6)
- **Fix: intents are multi-select again**: Onboarding and Edit Profile no longer drop intents.
  - Added `normalizeIntent` and `parseIntents` in `src/lib/profileChoices.ts` to support multi-intent strings.
  - Updated server validation (`normalizeIntent`) across profile creation/save, restore, and PATCH endpoints so multi-intent profiles are never wiped or lost.
  - Updated Edit Profile UI in `ProfileView.tsx` to multi-select intent chips (up to 3).

## [1.5.5] - 2026-10-13

### Added (Release 1.5.5)
- **Edit Role, Stage and Intent**: Members can now edit their role, stage and intent from Edit Profile.
  - Extracted shared choices (`ROLE_CHOICES`, `STAGE_CHOICES`, `INTENT_CHOICES`) into `src/lib/profileChoices.ts`.
  - Enforced server-side validation for `roles` (max 2 valid roles, `role` synchronized to `roles[0]`), `stage`, and `intent`.
  - Added "How you appear" section in Edit Profile form with interactive role chip reordering and single-select stage and intent options.

## [1.5.4] - 2026-10-13

### Fixed & Polish (Release 1.5.4)
- **Edit Profile Country & City**: Added searchable country selector and city text input to profile edit form; prefilling city from legacy location when country/city are empty.
- **Team Display**: Rendered only photo, name, university (line2), and GitHub link on public team cards in AboutView.
- **Repository Hygiene**: Deleted `bun.lock`, added CI badge to README, cleaned up team tables in README, TEAM.md, and AUTHORS.
- **Sitemap & Timezone Fallbacks**: Updated sitemap.xml to clean path URLs for static views and updated default timezone fallback to UTC in EventsView.

## [1.5.3] - 2026-10-13

### Added & Changed (Release 1.5.3)
- **Global Onboarding: Country & City Selection**:
  - Replaced Kampala location choices with global location selection: a searchable sorted country selector covering all ISO 3166-1 alpha-2 codes and a free-text city input.
  - Implemented automatic country detection (`guessCountry()`) using browser region and timezone fallback.
  - Removed default 'Kampala' fallbacks across onboarding and events views.
  - Derived profile location dynamically as "City, Country name".
- **Privacy Policy Consent Line**:
  - Added "By continuing you agree to our Privacy Policy." consent link in AuthModal leading directly to `#/privacy`.
  - Recorded server-side consent metadata (`privacy_accepted_at`, `privacy_version = '2026-10'`) upon initial profile creation/save.
  - Protected consent fields from public profile endpoints and public lists.
  - Updated Privacy Policy details in `PrivacyView`.

## [1.5.2] - 2026-10-10

### Fixed & Improved (Release 1.5.2)
- **Guest Registration Modal in Detail View**:
  - Extracted `GuestRegisterModal` into a dedicated component with accessibility focus trap, Escape key handling, backdrop click dismiss, and focus restoration to the trigger button.
  - Rendered `GuestRegisterModal`, Edit modal, Report modal, and Attendee Update modal directly inside the Event Detail view return so they open correctly over the event page without requiring the list view to be mounted.
  - Ensured immediate live updates on successful guest registration without page reloads: Register button transitions to "You're registered" card, going count increments, and host contact card becomes visible.
- **Copy & Plurals Fix**:
  - Corrected attendee count plurals for signed-out visitors: "Be the first to register." (0 attendees), "1 person is going to this event." (1 attendee), and "N people are going to this event." (N attendees).

## [1.5.1] - 2026-10-10

### Fixed & Improved (Release 1.5.1)
- **Part 1: Generic Data Route Allowlist**:
  - Replaced generic blocklist on `/api/data/:collection` with an explicit allowlist across GET, POST, PATCH, PUT, and DELETE methods.
  - Allowed public read: `profiles`, `posts`, `events`, `team`.
  - Allowed signed-in own rows: `notifications`, `matches`, `follows`.
  - Restricted all other collections (`audit_log`, `reports`, `admin_emails`, `migrations`, `event_guests`, `event_questions`, `pinned_announcement`, etc.) to HTTP 404 for all callers including admins.
  - Applied allowlist filter to `/api/sync`.
- **Part 2: Real Client IP & Shared Network Guest Rate Limits**:
  - Added `getClientIp(req)` helper utilizing Express `trust proxy` (configured to trust 1 GFE proxy hop).
  - Used `getClientIp` consistently across guest registration, admin login limiter, global and Gemma rate limiters, and audit log entries.
  - Configured guest registration limits suited for shared university networks: 20 per hour per event, 60 per day per event, 100 per day overall.
- **Part 3: Public Event Data Privacy**:
  - Updated `sanitizeEventForPublic` to build public event objects from explicit field lists rather than spreading `...rest`.
  - Concealed attendee lists (`attendee_ids`, `attendees`) from anonymous callers and non-RSVPed members; provided aggregate `attendee_count` and `i_am_going` status instead.
  - Restricted moderation and internal fields (`hidden_reason`, `report_count`, `under_review`, `reviewed_by_admin`, `approved_by`, `rejection_reason`, `events_blocked`) strictly to the event author and platform admins.

## [1.5.0] - 2026-10-10

### Added & Improved (Release 1.5.0)
- **Part 1: Host Contact Details**:
  - Event forms include optional "Contact for attendees" section with `contact_phone` and `contact_email`.
  - Added "Use my profile WhatsApp" auto-fill button.
  - Restricted visibility on server to author, admins, registered RSVPed members, and guests with valid guest tokens.
- **Part 2: Questions on the Event Page**:
  - Added public read questions section under event description.
  - Signed-in members with complete profiles can post questions (3 to 500 chars).
  - Event host and admins can reply (host badge displayed).
  - Added server routes: `GET /api/events/:id/questions`, `POST /api/events/:id/questions`, `POST /api/events/:id/questions/:qid/reply`, `DELETE /api/events/:id/questions/:qid`.
  - Enforced question limits (5 per event per member, 20 per day per member) and closed posting on cancelled or past events (>7 days).
  - Configured notifications for author on new questions and asker on host replies.
- **Part 3: Admin Moderation Controls**:
  - Added moderation dialogs for Hide, Restore, and Delete on Admin Events tab.
  - Require selection of standard reason (Not a real event, Spam or scam, Offensive, Duplicate, Other with max 300 char note).
  - Author receives notifications when event is hidden, restored, deleted, or auto-hidden after 3 reports.
  - Author sees banner on hidden event with reason and review prompt. All actions logged in audit log.
- **Part 4: Guest Event Registration**:
  - Signed-out visitors can register for events via short form (name, contact, consent checkbox).
  - Added `POST /api/events/:id/guest-register` storing 32-byte raw token SHA-256 hash in separate `event_guests` collection.
  - Private guest token link `#/events/<id>?g=<token>` enables guest viewing registration, host contact details, and cancelling.
  - Implemented server abuse protections: honeypot check, IP rate limits (3/event/day, 10 overall/day), duplicate contact check, capacity check, and closed event checks.
  - Added guest list for author and admins with Remove action. Blocklisted `event_guests` and `event_questions` from generic data/sync routes.
  - Lazy 30-day post-event retention cleanup. Updated `PRIVACY.md` with guest data privacy terms.
- **Part 5: Express Middleware Fix**:
  - Updated error handling middleware to catch malformed JSON body errors and return `400` with `{ "error": "Invalid request body." }`.

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
