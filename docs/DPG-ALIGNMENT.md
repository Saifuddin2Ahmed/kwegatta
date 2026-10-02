# Digital Public Goods Standard Alignment

**Kwegatta** is designed and maintained to be **aligned with** the [Digital Public Goods Standard](https://digitalpublicgoods.net/standard/). 

> **Important Notice**: Kwegatta is an independent open-source project and is described here as being **aligned with** the Digital Public Goods Standard. It is not "certified" or "endorsed by the United Nations" or the DPGA.

---

## 1. Relevance to the Sustainable Development Goals (SDGs)

Kwegatta directly addresses four United Nations Sustainable Development Goals:

* **SDG 4: Quality Education (Target 4.4)**:
  * Facilitates peer-to-peer mentoring and collaborative learning.
  * Connects students who want to learn a skill directly with peers in the room who can teach it (the **Learn** tab).
* **SDG 8: Decent Work and Economic Growth (Target 8.3 & 8.6)**:
  * Pairs business and marketing students with software builders to create investable student startups, reducing youth unemployment and promoting entrepreneurship.
* **SDG 9: Industry, Innovation and Infrastructure (Target 9.5)**:
  * Promotes open-source software building at campus hackathons, providing digital tools for prototype commercialization.
* **SDG 17: Partnerships for the Goals (Target 17.6 & 17.17)**:
  * Unites cross-disciplinary students across faculties (e.g. Makerere University Business School and Makerere Main Campus) to collaborate on shared technological solutions.

---

## 2. Assessment Against the 9 DPG Standard Indicators

| # | DPG Indicator | Alignment Status | How Kwegatta Meets This Indicator / Current Gaps |
| - | ------------- | ---------------- | ------------------------------------------------ |
| **1** | **Relevance to Sustainable Development Goals** | **Met** | Directly targets **SDG 4** (peer learning), **SDG 8** (student ventures), **SDG 9** (open innovation), and **SDG 17** (cross-campus partnerships) as detailed above. |
| **2** | **Use of an Approved Open Source Licence** | **Met** | Licensed under the OSI-approved **MIT License** ([LICENSE](../LICENSE)). AI foundation model utilizes the open-weight **Apache 2.0** licensed Gemma 4 architecture. |
| **3** | **Clear Ownership and Governance** | **Met** | Defined in [GOVERNANCE.md](../GOVERNANCE.md) and [TEAM.md](../TEAM.md). Maintained by Saifuddin Ahmed and Adinan with clear contribution paths. |
| **4** | **Platform Independence & Non-Proprietary Architecture** | **Met** | Built on standard web technologies (TypeScript, React 19, Node.js/Express, Tailwind CSS). Uses open REST patterns; deployable on any container runtime or Linux server. |
| **5** | **Documentation & Discoverability** | **Met** | Extensive developer and user documentation including [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA-MODEL.md](DATA-MODEL.md), and [AI-USAGE.md](AI-USAGE.md). |
| **6** | **Mechanism for Extracting Data (Data Sovereignty)** | **Met** | Profile page provides a dedicated **Export my data (JSON)** button that downloads the user's complete profile, matches, posts, following graph, and notification history. |
| **7** | **Adherence to Privacy and Domestic Laws** | **Met** | Described in [PRIVACY.md](../PRIVACY.md). Phone numbers are redacted in public member list queries and revealed only on intentional connect actions. Full "Delete my profile" permanent removal mechanism implemented. |
| **8** | **Adherence to Standards & Best Practices** | **Met** | Follows GitHub Primer accessibility conventions, Semantic Versioning ([CHANGELOG.md](../CHANGELOG.md)), and Contributor Covenant 2.1 ([CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)). |
| **9** | **Do No Harm by Design (Safety & Ethics)** | **Met** | Hard anti-hallucination prompt boundaries (AI uses only member-supplied facts). Secure server-side model proxy prevents API key theft. Graceful heuristic fallback prevents exclusion during network outages. Public security policy documented in [SECURITY.md](../SECURITY.md). |

---

## 3. Continuous Improvement Plan

To further deepen alignment with the standard, the Kwegatta team is working toward:
1. Adding automated end-to-end accessibility testing (WCAG 2.1 AA audits).
2. Implementing native multi-language localization (Luganda, Swahili, French) to expand access across East Africa.
3. Enabling decentralized cryptographic profile verification via open decentralized identity (DID) standards.
