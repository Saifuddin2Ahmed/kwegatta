import { Profile, MatchResult, LearnMatchResult, Post, NotificationItem, Follow, GitHubData } from '../types';

/* =========================================================================
   OPEN-WEIGHT GEMMA MODELS:
   Default: 'gemma-4-26b-a4b-it' (benchmarked as 36x faster TTFT: 0.70s vs 25.58s)
   Fallback/Alternative: 'gemma-4-31b-it'
   ========================================================================= */
export const GEMMA_MODEL_ID = 'gemma-4-26b-a4b-it';
export const GEMMA_ALT_MODEL_ID = 'gemma-4-31b-it';

export const APP_NAME = 'Kwegatta';
export const PUBLIC_APP_URL = 'https://kwegatta.ai.studio';

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

  // Role complementarity: different roles get a bonus
  const myRoles = new Set(me.roles && me.roles.length ? me.roles : [me.role]);
  const theirRoles = new Set(candidate.roles && candidate.roles.length ? candidate.roles : [candidate.role]);
  const hasDistinctRole = [...myRoles].some(r => !theirRoles.has(r));
  const roleBonus = hasDistinctRole ? 15 : 0;

  // Intent alignment bonus (e.g. technical seeker with developer, business seeker with business)
  let intentBonus = 0;
  const myIntent = (me.intent || '').toLowerCase();
  const theirIntent = (candidate.intent || '').toLowerCase();
  if (myIntent.includes('technical') && theirRoles.has('Developer')) intentBonus += 15;
  if (myIntent.includes('business') && (theirRoles.has('Business') || theirRoles.has('Founder'))) intentBonus += 15;
  if (myIntent.includes('co-founder') && theirIntent.includes('co-founder')) intentBonus += 12;
  if (myIntent.includes('mentor') && (candidate.teaches || theirRoles.has('Mentor'))) intentBonus += 12;

  // Location compatibility bonus
  const locBonus = (me.location && candidate.location && (
    me.location.toLowerCase() === candidate.location.toLowerCase() ||
    me.location.toLowerCase() === 'remote' ||
    candidate.location.toLowerCase() === 'remote'
  )) ? 8 : 0;

  return Math.min(98, Math.max(30, complementCount * 18 + tagOverlap * 6 + roleBonus + intentBonus + locBonus));
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
    const cRole = (candidate.roles && candidate.roles.length ? candidate.roles.join('/') : candidate.role) || 'collaborator';
    const mRole = (me.roles && me.roles.length ? me.roles.join('/') : me.role) || 'collaborator';
    reason = `You and ${candidate.name.split(' ')[0]} bring complementary ${cRole} and ${mRole} perspectives to collaborate.`;
  }

  const firstName = candidate.name.split(' ')[0];
  const myFirstName = me.name.split(' ')[0];

  return {
    id: candidate.id,
    score,
    reason,
    spark: `A project combining ${me.offers ? me.offers.slice(0, 30) : 'your expertise'} with ${candidate.offers ? candidate.offers.slice(0, 30) : 'their expertise'}.`,
    icebreaker: `Hi ${firstName}, I'm ${myFirstName}. I found you on ${APP_NAME} and noticed our skills align. Would you like to connect?`
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
            temperature: options.temperature ?? 0.1
          }
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data?.error?.message || `Server status ${res.status}`;
        lastError = new Error(errorMsg);

        // Retry immediately once on 500, 503, or timeout
        if (attempt < retries && (res.status === 500 || res.status === 503 || res.status === 408)) {
          console.warn(`[Gemma Client] Status ${res.status}, retrying immediately...`);
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
        console.warn(`[Gemma Client] Attempt ${attempt + 1} error: ${err.message}. Retrying immediately...`);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Gemma call failed');
}

// Stream Gemma tokens directly to client
export async function callGemmaStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  options: { model?: string; temperature?: number } = {}
): Promise<string> {
  const res = await fetch('/api/gemma/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || GEMMA_MODEL_ID,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.1
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Streaming failed: HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No readable stream');

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.text) {
            accumulated += parsed.text;
            onChunk(parsed.text);
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (_) {}
      }
    }
  }

  return accumulated;
}

export function getProfileFingerprint(p: Profile): string {
  if (!p) return '';
  return `${p.name || ''}|${p.offers || ''}|${p.needs || ''}|${p.role || ''}|${(p.roles || []).join(',')}|${p.intent || ''}|${p.stage || ''}|${p.location || ''}`;
}

