# Data Model & Schemas

This document defines the data structures and storage schemas used in **Kwegatta**, conforming to Cloud Firestore standards and the **Digital Public Goods Standard** for data minimization and privacy.

---

## 1. Privacy Tiers

| Tier | Visibility | Access Rule | Fields |
| ---- | ---------- | ----------- | ------ |
| **Public** | Anyone in room / on web | Visible in member lists, profiles, and projector wall | `name`, `role`, `headline`, `bio`, `offers`, `needs`, `teaches`, `learns`, `tags`, `skills`, `avatar`, `github`, `gh` |
| **Protected** | Authenticated / Explicit Handshake | Redacted in public queries; returned only to owner or on `POST /api/connect` | `whatsapp` (phone number), `linkedin` |
| **Private / Personal** | Member only | Exportable and permanently erasable by member | Notifications inbox, session state |

---

## 2. Entity Schemas

### A. Member Profile (`profiles`)

```typescript
export interface Profile {
  id: string;                     // Unique identifier (UUID or Firestore Doc ID)
  name: string;                   // Member full name
  role: 'builder' | 'business' | 'design' | 'other'; // Primary hackathon role
  headline: string;               // Max 8-word summary synthesized by Gemma 4 or custom
  bio: string;                    // 2-sentence first-person bio
  offers: string;                 // Skills, tools, assets the member offers
  needs: string;                  // What the member needs in a collaborator
  teaches?: string;               // What the member can teach to a peer
  learns?: string;                // What the member wants to learn
  tags: string[];                 // 3 to 6 search and classification tags
  skills: string[];               // Up to 6 specific technical/business skills
  github?: string;                // Public GitHub handle (e.g. "octocat")
  linkedin?: string;              // LinkedIn public URL
  whatsapp?: string;              // Phone number (e.g. "256772123456") - PROTECTED
  has_whatsapp?: boolean;         // Computed boolean flag in public list (phone number omitted)
  avatar?: string;                // Base64 data URI or public avatar URL
  status?: string;                // Current room status (e.g. "Looking for a co-founder")
  is_demo?: boolean;              // True for seeded Hack Day demo cohort members
  created_at: string;             // ISO-8601 timestamp
  gh?: {                          // GitHub metadata snapshot
    login: string;
    repos?: number;
    langs?: string[];
    top?: Array<{
      name: string;
      desc?: string;
      lang?: string;
      stars?: number;
      url?: string;
    }>;
  };
}
```

### B. Match Pair (`matches`)

Represents a calculated complementary relationship between two registered members.

```typescript
export interface MatchRecord {
  id: string;                     // Unique match identifier
  a_id: string;                   // Initiator member ID
  b_id: string;                   // Matched peer member ID
  score: number;                  // Compatibility score (0–100)
  reason: string;                 // One-sentence explanation of why the pair is complementary
  spark: string;                  // Project or small business idea the pair could launch
  created_at: string;             // ISO-8601 timestamp
}
```

### C. Community Feed Post (`posts`)

```typescript
export interface Post {
  id: string;                     // Unique post ID
  author_id: string;              // Member ID of post creator
  title: string;                  // Synthesized short title (max 60 chars)
  body: string;                   // Full text of the post
  kind: 'idea' | 'need' | 'offer' | 'question'; // Post classification
  tags: string[];                 // 2 to 4 auto-generated tags
  created_at: string;             // ISO-8601 timestamp
}
```

### D. Follow Relationship (`follows`)

```typescript
export interface Follow {
  id: string;                     // Unique follow record ID
  follower_id: string;            // ID of member who clicked follow
  following_id: string;           // ID of member being followed
  created_at: string;             // ISO-8601 timestamp
}
```

### E. Notification (`notifications`)

```typescript
export interface NotificationItem {
  id: string;                     // Unique notification ID
  to_id: string;                  // Recipient member ID
  from_id?: string;               // Sender member ID (if applicable)
  type: 'match' | 'follow' | 'connect' | 'digest';
  body: string;                   // Descriptive notification text
  read: boolean;                  // Unread status indicator
  created_at: string;             // ISO-8601 timestamp
}
```

---

## 3. Data Retention & Deletion Cascade

In accordance with the **Digital Public Goods Standard**:
* When a member executes **Delete my profile**, the system cascades the deletion across:
  * Profile record in `profiles`.
  * All posts authored by member in `posts`.
  * All follow relations in `follows` (both incoming and outgoing).
  * All match records in `matches` (both `a_id` and `b_id`).
  * All notifications in `notifications` (both incoming and sent).
  * Local device storage (`localStorage`).
