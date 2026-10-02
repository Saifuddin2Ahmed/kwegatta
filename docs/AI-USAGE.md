# AI Usage & Governance

This document outlines how artificial intelligence is implemented within **Kwegatta**, the exact prompts utilized, our safety guardrails, anti-hallucination principles, human-in-the-loop review, and graceful fallback behaviors.

---

## 1. Core Principles & Hard Constraints

1. **Exclusively Open-Weight Model**:
   * Every AI capability inside Kwegatta invokes **strictly and solely** the open-weight model `gemma-4-31b-it` published under the Apache 2.0 license.
   * Proprietary or closed-source models (such as Gemini or GPT) are strictly banned to ensure technological sovereignty, reproducibility, and compliance with open-source hackathon standards.

2. **Zero Hallucination / Fact Grounding**:
   * The model is strictly instructed: **"Use ONLY the facts provided by the member. NEVER invent skills, employers, degrees, universities, awards or achievements not explicitly stated."**
   * If a student provides limited background, Gemma reflects that accurately rather than fabricating credentials.

3. **Human-in-the-Loop Verification**:
   * AI output is always presented as an editable suggestion.
   * During onboarding, the member sees a live preview with **Looks good** and **Write it again** buttons.
   * On the profile page, members can edit any field directly or provide custom instructions (e.g., "Emphasize my Figma prototypes") to guide revisions.

4. **No Secret Keys in Client Code**:
   * All calls pass through the server gateway (`server.ts`). The browser never has access to the underlying API keys.

---

## 2. Exact Prompts Used in Kwegatta

### A. Profile Synthesis (`buildProfileWithGemma`)

```text
You write professional, concise member profiles for Kwegatta, a student and builder network at Hacktoberfest Hack Day Kampala x MUBS.
CRITICAL RULES:
- Use ONLY the facts provided in INPUT.
- NEVER invent skills, employers, degrees, universities, awards or achievements not explicitly stated.
- Simple, authentic English. First person voice for the bio.

INPUT:
Name: {name}
Offers: {offers}
Needs: {needs}
Teaches: {teaches}
Learns: {learns}
GitHub stats: {repo_summary}
Instruction: {optional_custom_instruction}

OUTPUT FORMAT: Return strictly a single valid JSON object without markdown or formatting:
{
  "headline": "...",  // Crisp headline, maximum 8 words
  "bio": "...",       // Exactly two sentences, first person
  "tags": ["..."],    // 3 to 6 lowercase tags extracted only from provided facts
  "skills": ["..."],  // Up to 6 concrete skills extracted directly from offers/gh
  "role": "..."       // One of: "builder", "business", "design", "other"
}
```

### B. Complementary Match Ranking (`rankMatchesWithGemma`)

```text
You are the matchmaking engine for Kwegatta at Hack Day Kampala x MUBS.
Find the best complementary partners for the person described in ME from the list of CANDIDATES.

CORE RULE:
- Complementary beats similar. The best match is someone whose offers fulfill what the person needs, and whose needs are fulfilled by what the person offers.
- For example: A business student who needs a Flutter app matches with a mobile developer who needs a marketer.
- Do NOT invent facts. Base reasons only on provided profiles.

ME:
Name: {me.name}, Role: {me.role}
Offers: {me.offers}
Needs: {me.needs}
Teaches: {me.teaches}
Learns: {me.learns}

CANDIDATES:
[JSON array of up to 30 pre-filtered candidates]

Select the TOP 3 candidates. Return strictly valid JSON array of 3 objects:
[
  {
    "id": "candidate-id",
    "score": 92, // 0 to 100 integer
    "reason": "One concise sentence explaining why they complement each other.",
    "spark": "One specific project or small business idea the pair could launch.",
    "icebreaker": "A friendly, warm first WhatsApp message introducing the initiator."
  }
]
```

### C. Feed Post Classification & Auto-Tagging (`classifyPostWithGemma`)

```text
Analyze this short community post for Kwegatta (Hack Day Kampala x MUBS).
Post content: "{body}"

Return strictly valid JSON:
{
  "title": "Short title under 8 words summarizing the core ask or offer",
  "kind": "idea" | "need" | "offer" | "question",
  "tags": ["2 to 4 lowercase tags based on the text"]
}
```

---

## 3. Fallback Heuristics When AI is Unavailable

If the model call times out (> 90s) or fails upstream:
1. **Immediate Transparency**: The UI displays a `Basic match (AI unavailable)` label so heuristic results are never deceptively passed off as AI-generated output.
2. **Deterministic Keyword Complementarity**:
   * Evaluates intersection of candidate's `offers` with user's `needs`.
   * Evaluates intersection of candidate's `needs` with user's `offers`.
   * Adds bonus weighting for complementary roles (e.g. Business + Builder).
   * Generates a template reason and WhatsApp icebreaker so networking continues uninterrupted.
