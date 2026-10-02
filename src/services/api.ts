import { Profile, MatchResult, LearnMatchResult, Post, NotificationItem, Follow, GitHubData } from '../types';

/* =========================================================================
   HARD RULE: OPEN-WEIGHT MODEL ONLY.
   The model id in the code MUST BE 'gemma-4-31b-it' and NOTHING ELSE.
   No closed or Gemini models permitted.
   ========================================================================= */
export const GEMMA_MODEL_ID = 'gemma-4-31b-it';

export const APP_NAME = 'Kwegatta';

const STOP_WORDS = new Set(
  'the and for with that this from have need needs want looking who can are you your our some any into about more help someone person people good new also just like make made building build work working'.split(' ')
);

export function extractKeywords(text: string): Set<string> {
  const words = (String(text || '').toLowerCase().match(/[a-z0-9+#.]{3,}/g) || [])
    .filter(w => !STOP_WORDS.has(w));
  return new Set(words);
}

export function intersection<T>(a: Set<T>, b: Set<T>): T[] {
  return [...a].filter(x => b.has(x));
}

export function calculateHeuristicScore(me: Profile, candidate: Profile): number {
  const myNeeds = extractKeywords(me.needs + ' ' + (me.learns || ''));
  const theirNeeds = extractKeywords(candidate.needs + ' ' + (candidate.learns || ''));

  const myOffers = extractKeywords(
    [me.offers, me.teaches || '', ...(me.skills || []), ...(me.tags || [])].join(' ')
  );
  const theirOffers = extractKeywords(
    [candidate.offers, candidate.teaches || '', ...(candidate.skills || []), ...(candidate.tags || [])].join(' ')
  );

  const complementCount = intersection(myNeeds, theirOffers).length + intersection(theirNeeds, myOffers).length;
  const tagOverlap = intersection(new Set(me.tags || []), new Set(candidate.tags || [])).length;
  const roleBonus = me.role && candidate.role && me.role !== candidate.role ? 14 : 0;

  return Math.min(98, Math.max(30, complementCount * 20 + tagOverlap * 8 + roleBonus));
}

export function createFallbackMatch(me: Profile, candidate: Profile, score: number): MatchResult {
  const gives = intersection(
    extractKeywords(me.needs),
    extractKeywords([candidate.offers, ...(candidate.skills || [])].join(' '))
  ).slice(0, 3);

  const takes = intersection(
    extractKeywords(candidate.needs),
    extractKeywords([me.offers, ...(me.skills || [])].join(' '))
  ).slice(0, 3);

  let reason = '';
  if (gives.length > 0) {
    reason = `${candidate.name.split(' ')[0]} offers ${gives.join(', ')}, matching what you need${takes.length > 0 ? `, and you provide ${takes.join(', ')} in return` : ''}.`;
  } else if (takes.length > 0) {
    reason = `${candidate.name.split(' ')[0]} needs ${takes.join(', ')}, which you offer.`;
  } else {
    reason = `You and ${candidate.name.split(' ')[0]} bring complementary ${candidate.role} and ${me.role} perspectives to a project.`;
  }

  const firstName = candidate.name.split(' ')[0];
  const myFirstName = me.name.split(' ')[0];

  return {
    id: candidate.id,
    score,
    reason,
    spark: `${candidate.role === 'business' ? 'A commercial launch' : 'A rapid prototype'} combining ${me.offers.slice(0, 30)} with ${candidate.offers.slice(0, 30)}.`,
    icebreaker: `Hi ${firstName}, I'm ${myFirstName}. I found you on ${APP_NAME} and noticed our skills align. Do you have a few minutes to connect?`
  };
}

// Call the open-weight Gemma 4 model via server endpoint with retry
export async function callGemma(
  prompt: string,
  options: { json?: boolean; temperature?: number } = {},
  retries = 1
): Promise<any> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('/api/gemma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GEMMA_MODEL_ID,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.1 // Lowest temperature for fast, deterministic answers
          }
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data?.error?.message || `Server status ${res.status}`;
        lastError = new Error(errorMsg);

        // Retry once on 500, 503, or timeout
        if (attempt < retries && (res.status >= 500 || res.status === 408)) {
          console.warn(`[Gemma Client] Call failed with status ${res.status}, retrying once...`);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        throw lastError;
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      const nonThought = parts
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text || '')
        .join('')
        .trim();
      const text = nonThought || parts.map((p: any) => p.text || '').join('').trim();

      if (!text) {
        throw new Error('Gemma returned an empty answer');
      }

      if (options.json) {
        const cleaned = text.replace(/```json|```/gi, '').trim();
        const start = cleaned.search(/[\[{]/);
        const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
        if (start < 0 || end < start) {
          throw new Error('Gemma response did not contain valid JSON format');
        }
        return JSON.parse(cleaned.slice(start, end + 1));
      }

      return text;
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`[Gemma Client] Attempt ${attempt + 1} error: ${err.message}. Retrying once...`);
        await new Promise(r => setTimeout(r, 1200));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Gemma call failed');
}

export async function buildProfileWithGemma(
  data: Partial<Profile>,
  extraInstruction?: string
): Promise<{ headline: string; bio: string; tags: string[]; skills: string[]; role: Profile['role']; ai: boolean; error?: string }> {
  const gh = data.gh;
  const prompt = `You write professional, concise member profiles for ${APP_NAME}, a student and builder network at Hacktoberfest Hack Day Kampala x MUBS.
CRITICAL RULES:
- Use ONLY the facts provided in INPUT.
- NEVER invent skills, employers, degrees, universities, awards or achievements not explicitly stated.
- Simple, authentic English. First person voice for the bio.

INPUT:
Name: ${data.name}
What they offer: ${data.offers || '-'}
What they need: ${data.needs || '-'}
What they can teach: ${data.teaches || '-'}
What they want to learn: ${data.learns || '-'}
GitHub: ${gh?.login ? `@${gh.login}, ${gh.repos ?? 0} public repos, main languages: ${(gh.langs || []).join(', ') || 'unknown'}, notable repos: ${(gh.top || []).map(r => r.name + (r.desc ? ' (' + r.desc + ')' : '')).join('; ') || 'none'}` : 'not provided'}
LinkedIn: ${data.linkedin ? 'provided' : 'not provided'}
${data.bio ? 'Current draft bio: ' + data.bio : ''}
${extraInstruction ? 'User custom instruction: ' + extraInstruction : ''}

Return ONLY this JSON, no other text:
{
  "headline": "<max 8 words summary>",
  "bio": "<2 sentences, maximum 45 words total>",
  "tags": ["<3 to 6 short lowercase topic tags>"],
  "skills": ["<up to 6 concrete skills mentioned>"],
  "role": "<builder | business | design | other>"
}`;

  try {
    const result = await callGemma(prompt, { json: true, temperature: 0.3 });
    const validRoles: Profile['role'][] = ['builder', 'business', 'design', 'other'];
    const chosenRole = validRoles.includes(result.role) ? result.role : 'other';

    return {
      headline: String(result.headline || data.offers?.slice(0, 50) || 'New member').trim().slice(0, 80),
      bio: String(result.bio || `I offer ${data.offers}. I am looking for ${data.needs}.`).trim().slice(0, 320),
      tags: (Array.isArray(result.tags) ? (result.tags as unknown[]) : []).map((t: unknown) => String(t).toLowerCase().replace(/[^a-z0-9+#-]/g, '')).filter(Boolean).slice(0, 6),
      skills: (Array.isArray(result.skills) ? (result.skills as unknown[]) : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 6),
      role: chosenRole,
      ai: true
    };
  } catch (err: any) {
    console.warn('Gemma profile synthesis failed, using rule-based fallback:', err);
    // Rule-based fallback so onboarding never blocks
    const ghLangs = data.gh?.langs || [];
    const isBuilder = ghLangs.length > 0 || /code|develop|software|react|flutter|python/i.test(data.offers || '');
    const isBusiness = /market|sales|business|finance|account|pitch|grant/i.test(data.offers || '');
    const isDesign = /design|figma|ui|ux|brand/i.test(data.offers || '');
    const role: Profile['role'] = isBuilder ? 'builder' : isBusiness ? 'business' : isDesign ? 'design' : 'other';

    const tags = Array.from(
      new Set([
        ...ghLangs.map(l => l.toLowerCase()),
        ...Array.from(extractKeywords(data.offers || '')).slice(0, 3)
      ])
    ).slice(0, 5);

    return {
      headline: data.offers?.slice(0, 60) || 'Hack Day member',
      bio: `I offer ${data.offers || 'my builder skills'}. I am looking for ${data.needs || 'collaborators to build with'}.`,
      tags,
      skills: ghLangs.slice(0, 5),
      role,
      ai: false,
      error: err.message
    };
  }
}

export async function matchCandidatesWithGemma(
  me: Profile,
  candidates: Profile[]
): Promise<{ list: MatchResult[]; ai: boolean; error?: string }> {
  if (candidates.length === 0) {
    return { list: [], ai: true };
  }

  // Pre-rank using keyword heuristic and take at most 30 candidates
  const preRanked = candidates
    .map(candidate => ({
      candidate,
      heuristicScore: calculateHeuristicScore(me, candidate)
    }))
    .sort((a, b) => b.heuristicScore - a.heuristicScore)
    .slice(0, 30);

  const prompt = `You are the matching engine of ${APP_NAME}, a student and builder network at Hacktoberfest 2026 Hack Day Kampala x MUBS.
CRITICAL INSTRUCTIONS:
- Directly output the JSON array. Do not output any thought process, preamble, or markdown tags.
- Complementary beats similar: the best match is someone whose OFFERS cover what the other person NEEDS, ideally in both directions.
- Use only facts provided. Never invent skills or achievements.
- Friendly, warm, simple English.

ME:
Name: ${me.name} | Role: ${me.role} | Offers: ${me.offers} | Needs: ${me.needs} | Teaches: ${me.teaches || '-'} | Learns: ${me.learns || '-'} | Skills: ${[...(me.skills || []), ...(me.tags || [])].join(', ')}

CANDIDATES:
${preRanked.map((item, index) => `${index + 1}. ID: ${item.candidate.id} | Name: ${item.candidate.name} | Role: ${item.candidate.role} | Offers: ${item.candidate.offers} | Needs: ${item.candidate.needs} | Skills: ${[...(item.candidate.skills || []), ...(item.candidate.tags || [])].join(', ')}`).join('\n')}

Pick the top 3 best complementary partners for ME. Return ONLY a JSON array, no other text:
[
  {
    "n": <candidate index number 1 to ${preRanked.length}>,
    "score": <match score integer 0-100>,
    "reason": "<one concrete sentence: who needs what from whom>",
    "spark": "<one specific project or small business the two could start together at Hack Day, max 20 words>",
    "icebreaker": "<a warm, friendly first WhatsApp message from ME to the candidate, max 40 words>"
  }
]`;

  try {
    const rawMatches = await callGemma(prompt, { json: true, temperature: 0.1 });
    const matchesArray = Array.isArray(rawMatches) ? rawMatches : (rawMatches.matches || []);

    const results: MatchResult[] = [];
    for (const m of matchesArray) {
      const idx = Number(m.n) - 1;
      const found = preRanked[idx]?.candidate;
      if (found) {
        results.push({
          id: found.id,
          score: Math.min(100, Math.max(0, Math.round(Number(m.score) || 75))),
          reason: String(m.reason || '').trim().slice(0, 250),
          spark: String(m.spark || '').trim().slice(0, 160),
          icebreaker: String(m.icebreaker || '').trim().slice(0, 250)
        });
      }
    }

    if (results.length > 0) {
      return { list: results.slice(0, 3), ai: true };
    }
    throw new Error('Gemma returned empty match array');
  } catch (err: any) {
    console.warn('Gemma matching failed, using heuristic match ranking:', err);
    // Graceful fallback to keyword heuristic
    const fallbackList = preRanked.slice(0, 3).map(item =>
      createFallbackMatch(me, item.candidate, item.heuristicScore)
    );
    return { list: fallbackList, ai: false, error: err.message };
  }
}

// Learn Tab: Match one mentor and one study partner
export async function matchLearningPartners(
  me: Profile,
  candidates: Profile[]
): Promise<LearnMatchResult> {
  const result: LearnMatchResult = {};
  if (!candidates.length) return result;

  const myLearnWords = extractKeywords((me.learns || '') + ' ' + (me.needs || ''));

  // 1. Find best Mentor (someone who teaches what I want to learn)
  let bestMentor: Profile | null = null;
  let maxMentorScore = 0;
  for (const c of candidates) {
    const theirTeachWords = extractKeywords((c.teaches || '') + ' ' + (c.offers || '') + ' ' + (c.skills || []).join(' '));
    const overlap = intersection(myLearnWords, theirTeachWords).length;
    if (overlap > maxMentorScore) {
      maxMentorScore = overlap;
      bestMentor = c;
    }
  }

  if (bestMentor) {
    const teachesSubject = bestMentor.teaches || bestMentor.skills?.[0] || 'technical expertise';
    result.mentor = {
      profile: bestMentor,
      reason: `${bestMentor.name.split(' ')[0]} can mentor you in ${teachesSubject}, which matches what you want to learn.`
    };
  } else if (candidates.length > 0) {
    const fallbackMentor = candidates.find(c => c.role === 'builder' && me.role !== 'builder') || candidates[0];
    result.mentor = {
      profile: fallbackMentor,
      reason: `${fallbackMentor.name.split(' ')[0]} offers practical experience in ${fallbackMentor.offers.slice(0, 40)}.`
    };
  }

  // 2. Find best Study Partner (someone who wants to learn the same thing)
  let bestPartner: Profile | null = null;
  let maxPartnerScore = 0;
  for (const c of candidates) {
    if (bestMentor && c.id === bestMentor.id) continue;
    const theirLearnWords = extractKeywords((c.learns || '') + ' ' + (c.needs || ''));
    const overlap = intersection(myLearnWords, theirLearnWords).length;
    if (overlap > maxPartnerScore) {
      maxPartnerScore = overlap;
      bestPartner = c;
    }
  }

  if (bestPartner) {
    result.studyPartner = {
      profile: bestPartner,
      reason: `Both you and ${bestPartner.name.split(' ')[0]} are focused on learning ${bestPartner.learns || 'similar skills'}.`
    };
  } else {
    const fallbackPartner = candidates.find(c => (!bestMentor || c.id !== bestMentor.id)) || candidates[1] || candidates[0];
    if (fallbackPartner) {
      result.studyPartner = {
        profile: fallbackPartner,
        reason: `${fallbackPartner.name.split(' ')[0]} is actively building skills and looking for project peers.`
      };
    }
  }

  return result;
}

export async function classifyPostWithGemma(
  body: string
): Promise<{ title: string; kind: Post['kind']; tags: string[] }> {
  const prompt = `Classify this short post for a campus student and builder network (${APP_NAME}).
Return ONLY JSON, no other text:
{
  "title": "<short descriptive title, maximum 6 words>",
  "kind": "<idea | need | offer | question>",
  "tags": ["<2 to 4 short lowercase topic tags>"]
}

POST:
${body}`;

  try {
    const result = await callGemma(prompt, { json: true, temperature: 0.2 });
    const validKinds: Post['kind'][] = ['idea', 'need', 'offer', 'question'];
    const kind = validKinds.includes(result.kind) ? result.kind : 'idea';
    const tags = (Array.isArray(result.tags) ? (result.tags as unknown[]) : [])
      .map((t: unknown) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, ''))
      .filter(Boolean)
      .slice(0, 4);

    return {
      title: String(result.title || '').trim().slice(0, 60),
      kind,
      tags: tags.length ? tags : ['hackathon', 'kampala']
    };
  } catch (err) {
    console.warn('Gemma post classification failed, using keyword fallback:', err);
    const words = Array.from(extractKeywords(body)).slice(0, 3);
    const isNeed = /need|looking for|seeking|require/i.test(body);
    const isOffer = /offer|can help|sharing|giving/i.test(body);
    const isQuestion = /\?|how do|what is|anyone know/i.test(body);
    const kind: Post['kind'] = isNeed ? 'need' : isOffer ? 'offer' : isQuestion ? 'question' : 'idea';

    return {
      title: body.slice(0, 40) + '...',
      kind,
      tags: words.length ? words : ['general']
    };
  }
}

// GitHub REST API
export async function fetchGitHubData(input: string): Promise<GitHubData | null> {
  const username = String(input)
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#\s]/)[0];

  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username)) {
    return null;
  }

  const out: GitHubData = { login: username };

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`);
    if (res.status === 404) {
      return { login: username, notfound: true };
    }
    if (!res.ok) {
      return out;
    }

    const repos = (await res.json()) as any[];
    if (Array.isArray(repos)) {
      const publicNonForks = repos.filter(r => !r.fork);
      const langsMap: Record<string, number> = {};
      publicNonForks.forEach(r => {
        if (r.language) {
          langsMap[r.language] = (langsMap[r.language] || 0) + 1;
        }
      });

      out.repos = publicNonForks.length;
      out.langs = Object.entries(langsMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      out.top = publicNonForks
        .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
        .slice(0, 4)
        .map(r => ({
          name: r.name,
          desc: r.description ? String(r.description).slice(0, 120) : '',
          lang: r.language,
          stars: r.stargazers_count || 0,
          url: r.html_url
        }));
    }
  } catch (e) {
    // Offline or rate-limited: continue without it
  }

  return out;
}

// Explicit connection request (Digital Public Goods Privacy compliance)
export async function requestMemberConnect(
  requesterId: string,
  targetId: string,
  reason?: string
): Promise<{ success: boolean; target_id: string; target_name: string; whatsapp: string; linkedin: string }> {
  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester_id: requesterId, target_id: targetId, reason })
  });
  if (!res.ok) {
    throw new Error('Could not establish connection request');
  }
  return await res.json();
}

// Delete member profile permanently (Digital Public Goods privacy indicator)
export async function deleteMemberProfile(profileId: string): Promise<boolean> {
  const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE'
  });
  return res.ok;
}

// Export member's complete data bundle (DPG Open Data / User Sovereignty indicator)
export async function exportMemberData(profile: Profile): Promise<string> {
  const [posts, follows, matches, notifs] = await Promise.all([
    db.list<Post>('posts', { eq: { author_id: profile.id } }),
    db.list<Follow>('follows', { eq: { follower_id: profile.id } }),
    db.list<any>('matches', {}),
    db.list<NotificationItem>('notifications', { eq: { to_id: profile.id } })
  ]);
  const userMatches = matches.filter(m => m.a_id === profile.id || m.b_id === profile.id);
  const bundle = {
    project: 'Kwegatta',
    standard_alignment: 'Digital Public Goods Standard',
    exported_at: new Date().toISOString(),
    profile,
    posts,
    follows,
    matches: userMatches,
    notifications: notifs
  };
  return JSON.stringify(bundle, null, 2);
}

// Shared Data Layer API
export const db = {
  async list<T>(
    collection: string,
    options: { eq?: Record<string, any>; limit?: number; after?: string; currentUserId?: string } = {}
  ): Promise<T[]> {
    const params = new URLSearchParams();
    if (options.eq) params.set('eq', JSON.stringify(options.eq));
    if (options.limit) params.set('limit', String(options.limit));
    if (options.after) params.set('after', options.after);

    let currentUserId = options.currentUserId;
    if (!currentUserId && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('kwegatta_current_profile');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id) currentUserId = parsed.id;
        }
      } catch (e) {
        // ignore
      }
    }

    const headers: Record<string, string> = {};
    if (currentUserId) {
      headers['x-user-id'] = currentUserId;
    }

    const res = await fetch(`/api/data/${collection}?${params.toString()}`, { headers });
    if (!res.ok) return [];
    return res.json();
  },

  async insert<T>(collection: string, row: Partial<T>): Promise<T> {
    const res = await fetch(`/api/data/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(`Failed to insert into ${collection}`);
    return res.json();
  },

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<T> {
    const res = await fetch(`/api/data/${collection}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error(`Failed to update ${collection}/${id}`);
    return res.json();
  },

  async remove(collection: string, id: string): Promise<boolean> {
    const res = await fetch(`/api/data/${collection}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async seedDemo(): Promise<number> {
    const res = await fetch('/api/demo/seed', { method: 'POST' });
    const data = await res.json();
    return data.count || 0;
  },

  async clearDemo(): Promise<number> {
    const res = await fetch('/api/demo/clear', { method: 'POST' });
    const data = await res.json();
    return data.count || 0;
  }
};