export function getCachedPairMatch(me: Profile, candidate: Profile): MatchResult | null {
  try {
    const key = `kw_pair_${[me.id, candidate.id].sort().join('_')}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const myFp = getProfileFingerprint(me);
    const candFp = getProfileFingerprint(candidate);
    if (parsed.verA === myFp && parsed.verB === candFp && parsed.result) {
      return { ...parsed.result, matchType: 'ai' };
    }
  } catch (_) {}
  return null;
}

export function setCachedPairMatch(me: Profile, candidate: Profile, result: MatchResult) {
  try {
    const key = `kw_pair_${[me.id, candidate.id].sort().join('_')}`;
    const payload = {
      verA: getProfileFingerprint(me),
      verB: getProfileFingerprint(candidate),
      result: {
        id: candidate.id,
        score: result.score,
        reason: result.reason,
        spark: result.spark,
        icebreaker: result.icebreaker,
        matchType: 'ai'
      },
      time: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(payload));
    fetch('/api/matches/pair-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        a: me.id,
        b: candidate.id,
        verA: payload.verA,
        verB: payload.verB,
        result: payload.result
      })
    }).catch(() => {});
  } catch (_) {}
}

export function calculateKeywordMatches(me: Profile, candidates: Profile[]): MatchResult[] {
  return candidates
    .map(c => ({
      candidate: c,
      score: calculateHeuristicScore(me, c)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => ({
      ...createFallbackMatch(me, item.candidate, item.score),
      matchType: 'quick'
    }));
}

export async function buildProfileWithGemma(
  data: Partial<Profile>,
  extraInstruction?: string
): Promise<{ headline: string; bio: string; tags: string[]; skills: string[]; role: string; ai: boolean; error?: string }> {
  const gh = data.gh;
  const rolesStr = (data.roles && data.roles.length > 0 ? data.roles.join(', ') : data.role) || 'Member';
  const prompt = `You write professional, concise member profiles for ${APP_NAME}, a collaborative community network.
CRITICAL RULES:
- Use ONLY the facts provided in INPUT.
- NEVER invent skills, employers, degrees, universities, awards or achievements not explicitly stated.
- Simple, authentic English. First person voice for the bio.

INPUT:
Name: ${data.name}
What brings them here (Intent): ${data.intent || '-'}
Project Stage: ${data.stage || '-'}
Role(s): ${rolesStr}
Location: ${data.location || '-'}
Hours available: ${data.hours_per_week || '-'}
What they offer: ${data.offers || '-'}
What they need: ${data.needs || '-'}
What they can teach: ${data.teaches || '-'}
What they want to learn: ${data.learns || '-'}
GitHub: ${gh?.login ? `@${gh.login}, ${gh.repos ?? 0} public repos, main languages: ${(gh.langs || []).join(', ') || 'unknown'}` : 'not provided'}
LinkedIn/Website: ${data.linkedin || data.website || 'not provided'}
${data.bio ? 'Current draft bio: ' + data.bio : ''}
${extraInstruction ? 'User custom instruction: ' + extraInstruction : ''}

Return ONLY this JSON, no other text:
{
  "headline": "<max 8 words summary>",
  "bio": "<2 sentences, maximum 45 words total, using only stated facts>",
  "tags": ["<3 to 6 short lowercase topic tags>"],
  "skills": ["<up to 6 concrete skills mentioned>"],
  "role": "<Founder | Business | Developer | Designer | Domain expert | Mentor | Student>"
}`;

  try {
    const result = await callGemma(prompt, { json: true, temperature: 0.3 });
    const primaryRole = (Array.isArray(data.roles) && data.roles[0]) || (typeof data.role === 'string' && data.role) || result.role || 'Member';

    return {
      headline: String(result.headline || data.offers?.slice(0, 50) || 'Collaborator').trim().slice(0, 80),
      bio: String(result.bio || `I offer ${data.offers}. I am looking for ${data.needs}.`).trim().slice(0, 320),
      tags: (Array.isArray(result.tags) ? (result.tags as unknown[]) : []).map((t: unknown) => String(t).toLowerCase().replace(/[^a-z0-9+#-]/g, '')).filter(Boolean).slice(0, 6),
      skills: (Array.isArray(result.skills) ? (result.skills as unknown[]) : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 6),
      role: primaryRole,
      ai: true
    };
  } catch (err: any) {
    console.warn('Gemma profile synthesis failed, using rule-based fallback:', err);
    const primaryRole = (Array.isArray(data.roles) && data.roles[0]) || (typeof data.role === 'string' && data.role) || 'Member';
    const tags = Array.from(
      new Set([
        ...Array.from(extractKeywords(data.offers || '')).slice(0, 3),
        ...Array.from(extractKeywords(data.needs || '')).slice(0, 2)
      ])
    ).slice(0, 5);

    return {
      headline: data.offers?.slice(0, 60) || 'Kwegatta member',
      bio: `I offer ${data.offers || 'my skills'}. I am looking for ${data.needs || 'collaborators'}.`,
      tags,
      skills: tags,
      role: primaryRole,
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

  // 1. Check pair cache first
  const cachedMatches: MatchResult[] = [];
  const uncachedCandidates: Profile[] = [];

  for (const c of candidates) {
    const cached = getCachedPairMatch(me, c);
    if (cached) {
      cachedMatches.push(cached);
    } else {
      uncachedCandidates.push(c);
    }
  }

  // If we already have 3 or more cached matches, return them immediately without calling Gemma!
  if (cachedMatches.length >= 3) {
    cachedMatches.sort((a, b) => b.score - a.score);
    return { list: cachedMatches.slice(0, 3), ai: true };
  }

  // 2. Pre-rank at most 15 candidates using complementary heuristic
  const preRanked = (uncachedCandidates.length > 0 ? uncachedCandidates : candidates)
    .map(candidate => ({
      candidate,
      heuristicScore: calculateHeuristicScore(me, candidate)
    }))
    .sort((a, b) => b.heuristicScore - a.heuristicScore)
    .slice(0, 15);

  const formatSummary = (p: Profile, index?: number) => {
    const rolesStr = (p.roles && p.roles.length > 0 ? p.roles.join(', ') : p.role) || '-';
    const prefix = index !== undefined ? `${index + 1}. ID: ${p.id} | ` : '';
    const parts = [
      `${prefix}Name: ${p.name}`,
      `Role: ${rolesStr}`,
      p.location ? `Loc: ${p.location}` : '',
      p.intent ? `Intent: ${p.intent}` : '',
      p.stage ? `Stage: ${p.stage}` : '',
      p.offers ? `Offers: ${p.offers}` : '',
      p.needs ? `Needs: ${p.needs}` : ''
    ].filter(Boolean);
    return parts.join(' | ');
  };

  const prompt = `You are the matching engine of ${APP_NAME}, a collaborative community network.
CRITICAL INSTRUCTIONS:
- Directly output the JSON array. Do not output any thought process, preamble, or markdown tags.
- Complementary pairs: the best match is someone whose OFFERS cover what the other person NEEDS, aligning with their intent, stage, role and location. Prefer complementary pairs.
- Gemma uses ONLY what the member wrote; it NEVER invents skills, experience, or achievements.

ME:
${formatSummary(me)}

CANDIDATES:
${preRanked.map((item, index) => formatSummary(item.candidate, index)).join('\n')}

Pick the top 3 best complementary partners for ME. Return ONLY a JSON array, no other text:
[
  {
    "n": <candidate index number 1 to ${preRanked.length}>,
    "score": <match score integer 0-100>,
    "reason": "<one concrete sentence: who needs what from whom, referencing their offers, needs, intent and stage>",
    "spark": "<one specific project, collaboration, or startup the two could build together, max 20 words>",
    "icebreaker": "<a warm, friendly first WhatsApp message from ME to the candidate, max 40 words>"
  }
]`;

  try {
    const rawMatches = await callGemma(prompt, { json: true, temperature: 0.1 });
    const matchesArray = Array.isArray(rawMatches) ? rawMatches : (rawMatches.matches || []);

    const newResults: MatchResult[] = [];
    for (const m of matchesArray) {
      const idx = Number(m.n) - 1;
      const found = preRanked[idx]?.candidate;
      if (found) {
        const item: MatchResult = {
          id: found.id,
          score: Math.min(100, Math.max(0, Math.round(Number(m.score) || 75))),
          reason: String(m.reason || '').trim().slice(0, 250),
          spark: String(m.spark || '').trim().slice(0, 160),
          icebreaker: String(m.icebreaker || '').trim().slice(0, 250),
          matchType: 'ai'
        };
        newResults.push(item);
        // Cache this pair match
        setCachedPairMatch(me, found, item);
      }
    }

    const combined = [...newResults, ...cachedMatches];
    // Remove duplicates by candidate id and sort by score
    const uniqueMap = new Map<string, MatchResult>();
    for (const item of combined) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    }
    const finalMatches = Array.from(uniqueMap.values()).sort((a, b) => b.score - a.score);

    if (finalMatches.length > 0) {
      return { list: finalMatches.slice(0, 3), ai: true };
    }
    throw new Error('Gemma returned empty match array');
  } catch (err: any) {
    console.warn('Gemma matching failed, using heuristic match ranking:', err);
    const fallbackList = preRanked.slice(0, 3).map(item => ({
      ...createFallbackMatch(me, item.candidate, item.heuristicScore),
      matchType: 'quick' as const
    }));
    return { list: fallbackList, ai: false, error: err.message };
  }
}

export async function reportMember(
  reportedId: string,
  reason: string,
  details?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reported_id: reportedId, reason, details })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit report');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
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
  const prompt = `Classify this short post for an open collaboration community (${APP_NAME}).
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

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('kw_auth_token');
}

export function setAuthToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('kw_auth_token', token);
  }
}

