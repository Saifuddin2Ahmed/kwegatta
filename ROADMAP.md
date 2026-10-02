# Product Roadmap

This roadmap outlines the milestones for **Kwegatta**, from its debut at **Hacktoberfest 2026 Hack Day Kampala x Makerere University Business School (MUBS)** to a multi-campus peer-learning network across East Africa.

---

## 1. Now (Hack Day Kampala x MUBS Launch — Q4 2026)

- [x] **Conversational Onboarding**: Guided one-question-at-a-time AI onboarding for rapid join flows on mobile devices.
- [x] **GitHub Profile Enrichment**: Public repository count, top languages, and top projects fetched via GitHub REST API without tokens.
- [x] **Open-Weight Gemma 4 Synthesis**:
  - Auto-generate headline (max 8 words), two-sentence first-person bio, tags, and role.
  - Strict anti-hallucination constraint: only synthesize facts explicitly provided by the member.
  - Fast response using `thinkingLevel: 'MINIMAL'` and 90-second server timeout.
- [x] **Complementary Matchmaking**:
  - Match builder skills with business and design needs (complementary > similar).
  - Provide a compatibility score (0–100), concise reason, business/prototype spark, and pre-written WhatsApp icebreaker.
- [x] **Learn Tab**:
  - Pair each member with one peer mentor (teaches what they want to learn) and one study partner (learns the same topic).
- [x] **Reliable Graceful Fallback**:
  - Seamless fallback to heuristic keyword scoring when upstream model access is interrupted, clearly marked with a `Basic match (AI unavailable)` label.
- [x] **Privacy & User Sovereignty (DPG Aligned)**:
  - Phone numbers protected from public member list scraping; revealed only upon intentional Connect action.
  - One-click "Export my data (JSON)" and permanent "Delete my profile" buttons.
  - Robust initials fallback avatar system for members without photos.
- [x] **Live Projector Wall (`/wall`)**:
  - High-visibility projector dashboard for the hackathon room showing real-time stats, latest matches, top tags, and a join QR code.

---

## 2. Next (MUBS Campus-Wide Expansion — Q1 2027)

- [ ] **Firebase Authentication Integration**:
  - Secure sign-in via GitHub and Google so members can manage their profile across multiple devices with strict access control.
- [ ] **WhatsApp Bot Assistant**:
  - Allow students with basic 2G/3G connectivity or USSD/SMS limitations to query peer matches and browse project asks directly over WhatsApp.
- [ ] **Cross-Faculty Bridging**:
  - Dedicated tracks connecting MUBS (Business, Entrepreneurship, Marketing) with Makerere University Main Campus (College of Computing and Information Sciences - CoCIS).
- [ ] **Peer Skill Endorsements**:
  - Allow verified teammates from hackathons to endorse skills and provide peer recommendations.
- [ ] **Offline-First PWA Mode**:
  - Full service-worker caching allowing members to browse previously loaded room members and draft posts while disconnected.

---

## 3. Later (East African Regional Network — 2027+)

- [ ] **Multi-University Network**:
  - Federation across Ugandan and regional universities (Kyambogo, Mbarara University of Science & Technology, Strathmore University, University of Dar es Salaam).
- [ ] **Open Matching Evaluation Benchmarks**:
  - Anonymized open research dataset evaluating complementary peer matching effectiveness in developing country hackathons.
- [ ] **Local LLM Edge Execution**:
  - Explore on-device quantized Gemma 4 execution in the browser via WebGPU to run matchmaking completely client-side without internet.
- [ ] **Micro-Grant Collaboration Pools**:
  - Integration with open student builder grants to award prototype funding to the top complementary pairs formed on Kwegatta.
