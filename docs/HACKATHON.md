# Hacktoberfest 2026 Hack Day Submission & Documentation

This document contains the official hackathon details, compliance checklist, and ready-to-paste submission text for **Kwegatta**.

---

## 1. Hackathon Details

* **Event**: Hacktoberfest 2026 Hack Day Kampala x MUBS
* **Date**: Friday 2 October 2026
* **Venue**: Entrepreneurship, Innovation and Incubation Centre (EIIC), Makerere University Business School (MUBS), Nakawa Campus, Kampala, Uganda
* **Hosts**: Web3 Club MUBS and GDG on Campus MUBS
* **Organizers**: Hacktoberfest 2026 is powered by **Major League Hacking (MLH)** and **DEV**, presented by **DigitalOcean**
* **Theme**: *"AI belongs to everyone"*
* **Challenge Entered**: **Best Open-Source AI Project** ([https://www.mlh.com/opensource-ai](https://www.mlh.com/opensource-ai))
* **Designated Model**: **`gemma-4-31b-it`** (Google DeepMind, Apache 2.0 open-weight model with 31 billion parameters, qualifying as a large language model under challenge rules).

---

## 2. Challenge Requirements Checklist

| Requirement | How Kwegatta Visibly Meets the Requirement |
| ----------- | ------------------------------------------ |
| **a) Open-source or open-weight AI is an important part of the project** | **MET**: Every AI capability in Kwegatta (profile synthesis, complementary matchmaking, post classification, and learning recommendations) runs exclusively on the open-weight model `gemma-4-31b-it`. No closed or proprietary models (Gemini, GPT) are used anywhere in the codebase. |
| **b) Public GitHub repository with an open-source licence** | **MET**: Public repository at [https://github.com/Saifuddin2Ahmed/kwegatta](https://github.com/Saifuddin2Ahmed/kwegatta) under the OSI-approved **MIT License** (`LICENSE`). |
| **c) README explains what we built, how to run or try it, names the model and key dependencies, with a link to the model's licence** | **MET**: The comprehensive `README.md` documents what Kwegatta is, provides step-by-step local setup instructions, lists key dependencies, and explicitly names `gemma-4-31b-it` with direct links to its [Apache 2.0 open-weights license](https://ai.google.dev/gemma/docs/core). |
| **d) Working demo and a clear explanation** | **MET**: Live deployed app running at [https://kwegatta.ai.studio](https://kwegatta.ai.studio) with an interactive 3-minute demo script detailed in [docs/DEMO-SCRIPT.md](DEMO-SCRIPT.md). |

---

## 3. Ready-to-Paste Hackathon Submission Text

### Project Name
**Kwegatta**

### Tagline / Short Description
Find the people you should build and learn with. A student networking and peer-learning platform matching complementary builders using the open-weight Gemma 4 model.

### Live Demo URL
https://kwegatta.ai.studio

### Repository URL
https://github.com/Saifuddin2Ahmed/kwegatta

### Technologies Used
* **AI Model**: `gemma-4-31b-it` (Open-Weight Large Language Model, Apache 2.0)
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, GitHub Primer Design System, Lucide Icons, QRCode
* **Backend**: Node.js 20+, Express, Vite server middleware
* **Database**: Cloud Firestore
* **APIs**: GitHub REST API (public repository inspection)
* **Standard Alignment**: Aligned with the Digital Public Goods Standard (SDG 4, SDG 8, SDG 9, SDG 17)

### Inspiration
At Hacktoberfest Hack Day Kampala x MUBS, business students with promising venture ideas and developers with technical skills sit in the exact same room and never find each other. The same happens with peer learning: someone wanting to learn a skill sits next to someone who could teach it. Kwegatta (Luganda for *"to connect, unite, join forces"*) bridges this gap with a 60-second mobile join flow, AI-synthesized profiles, and complementary matchmaking.

### What it Does
1. **Conversational Mobile Onboarding**: Asks one friendly question at a time to assemble a member's offers, needs, teachings, and learnings.
2. **GitHub Public Enrichment**: Imports public repository counts, top languages, and top repos without authentication or tokens.
3. **Open-Weight Gemma 4 Synthesis**: Synthesizes a crisp headline, two-sentence bio, skills, and role using strictly member-supplied facts without hallucinating credentials.
4. **Complementary Matchmaking**: Ranks room participants where complementary needs and offers beat mere surface similarity.
5. **Learn Tab**: Pairs every member with one peer mentor and one study partner.
6. **One-Tap WhatsApp & LinkedIn Handover**: Generates contextual icebreaker messages for instant outreach.
7. **Auditorium Projector Wall (`/wall`)**: Displays real-time room stats, latest pairings, and a join QR code.
8. **User Data Sovereignty**: One-click "Export my data (JSON)" and "Delete my profile" buttons, with phone numbers protected from public scraping.

### How We Built It
We engineered Kwegatta using React 19 and Node.js with authentic GitHub Primer design tokens. To protect API credentials and enforce hackathon rules, all AI invocations route through a secure server proxy (`server.ts`) that strictly permits only `gemma-4-31b-it`. We tuned inference latency using `thinkingConfig: { thinkingLevel: 'MINIMAL' }` and built an automatic keyword heuristic fallback so the app continues functioning without interruption if upstream connectivity drops.

### Challenges We Ran Into
* Ensuring the 31B parameter open-weight model responded within interactive web timeframes without hitting server timeouts.
* Handling edge cases in unauthenticated GitHub REST API rate limits during high-density hackathon Wi-Fi usage.
* Protecting student phone numbers from automated scraping while maintaining effortless peer connection flows.

### Accomplishments That We're Proud Of
* Zero API key leakage: 100% server-side model execution.
* True fact-bounded AI: The model never fabricates skills, degrees, or achievements.
* Transparent fallback: Whenever keyword heuristics are used, they are visibly labeled `Basic match (AI unavailable)`.
* Comprehensive Digital Public Goods Standard alignment with user data export and deletion rights.

### What We Learned
* How to optimize open-weight LLMs using minimal reasoning budgets for real-time mobile user interfaces.
* How cross-disciplinary collaboration between business students and technical developers dramatically accelerates product validation.

### What's Next for Kwegatta
* Multi-campus expansion across Makerere University, Kyambogo, and regional East African universities.
* An offline-first WhatsApp bot bridge for students with limited smartphone data plans.