export function getAuthHeaders(existingHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...existingHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (typeof window !== 'undefined') {
    const adminToken = sessionStorage.getItem('kw_admin_token');
    if (adminToken) {
      headers['x-admin-token'] = adminToken;
    }
  }
  return headers;
}

export async function ensureAuthToken(userId: string): Promise<string | null> {
  const existing = getAuthToken();
  if (existing) return existing;
  try {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        setAuthToken(data.token);
        return data.token;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// Explicit connection request (Digital Public Goods Privacy compliance)
export async function requestMemberConnect(
  requesterId: string,
  targetId: string,
  reason?: string
): Promise<{ success: boolean; target_id: string; target_name: string; whatsapp: string; linkedin: string }> {
  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
    method: 'DELETE',
    headers: getAuthHeaders()
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
    try {
      const params = new URLSearchParams();
      if (options.eq) params.set('eq', JSON.stringify(options.eq));
      if (options.limit) params.set('limit', String(options.limit));
      if (options.after) params.set('after', options.after);

      const headers = getAuthHeaders();

      const res = await fetch(`/api/data/${collection}?${params.toString()}`, { headers });
      if (!res.ok) {
        const cached = typeof window !== 'undefined' ? localStorage.getItem(`kw_cache_${collection}`) : null;
        if (cached) {
          try { return JSON.parse(cached); } catch (e) {}
        }
        return [];
      }
      const data = await res.json();
      if (Array.isArray(data) && !options.eq && !options.after && typeof window !== 'undefined') {
        try {
          localStorage.setItem(`kw_cache_${collection}`, JSON.stringify(data.slice(0, 100)));
        } catch (e) {}
      }
      return data;
    } catch (err) {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(`kw_cache_${collection}`) : null;
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
      return [];
    }
  },

  async insert<T>(collection: string, row: Partial<T>): Promise<T> {
    try {
      const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`/api/data/${collection}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(row)
      });
      if (!res.ok) throw new Error(`Failed to insert into ${collection}`);
      const data = await res.json();
      if (collection === 'profiles' && data.token) {
        setAuthToken(data.token);
      }
      return data;
    } catch (err: any) {
      console.warn(`[db.insert] error for ${collection}:`, err.message);
      return row as T;
    }
  },

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<T> {
    try {
      const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`/api/data/${collection}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error(`Failed to update ${collection}/${id}`);
      return res.json();
    } catch (err: any) {
      console.warn(`[db.update] error for ${collection}:`, err.message);
      return patch as T;
    }
  },

  async remove(collection: string, id: string): Promise<boolean> {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/data/${collection}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers
      });
      return res.ok;
    } catch (err: any) {
      console.warn(`[db.remove] error for ${collection}:`, err.message);
      return false;
    }
  },

  async seedDemo(): Promise<number> {
    try {
      const res = await fetch('/api/demo/seed', { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      return data.count || 0;
    } catch (e) {
      return 0;
    }
  },

  async clearDemo(): Promise<number> {
    try {
      const res = await fetch('/api/demo/clear', { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      return data.count || 0;
    } catch (e) {
      return 0;
    }
  },

  async importMembers(data: any): Promise<{ success: boolean; count: number; message: string }> {
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to import members');
    }
    return result;
  }
};
