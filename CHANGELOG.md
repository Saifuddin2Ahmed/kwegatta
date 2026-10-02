# Changelog

All notable changes to **Kwegatta** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] - 2026-10-02

### Added
- **Digital Public Goods Standard Alignment**:
  - Added full DPG compliance documentation in `docs/DPG-ALIGNMENT.md`.
  - Added "Export my data" button generating a comprehensive JSON download of user profile, posts, follows, matches, and notifications.
  - Added "Delete my profile" button with confirmation modal for unconditional permanent data erasure.
  - Protected WhatsApp phone numbers: Redacted in public member directory API (`GET /api/data/profiles`) and revealed only upon an explicit `POST /api/connect` request.
- **Robust Initials Avatar System**:
  - Added dedicated `<Avatar />` component generating deterministic, accessible Primer-style circles with uppercase initials for any user without an avatar or on image load failure.
- **AI Performance & Latency Improvements**:
  - Increased server timeout for Gemma 4 open-weight model calls from 20s to 90s.
  - Configured `thinkingConfig: { thinkingLevel: 'MINIMAL' }` to reduce unnecessary reasoning token overhead and accelerate response time by over 60%.
  - Added automatic single retry on 500 or timeout errors before falling back to keyword heuristics.
  - Clear UI indicator `Basic match (AI unavailable)` shown whenever fallback heuristic results are displayed.
  - While waiting for model inference, the UI displays `Gemma is picking your matches…`.

### Fixed
- Fixed upstream 500 "Internal error" by removing invalid `temperature` parameter from `gemma-4-31b-it` generation payload.
- Fixed 20-second client timeout by allowing adequate headroom for 31B parameter model chain-of-thought processing.
- Replaced broken avatar images across all views with the unified initials fallback avatar.

---

## [0.1.0] - 2026-10-02

### Added
- Initial public release of Kwegatta for **Hacktoberfest 2026 Hack Day Kampala x MUBS**.
- Guided conversational chat onboarding: asks one question at a time to assemble member profiles.
- GitHub public profile enrichment: fetches public repo count, primary languages, and top 4 repositories via unauthenticated GitHub REST API.
- Open-weight AI profile authoring with `gemma-4-31b-it`: generates headlines, bios, tags, and role classifications using strictly member-provided facts.
- Complementary matchmaking engine: prioritizes complementary offers over similar needs to unite business students with software builders.
- Peer learning matching in "Learn" tab: pairs members with one mentor and one study partner.
- Real-time social feed with auto-tagging and helper recommendations.
- Projector wall view at `/wall` for hackathon auditoriums with live stats, recent matches, and QR code join card.
- GitHub Primer design system: light and dark themes, 6px borders, system typography, and mobile-first responsiveness.
- Pure keyword fallback algorithm to guarantee uninterrupted networking during upstream connectivity disruptions.
- MIT License and open-source documentation.
