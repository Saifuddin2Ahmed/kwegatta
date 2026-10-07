# Kwegatta REST API Reference

The Kwegatta backend exposes a set of REST endpoints for member matchmaking, Gemma 4 open-weight AI inference, data synchronization, and administration.

## Route Authorization Matrix

| Method | Endpoint | Caller / Role | Description | Enforced At (server.ts) |
|---|---|---|---|---|
| `GET` | `/api/config` | Anyone | Public app config and canonical URL | `server.ts:2255` |
| `GET` | `/api/health/status` | Anyone | Monitoring probe for storage and model health | `server.ts:2268` |
| `GET` | `/api/avatar/:id` | Anyone | Cached member avatar with ETag and 304 validation | `server.ts:2291` |
| `GET` | `/api/sync` | Anyone / Member | Combined delta sync endpoint with visibility pause | `server.ts:2335` |
| `POST` | `/api/gemma` | Anyone | Open-weight Gemma inference with 4s hedging | `server.ts:1252` |
| `POST` | `/api/gemma/stream` | Anyone | Server-Sent Events stream with 4s hedging | `server.ts:1286` |
| `POST` | `/api/ai/ask-kwegatta` | Member | Natural language search across active members | `server.ts:1498` |
| `GET` | `/api/auth/me` | Member | Returns current authenticated profile | `server.ts:988` |
| `POST` | `/api/auth/claim-profile` | Anyone / Member | Links anonymous onboarding profile to Firebase UID | `server.ts:1004` |
| `POST` | `/api/auth/token` | Member | Verifies and refreshes local member credentials | `server.ts:1038` |
| `POST` | `/api/connect` | Member | Sends connection notification to a target member | `server.ts:2152` |
| `POST` | `/api/reports` | Anyone / Member | Files a member safety or abuse report | `server.ts:1920` |
| `DELETE` | `/api/profiles/:id` | Owner / Admin | Permanently deletes member account & data | `server.ts:2200` |
| `GET` | `/api/data/:collection` | Anyone / Member | Sanitized public database collections | `server.ts:2393` |
| `POST` | `/api/data/:collection` | Member (or Onboard) | Creates records in profiles, posts, follows | `server.ts:2475` |
| `PATCH` | `/api/data/:collection/:id` | Owner / Admin | Updates profile, post, or member record | `server.ts:2697` |
| `DELETE` | `/api/data/:collection/:id` | Owner / Admin | Deletes record with resource-level auth | `server.ts:2857` |
| `POST` | `/api/upload-photo` | Member / Owner | Uploads and optimizes custom profile photo | `server.ts:2905` |
| `POST` | `/api/admin/login` | Admin Candidate | 15-minute lock after 5 failed attempts | `server.ts:1657` |
| `GET` | `/api/admin/overview` | Admin | Aggregate metrics across members and roles | `server.ts:1737` |
| `GET` | `/api/admin/members` | Admin | Full list of members including hidden profiles | `server.ts:1820` |
| `GET` | `/api/admin/posts` | Admin | Complete list of all member feed posts | `server.ts:1825` |
| `POST` | `/api/admin/action` | Admin | Administrative actions and moderation | `server.ts:1830` |
| `GET` | `/api/admin/audit-log` | Admin | Audit trail of administrative actions | `server.ts:1915` |
| `GET` | `/api/admin/reports` | Admin | Safety reports submitted by members | `server.ts:1960` |
| `POST` | `/api/admin/reports/:id/action` | Admin | Resolves or dismisses safety reports | `server.ts:1966` |
| `GET` | `/api/admin/export` | Admin | Exports members and posts in JSON/CSV format | `server.ts:1986` |
| `POST` | `/api/admin/import` | Admin | Restores member profiles from JSON backup | `server.ts:2020` |
| `POST` | `/api/demo/seed` | Admin | Seeds initial demo cohort in local storage | `server.ts:2953` |
| `POST` | `/api/demo/clear` | Admin | Clears demo cohort from storage | `server.ts:2972` |

## Security & Privacy Rules

1. **Email & Account Privacy**: `email` and `account_uid` are stripped from all public endpoints. They are returned only when `callerAuthUid === profile.account_uid` (self) or when caller holds a valid admin session (`checkAdmin(req) === true`).
2. **Block List Privacy**: `blocked_ids` is visible only to the profile owner (`callerAuthUid === profile.account_uid`). It is never exposed to other members or public visitors.
3. **Open-Weight Gemma Enforcement**: All AI calls pass through `validateGemmaModelId()`, which strictly allows `gemma-4-26b-a4b-it` and `gemma-4-31b-it`.
