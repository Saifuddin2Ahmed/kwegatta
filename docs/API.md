# Kwegatta REST API Reference

The Kwegatta backend exposes a set of REST endpoints for member matchmaking, Gemma 4 open-weight AI inference, event networking, data synchronization, and administration.

## Route Authorization Matrix

| Method | Endpoint | Caller / Role | Description | Enforced At (server.ts) |
|---|---|---|---|---|
| `GET` | `/api/config` | Anyone | Public app config and canonical URL | `server.ts:2640` |
| `GET` | `/api/health/status` | Anyone | Monitoring probe for storage and model health | `server.ts:2649` |
| `GET` | `/api/avatar/:id` | Anyone | Cached member avatar with ETag and 304 validation | `server.ts:2671` |
| `GET` | `/api/sync` | Anyone / Member | Combined delta sync endpoint with visibility pause | `server.ts:2715` |
| `GET` | `/api/announcement/pinned` | Anyone | Active pinned banner for the community | `server.ts:2776` |
| `POST` | `/api/gemma` | Member (Signed-in) | Open-weight Gemma inference via predefined tasks | `server.ts:1549` |
| `POST` | `/api/gemma/stream` | Member (Signed-in) | Server-Sent Events stream with 4s hedging | `server.ts:1614` |
| `POST` | `/api/ai/ask-kwegatta` | Member (Signed-in) | Natural language search across active members | `server.ts:1860` |
| `GET` | `/api/events` | Anyone / Member | Upcoming and past events & opportunities | `server.ts:2971` |
| `GET` | `/api/events/:id` | Anyone / Member | Event detail, attendees (names/photos only), suggested matches | `server.ts:2996` |
| `POST` | `/api/events/:id/rsvp` | Member (Signed-in) | Toggle attendance ("I'm going" / "Interested") | `server.ts:3080` |
| `POST` | `/api/events` | Admin Only | Create new event or opportunity (notifies members) | `server.ts:3121` |
| `PATCH` | `/api/events/:id` | Admin Only | Edit or publish/unpublish event or opportunity | `server.ts:3196` |
| `DELETE` | `/api/events/:id` | Admin Only | Delete or unpublish event or opportunity | `server.ts:3262` |
| `GET` | `/api/events/:id/export` | Admin Only | Export attendee list to CSV (Name, Role, Headline, Email, Status) | `server.ts:3289` |
| `POST` | `/api/admin/announcement/pin` | Admin Only | Pins an announcement banner | `server.ts:2780` |
| `POST` | `/api/admin/announcement/unpin` | Admin Only | Unpins the current announcement banner | `server.ts:2815` |
| `GET` | `/api/admin/status` | Anyone | Check caller's admin status & whether fallback is enabled | `server.ts:2837` |
| `GET` | `/api/admin/admins` | Admin Only | View list of configured and stored admin emails | `server.ts:2848` |
| `POST` | `/api/admin/admins` | Admin Only | Add another admin by email address | `server.ts:2864` |
| `DELETE` | `/api/admin/admins/:email` | Admin Only | Remove an admin email address | `server.ts:2894` |
| `POST` | `/api/admin/members/:id/suspend` | Admin Only | Suspend member (hides from matching/lists) | `server.ts:2918` |
| `POST` | `/api/admin/members/:id/unsuspend` | Admin Only | Restore a suspended member | `server.ts:2944` |
| `GET` | `/api/auth/me` | Member | Returns current authenticated profile | `server.ts:1118` |
| `POST` | `/api/auth/claim-profile` | Anyone / Member | Links anonymous onboarding profile to Firebase UID | `server.ts:1134` |
| `POST` | `/api/auth/token` | Member | Verifies and refreshes local member credentials | `server.ts:1168` |
| `POST` | `/api/connect` | Member | Sends connection notification to a target member | `server.ts:2528` |
| `POST` | `/api/reports` | Anyone / Member | Files a member safety or abuse report | `server.ts:2298` |
| `DELETE` | `/api/profiles/:id` | Owner / Admin | Permanently deletes member account & data | `server.ts:2578` |
| `GET` | `/api/data/:collection` | Anyone / Member | Sanitized public database collections | `server.ts:3321` |
| `POST` | `/api/data/:collection` | Member (or Onboard) | Creates records in profiles, posts, follows | `server.ts:3407` |
| `PATCH` | `/api/data/:collection/:id` | Owner / Admin | Updates profile, post, or member record | `server.ts:3624` |
| `DELETE` | `/api/data/:collection/:id` | Owner / Admin | Deletes record with resource-level auth | `server.ts:3783` |
| `POST` | `/api/upload-photo` | Member / Owner | Uploads and optimizes custom profile photo | `server.ts:3832` |
| `POST` | `/api/admin/login` | Fallback Admin | Emergency passcode login (ADMIN_FALLBACK=true only) | `server.ts:2021` |
| `GET` | `/api/admin/overview` | Admin Only | Aggregate metrics across members and roles | `server.ts:2099` |
| `GET` | `/api/admin/members` | Admin Only | Full list of members including hidden profiles | `server.ts:2182` |
| `GET` | `/api/admin/posts` | Admin Only | Complete list of all member feed posts | `server.ts:2187` |
| `POST` | `/api/admin/action` | Admin Only | Administrative actions and moderation | `server.ts:2192` |
| `GET` | `/api/admin/audit-log` | Admin Only | Audit trail with performing admin's name | `server.ts:2277` |
| `GET` | `/api/admin/reports` | Admin Only | Safety reports submitted by members | `server.ts:2322` |
| `POST` | `/api/admin/reports/:id/action` | Admin Only | Resolves or dismisses safety reports | `server.ts:2328` |
| `GET` | `/api/admin/export` | Admin Only | Exports members and posts in JSON/CSV format | `server.ts:2348` |
| `POST` | `/api/admin/import` | Admin Only | Restores member profiles from JSON backup | `server.ts:2382` |

## Security & Privacy Rules

1. **Gemma Task Enforcement & Rate Limiting**:
   - Both `/api/gemma` and `/api/gemma/stream` require an authenticated member session; anonymous callers receive HTTP 401.
   - Free-form browser prompts are prohibited. Requests must supply a recognized task identifier: `polish_profile`, `match`, `tag_post`, `ask`, or `event_matches`. Unknown tasks yield HTTP 400.
   - Input payloads are strictly capped at 8,000 characters; outputs are capped at 800 tokens (`maxOutputTokens: 800`).
   - Per-member rate limits: 20 calls/minute, 300 calls/day. Exceeding members receive HTTP 429 with `Retry-After`.
2. **Email & Phone Number Privacy**:
   - `email` and `account_uid` are stripped from all public endpoints.
   - Event attendee listings on `/api/events/:id` display names, roles, and avatar URLs only; emails and phone numbers are never returned.
   - Attendee emails are accessible exclusively to verified administrators via `/api/events/:id/export`.
3. **Admin Account Access Control**:
   - Admin privileges belong to authenticated user accounts whose email exists in `ADMIN_EMAILS` or the persisted admin list.
   - If `ADMIN_EMAILS` is empty (and no admin accounts exist), administrative endpoints are unreachable (HTTP 401 Unauthorized), not open.
   - The emergency `ADMIN_CODE` login endpoint `/api/admin/login` is disabled by default and only operates when `ADMIN_FALLBACK=true`.
   - Every administrative action is recorded in the immutable audit log accompanied by the administrator's name.
4. **Open-Weight Gemma Model Guard**:
   - All AI calls pass through `validateGemmaModelId()`, which strictly allows `gemma-4-26b-a4b-it` and `gemma-4-31b-it`.

