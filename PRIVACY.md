# Privacy Policy & Data Handling

**Kwegatta** is committed to transparency and data minimization, adhering to the principles of the **Digital Public Goods Standard**. This document details exactly what data is collected, why, where it is stored, who can see it, and how members retain complete sovereignty over their personal information.

---

## 1. What Data We Collect

When you join Kwegatta, our conversational onboarding assistant collects only what is necessary to pair you with builders and mentors:

1. **Identity & Bio**:
   * Full name.
   * Professional role (Builder, Business, Design, or Other).
   * Headline and concise bio (authored by the member or synthesized with your explicit consent by Gemma 4).
   * Profile picture (uploaded photo, camera capture, or auto-generated initials).

2. **Collaboration Details**:
   * What you **Offer** (skills, tools, deliverables).
   * What you **Need** (skills or co-founders you are seeking).
   * What you can **Teach** (for peer mentoring).
   * What you want to **Learn** (for study partnerships).

3. **Public Links & Repositories**:
   * GitHub username: We fetch public repository counts, primary languages, and top repositories via the unauthenticated GitHub REST API. We do not access private repositories or account tokens.
   * LinkedIn profile link: Stored strictly as a URL provided by you; we never scrape or index LinkedIn.

4. **Direct Contact (Optional)**:
   * WhatsApp phone number: Provided voluntarily to allow matched peers to initiate communication on WhatsApp.

---

## 2. Why We Collect This Data

* **Complementary Matchmaking**: Matching builders with co-founders whose offers fulfill each other's needs.
* **Peer Learning (Learn Tab)**: Pairing students with peer mentors and study partners.
* **Room Feed & Collaboration Wall**: Connecting attendees in real time during campus hackathons and community build days.

---

## 3. Where Data is Stored

* **Database**: Google Cloud Firestore (and synchronized memory store during local hackathon deployments).
* **AI Model Boundary**: Text is sent to the open-weight model `gemma-4-31b-it` hosted on Google Cloud. The prompt is strictly ephemeral: prompts are processed solely to return the structured profile or match synthesis and are not retained to train foundation models.
* **No Third-Party Ad Trackers**: Kwegatta has zero advertising SDKs, zero third-party telemetry, and zero tracking cookies.

---

## 4. Who Can See Your Data

* **Public Member Profile**: Your name, headline, bio, role, tags, skills, offers, needs, teachings, learnings, and GitHub public repos are visible to all members in the room and anyone with your QR code link.
* **Protected Phone Numbers**: To protect students from spam and bulk automated scraping, **WhatsApp numbers are never returned in the public member list API (`GET /api/data/profiles`)**. The phone number is only provided to another member when they press **Connect** to initiate a mutual conversation, which logs an explicit connection notification.

---

## 5. User Data Sovereignty: Export & Deletion

We believe members should always own and control their data:

### Export My Data (JSON)
At any time, navigate to your profile tab (`/me`) and click **Export my data (JSON)**. This downloads a complete archive containing:
* Your profile records and settings.
* All posts you have published.
* All matches generated for you.
* Your followers and following graph.
* Your notifications log.

### Delete My Profile Permanently
You have the unconditional right to be forgotten:
1. Navigate to your profile tab (`/me`).
2. Click **Delete my profile**.
3. Type your name to confirm permanent removal.
4. The server permanently erases your profile document and cascades the deletion across your posts, matches, and notifications in Firestore. Your local session is cleared immediately.

---

## 6. Honest Limitations & Current Scope

Because Kwegatta was launched as an open-source initiative for **Hacktoberfest 2026 Hack Day Kampala x MUBS**:
* **Authentication**: In the initial hack-day version, profiles are linked to the local device browser session (`localStorage`). In production campus deployment, Firebase Authentication (GitHub/Google SSO) secures profile modification rights so only authenticated account holders can alter or delete their record.
* **WhatsApp Handover**: When you press Connect, conversation handover takes place externally on WhatsApp (`wa.me`). Messages exchanged on WhatsApp are end-to-end encrypted by WhatsApp and do not pass through Kwegatta servers.
* **Public Projector Wall**: The live wall (`/wall`) displays aggregate statistics, recent match pairings (names and sparks), and community tags for the audience. No private phone numbers or contact details are ever projected.

---

## 7. Contact Us

For privacy inquiries or data removal requests:
* Email: **`privacy@kwegatta.org`** / **`saifuddin.ai.dev@gmail.com`**
