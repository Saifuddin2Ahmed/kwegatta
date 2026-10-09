import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  UserPlus,
  UserCheck,
  X,
  Sparkles,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  MapPin,
  Lock,
  MessageSquare,
  Share2,
  Copy,
  Check,
  Compass,
  QrCode,
  Users
} from 'lucide-react';
import { Profile, AskKwegattaMatch } from '../types';
import { Avatar } from './Avatar';
import { askKwegatta } from '../services/api';
import { generateQrCodeDataUrl } from '../utils';

interface PeopleViewProps {
  currentProfile: Profile | null;
  allProfiles: Profile[];
  followingIds: Set<string>;
  followerIds: Set<string>;
  onToggleFollow: (id: string) => void;
  onViewProfile: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTag: string | null;
  onSelectTag: (t: string | null) => void;
  onOpenSignIn?: () => void;
}

const EXAMPLE_QUERIES = [
  'I need someone who knows solar energy in Gulu',
  'Who can teach me accounting?',
  'Build me a team for a farming app'
];

export const PeopleView: React.FC<PeopleViewProps> = ({
  currentProfile,
  allProfiles,
  followingIds,
  followerIds,
  onToggleFollow,
  onViewProfile,
  searchQuery,
  onSearchChange,
  selectedTag,
  onSelectTag,
  onOpenSignIn
}) => {
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'following' | 'followers' | 'Founder' | 'Business' | 'Developer' | 'Designer' | 'Domain expert' | 'Mentor' | 'Student' | string
  >('all');

  // Ask Kwegatta Natural Language Search State
  const [askInput, setAskInput] = useState('');
  const [activeAskQuery, setActiveAskQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResults, setAskResults] = useState<Array<{ profile: Profile; reason?: string }>>([]);
  const [askSource, setAskSource] = useState<'keyword' | 'gemma' | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const searchRequestIdRef = useRef(0);

  // Trigger Ask Kwegatta
  const handleAskSubmit = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) return;

    setActiveAskQuery(clean);
    setAskInput(clean);
    setAskError(null);

    const thisRequestId = ++searchRequestIdRef.current;

    // 1. Instant Keyword Results (immediate client-side match)
    const keywords = clean.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const candidateProfiles = allProfiles.filter(p => !currentProfile || p.id !== currentProfile.id);

    const scored = candidateProfiles
      .map(p => {
        const haystack = `${p.name} ${p.role} ${p.headline} ${p.offers} ${p.needs} ${p.teaches || ''} ${p.learns || ''} ${(p.skills || []).join(' ')} ${(p.tags || []).join(' ')} ${p.location || ''}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (haystack.includes(kw)) score++;
        }
        return { profile: p, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Set immediate keyword results
    setAskResults(scored.map(s => ({
      profile: s.profile,
      reason: `Matches terms in their ${s.profile.role || 'profile'} description.`
    })));
    setAskSource('keyword');
    setIsAsking(true);

    // 2. Call backend Ask Kwegatta endpoint powered by Gemma
    try {
      const gemmaMatches: AskKwegattaMatch[] = await askKwegatta(clean);

      if (searchRequestIdRef.current === thisRequestId) {
        setIsAsking(false);

        if (gemmaMatches && gemmaMatches.length > 0) {
          const resolved: Array<{ profile: Profile; reason?: string }> = gemmaMatches
            .map(m => {
              const fullProf = m.profile || allProfiles.find(p => p.id === m.profile_id);
              if (!fullProf) return null;
              return {
                profile: fullProf,
                reason: m.reason
              };
            })
            .filter(Boolean) as Array<{ profile: Profile; reason?: string }>;

          if (resolved.length > 0) {
            // Replace keyword results with Gemma response
            setAskResults(resolved);
            setAskSource('gemma');
            return;
          }
        }

        // Keep keyword results if Gemma returned empty or fallback
        if (scored.length > 0) {
          setAskSource('keyword');
        } else {
          setAskResults([]);
          setAskSource('gemma');
        }
      }
    } catch (err: any) {
      if (searchRequestIdRef.current === thisRequestId) {
        setIsAsking(false);
        if (scored.length === 0) {
          setAskError(err.message || 'Could not complete semantic search.');
        }
      }
    }
  };

  const handleClearAsk = () => {
    setActiveAskQuery('');
    setAskInput('');
    setAskResults([]);
    setAskSource(null);
    setAskError(null);
  };

  // Standard Directory Filtering (used when Ask Kwegatta is not active)
  const filtered = allProfiles
    .filter(p => !currentProfile || p.id !== currentProfile.id)
    .filter(p => {
      if (roleFilter === 'all') return true;
      if (roleFilter === 'following') return followingIds.has(p.id);
      if (roleFilter === 'followers') return followerIds.has(p.id);
      const memberRoles = p.roles && p.roles.length > 0 ? p.roles : [p.role];
      return memberRoles.some(
        r => r?.toLowerCase() === roleFilter.toLowerCase() || (roleFilter === 'Developer' && r?.toLowerCase() === 'builder')
      );
    })
    .filter(p => {
      if (!selectedTag) return true;
      return (p.tags || []).includes(selectedTag);
    })
    .filter(p => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const combined = [
        p.name,
        p.headline,
        p.offers,
        p.needs,
        p.intent || '',
        p.stage || '',
        p.location || '',
        p.teaches || '',
        p.learns || '',
        ...(p.roles || []),
        ...(p.tags || []),
        ...(p.skills || [])
      ]
        .join(' ')
        .toLowerCase();
      return combined.includes(q);
    });

  const filterButtons = [
    { id: 'all', label: 'All People' },
    { id: 'following', label: 'Following' },
    { id: 'followers', label: 'Followers' },
    { id: 'Founder', label: 'Founders' },
    { id: 'Business', label: 'Business' },
    { id: 'Developer', label: 'Developers' },
    { id: 'Designer', label: 'Designers' },
    { id: 'Mentor', label: 'Mentors' },
    { id: 'Domain expert', label: 'Domain Experts' },
    { id: 'Researcher', label: 'Researchers' },
    { id: 'Student', label: 'Students' }
  ];

  return (
    <div className="kw-container space-y-6 md:space-y-10">
      {/* Ask Kwegatta AI Search Panel */}
      <div className="kw-card bg-[var(--card)] border border-[var(--gold)]/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-display text-[var(--fg)] tracking-tight">
                Ask Kwegatta
              </h2>
              <p className="text-xs text-[var(--fg-muted)]">
                Find collaborators by describing what you need in plain sentences.
              </p>
            </div>
          </div>
          {activeAskQuery && (
            <button
              onClick={handleClearAsk}
              className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] underline cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>

        {/* Signed-in Search Input or Signed-out CTA */}
        {currentProfile ? (
          <div className="space-y-3">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleAskSubmit(askInput);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]" />
                <input
                  type="text"
                  placeholder='e.g. "I need someone who knows solar energy in Gulu", "Who can teach me accounting?"'
                  value={askInput}
                  onChange={e => setAskInput(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] focus:border-[var(--gold)] text-xs sm:text-sm text-[var(--fg)] rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                />
              </div>
              <button
                type="submit"
                disabled={!askInput.trim() || isAsking}
                className="kw-btn kw-btn-gold text-xs sm:text-sm px-5 py-2.5 font-bold flex items-center gap-2 cursor-pointer active:scale-95 shadow-sm disabled:opacity-40"
              >
                {isAsking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Ask</span>
                  </>
                )}
              </button>
            </form>

            {/* Example prompt pills */}
            {!activeAskQuery && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[13px] text-[var(--fg-subtle)] font-medium mr-1">Try:</span>
                {EXAMPLE_QUERIES.map(ex => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => handleAskSubmit(ex)}
                    className="text-[13px] py-1 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer transition-colors active:scale-95"
                  >
                    "{ex}"
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Signed-out visitors see: Sign in to ask Kwegatta */
          <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-xs text-[var(--fg)]">
              <Lock className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
              <div>
                <span className="font-semibold text-[var(--fg)]">Sign in to ask Kwegatta</span>
                <p className="text-[13px] text-[var(--fg-muted)]">
                  Ask in plain sentences to match with collaborators across Kampala and beyond.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSignIn}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold active:scale-95 shadow-sm whitespace-nowrap cursor-pointer"
            >
              Sign in to ask Kwegatta
            </button>
          </div>
        )}

        {/* Ask Kwegatta Status & Result Feed */}
        {activeAskQuery && (
          <div className="pt-2 border-t border-[var(--card-border)] space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--fg)]">Results for:</span>
                <span className="text-[var(--gold)] italic font-medium">"{activeAskQuery}"</span>
              </div>
              <div className="text-[13px] text-[var(--fg-muted)] flex items-center gap-1.5">
                {isAsking ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin text-[var(--gold)]" />
                    <span>Gemma 4 is analyzing profiles...</span>
                  </>
                ) : askSource === 'gemma' ? (
                  <span className="text-[var(--teal)] font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Gemma semantic match
                  </span>
                ) : (
                  <span>Keyword results</span>
                )}
              </div>
            </div>

            {askResults.length === 0 && !isAsking ? (
              <div className="p-6 text-center text-xs text-[var(--fg-muted)] border border-dashed border-[var(--card-border)] rounded-xl">
                No matching members found for this specific query. Try describing skills, roles or cities in a different way.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {askResults.map(({ profile: person, reason }) => {
                  const isFollowing = followingIds.has(person.id);
                  return (
                    <div
                      key={person.id}
                      className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--bg-subtle)]/60 hover:border-[var(--gold)]/60 transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-3 min-w-0">
                            <button onClick={() => onViewProfile(person.id)} className="flex-shrink-0">
                              <Avatar profile={person} className="w-10 h-10 ring-1 ring-[var(--gold)]/30" />
                            </button>
                            <div className="min-w-0">
                              <button
                                onClick={() => onViewProfile(person.id)}
                                className="font-bold text-xs sm:text-sm text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left truncate block"
                              >
                                {person.name}
                              </button>
                              <div className="flex items-center gap-1.5 text-xs text-[var(--teal)] font-medium">
                                <span>{person.role}</span>
                                {person.location && (
                                  <>
                                    <span className="text-[var(--fg-subtle)]">·</span>
                                    <span className="text-[var(--fg-muted)] flex items-center gap-0.5">
                                      <MapPin className="w-2.5 h-2.5" />
                                      {person.location}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => onToggleFollow(person.id)}
                            className="kw-btn kw-btn-ghost text-xs py-1 px-2.5 flex-shrink-0"
                          >
                            {isFollowing ? (
                              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <UserPlus className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* One-sentence reason why they fit */}
                        {reason && (
                          <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--gold)]/20 text-xs text-[var(--fg)] leading-relaxed flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0 mt-0.5" />
                            <span className="text-[13px] sm:text-xs">{reason}</span>
                          </div>
                        )}

                        <p className="text-[13px] text-[var(--fg-muted)] line-clamp-2">
                          {person.offers || person.headline}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--card-border)]/50 text-xs">
                        <div className="flex flex-wrap gap-1.5 text-[13px] text-[var(--fg-subtle)]">
                          {person.tags?.slice(0, 2).map(t => (
                            <button
                              key={t}
                              onClick={() => onSelectTag(t)}
                              className="hover:text-[var(--gold)] transition-colors"
                            >
                              #{t}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => onViewProfile(person.id)}
                          className="text-xs font-semibold text-[var(--gold)] hover:underline flex items-center gap-1"
                        >
                          <span>Profile</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Directory Section Header & Filter Controls */}
      <div className="space-y-4 border-b border-[var(--card-border)] pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-bold text-[var(--fg)] tracking-tight">
              Community Directory
            </h2>
            <p className="text-xs text-[var(--fg-muted)] mt-0.5">
              Showing {filtered.length} {filtered.length === 1 ? 'person' : 'people and collaborators'}
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)] pointer-events-none" />
            <input
              type="search"
              placeholder="Filter by name, skill, need..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="kw-input pl-10 text-xs py-1.5"
              aria-label="Filter directory"
            />
          </div>
        </div>

        {/* Role Segmented Controls */}
        <div className="flex flex-wrap gap-1.5 items-center pt-1">
          {filterButtons.map(fb => (
            <button
              key={fb.id}
              onClick={() => setRoleFilter(fb.id as any)}
              className={`text-xs py-1 px-2.5 rounded-md transition-colors ${
                roleFilter === fb.id
                  ? 'bg-[var(--fg)] text-[var(--bg)] font-semibold shadow-xs'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {fb.label}
            </button>
          ))}

          {selectedTag && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--gold)] ml-2">
              <span>#{selectedTag}</span>
              <button
                onClick={() => onSelectTag(null)}
                className="hover:opacity-80 p-0.5"
                aria-label="Clear tag"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Standard Directory Grid */}
      {filtered.length === 0 ? (
        <div className="py-12 px-6 text-center space-y-6 border border-dashed border-[var(--card-border)] rounded-2xl bg-[var(--card)]/40">
          <div className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center mx-auto">
            <Users className="w-6 h-6" />
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="font-bold text-base text-[var(--fg)]">No members found</h3>
            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              {searchQuery || roleFilter !== 'all' || selectedTag
                ? 'Try adjusting your search query, selecting another role category, or clearing active tag filters.'
                : 'You are among the first members here. Invite your network to start matching on skills, offers, and projects.'}
            </p>
          </div>

          {/* What happens next guide */}
          <div className="max-w-lg mx-auto p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-left space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--gold)]">
              <Compass className="w-4 h-4" />
              <span>What happens next:</span>
            </div>
            <ol className="text-xs text-[var(--fg-muted)] space-y-2 pl-4 list-decimal leading-relaxed">
              <li>
                <strong className="text-[var(--fg)]">Invite collaborators</strong>: Share your personal profile invite link with peers across tech stacks.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Profile indexing</strong>: Every member's headline, needs, offers, and learning goals are indexed automatically.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Natural language search</strong>: Ask Kwegatta queries search across open-weight embeddings.
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {(searchQuery || roleFilter !== 'all' || selectedTag) && (
              <button
                onClick={() => {
                  onSearchChange('');
                  setRoleFilter('all');
                  onSelectTag(null);
                }}
                className="kw-btn kw-btn-ghost text-xs py-2 px-4"
              >
                Reset Filters
              </button>
            )}

            {currentProfile && (
              <>
                <button
                  onClick={() => {
                    const inviteUrl = `https://kwegatta.ai.studio/#/u/${currentProfile.id}`;
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(inviteUrl);
                    }
                  }}
                  className="kw-btn kw-btn-gold text-xs py-2 px-4 font-semibold flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite people</span>
                </button>
                <button
                  onClick={() => onViewProfile(currentProfile.id)}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share my profile</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(person => {
            const isFollowing = followingIds.has(person.id);

            return (
              <div
                key={person.id}
                className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--card-border)]/80 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => onViewProfile(person.id)}
                        className="flex-shrink-0 cursor-pointer"
                      >
                        <Avatar profile={person} className="w-10 h-10" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => onViewProfile(person.id)}
                          className="font-semibold text-sm text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left break-words line-clamp-2 block cursor-pointer"
                        >
                          {person.name}
                        </button>
                        <span className="text-xs text-[var(--teal-text)] font-medium">
                          {person.role}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleFollow(person.id)}
                      className="kw-btn kw-btn-ghost text-xs py-1 px-2.5 flex-shrink-0 ml-2"
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Bio / Headline */}
                  <p className="text-xs text-[var(--fg-muted)] leading-relaxed line-clamp-2">
                    {person.headline || person.offers}
                  </p>

                  {/* Looking for */}
                  {person.needs && (
                    <div className="text-xs text-[var(--fg-muted)] bg-[var(--bg-subtle)] p-2.5 rounded-lg">
                      <span className="text-[var(--fg)] font-medium">Looking for: </span>
                      <span>{person.needs}</span>
                    </div>
                  )}
                </div>

                {/* Footer tags and profile link */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--card-border)]/50 text-xs">
                  <div className="flex flex-wrap gap-2 text-[13px] text-[var(--fg-subtle)]">
                    {person.tags?.slice(0, 3).map(t => (
                      <button
                        key={t}
                        onClick={() => onSelectTag(t)}
                        className="hover:text-[var(--fg)] transition-colors"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => onViewProfile(person.id)}
                    className="text-xs font-medium text-[var(--gold-text)] hover:underline"
                  >
                    View profile
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
