import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sparkles,
  MessageCircle,
  AlertCircle,
  RefreshCw,
  Lightbulb,
  ExternalLink,
  QrCode,
  Check,
  UserPlus,
  Share2,
  Copy,
  Users,
  Compass,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Profile, MatchResult } from '../types';
import { matchCandidatesWithGemma, calculateKeywordMatches, db, APP_NAME, requestMemberConnect } from '../services/api';
import { formatWhatsAppUrl, generateQrCodeDataUrl } from '../utils';
import { MatchOverlapAvatars } from './MatchOverlapAvatars';
import { Avatar } from './Avatar';

interface MatchesViewProps {
  currentProfile: Profile;
  allProfiles: Profile[];
  followingIds: Set<string>;
  onToggleFollow: (targetId: string) => void;
  onViewProfile: (profileId: string) => void;
  onShowQr: () => void;
}

export const MatchesView: React.FC<MatchesViewProps> = ({
  currentProfile,
  allProfiles,
  followingIds,
  onToggleFollow,
  onViewProfile,
  onShowQr
}) => {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isAiUsed, setIsAiUsed] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newMembersCount, setNewMembersCount] = useState(0);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteQrDataUrl, setInviteQrDataUrl] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  const inviteUrl = `https://kwegatta.ai.studio/#/u/${currentProfile.id}`;

  useEffect(() => {
    generateQrCodeDataUrl(inviteUrl, 200).then(setInviteQrDataUrl).catch(() => {});
  }, [inviteUrl]);

  const candidates = allProfiles.filter(p => p.id !== currentProfile.id);

  const triggerFirstMatchCelebration = () => {
    const fired = sessionStorage.getItem('kw_confetti_fired');
    if (!fired) {
      sessionStorage.setItem('kw_confetti_fired', 'true');

      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([40, 60, 40]);
        }
      } catch (e) {
        // ignore
      }

      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.65 },
        colors: ['#F5B700', '#14B8A6', '#FFFFFF', '#3B82F6'],
        disableForReducedMotion: true
      });
    }
  };

  const loadMatches = async (forceFresh = false) => {
    setErrorMessage(null);

    const cacheKey = `kw_matches_${currentProfile.id}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached && !forceFresh) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.list && parsed.list.length > 0) {
          setMatches(parsed.list);
          setIsAiUsed(parsed.ai ?? true);
          setIsRefining(false);
          setIsLoading(false);
          const lastCount = parsed.count || 0;
          setNewMembersCount(Math.max(0, candidates.length - lastCount));
          triggerFirstMatchCelebration();
          return;
        }
      } catch (e) {
        // invalid cache
      }
    }

    // REQUIREMENT 3: SHOW KEYWORD MATCHES AT ONCE, LABELLED "Quick match"
    const quickMatches = calculateKeywordMatches(currentProfile, candidates);
    if (quickMatches.length > 0) {
      setMatches(quickMatches);
      triggerFirstMatchCelebration();
    }
    setIsLoading(false);
    setIsRefining(true);

    try {
      const res = await matchCandidatesWithGemma(currentProfile, candidates);
      // Replace each with Gemma result when it arrives, labelled 'AI match', without list jumping around
      if (res.list && res.list.length > 0) {
        setMatches(res.list.map(m => ({ ...m, matchType: 'ai' })));
        setIsAiUsed(true);
        if (res.error) {
          setErrorMessage(res.error);
        } else {
          setErrorMessage(null);
        }
        setNewMembersCount(0);

        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              list: res.list.map(m => ({ ...m, matchType: 'ai' })),
              ai: true,
              count: candidates.length,
              timestamp: Date.now()
            })
          );
        } catch (_) {}

        // Record match pairs in database
        for (const m of res.list) {
          await db.insert('matches', {
            a_id: currentProfile.id,
            b_id: m.id,
            score: m.score,
            reason: m.reason,
            spark: m.spark || ''
          });
        }
      }
    } catch (err: any) {
      console.warn('Gemma background matching failed, keeping quick matches:', err);
      // Keep quick matches, do not blank screen or throw error
      setIsAiUsed(false);
    } finally {
      setIsRefining(false);
    }
  };

  useEffect(() => {
    loadMatches(false);
  }, [currentProfile.id, candidates.length]);

  const handleConnect = async (match: MatchResult, targetProfile: Profile) => {
    const text =
      match.icebreaker ||
      `Hi ${targetProfile.name.split(' ')[0]}, I'm ${currentProfile.name}. I matched with you on ${APP_NAME} (${match.score}%) and I'd love to explore building together!`;

    setConnectedIds(prev => new Set(prev).add(targetProfile.id));

    try {
      const conn = await requestMemberConnect(currentProfile.id, targetProfile.id, match.reason);
      const waUrl = formatWhatsAppUrl(conn.whatsapp, text);
      const link = waUrl || conn.linkedin || targetProfile.linkedin;

      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.warn('Connect request fallback:', err);
      await db.insert('notifications', {
        to_id: targetProfile.id,
        from_id: currentProfile.id,
        type: 'connect',
        body: `${currentProfile.name} reached out to connect with you: "${match.reason}"`,
        read: false,
        created_at: new Date().toISOString()
      });
      if (targetProfile.linkedin) {
        window.open(targetProfile.linkedin, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="kw-container space-y-6 md:space-y-10">
      
      {/* Banner if model failed and fallback was used with explicit next step guidance */}
      {(!isAiUsed || errorMessage) && (
        <div className="p-3.5 bg-[var(--attention-subtle)] border border-[var(--attention)]/30 text-[var(--fg)] rounded-xl text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[var(--attention)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p>
              <span className="font-semibold text-[var(--attention)]">Keyword Matching Active:</span>{' '}
              {errorMessage || 'Gemma is currently busy'}. Results are calculated based on complementary skills.
            </p>
            <p className="text-[13px] text-[var(--fg-muted)]">
              What to do next: Click <button onClick={() => loadMatches(true)} className="underline text-[var(--gold-text)] font-medium inline">Refresh</button> to re-run AI inference, or explore members in the People tab.
            </p>
          </div>
        </div>
      )}

      {/* Main Section Header */}
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--card-border)] pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg sm:text-xl font-display font-bold text-[var(--fg)] tracking-tight">
              Recommended Collaborators
            </h2>
            {isRefining && (
              <span className="text-[13px] text-[var(--gold-text)] flex items-center gap-1.5 font-medium bg-[var(--gold-subtle)] px-2.5 py-0.5 rounded-full border border-[var(--gold)]/20 animate-pulse">
                <Sparkles className="w-3 h-3 animate-spin" />
                <span>Refining with Gemma 4...</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--fg-muted)]">
            Synthesized by Gemma 4 based on complementary needs, offers, and learning goals
          </p>
        </div>

        <button
          onClick={() => loadMatches(true)}
          disabled={isLoading || isRefining}
          className="kw-btn kw-btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1.5"
          title="Recalculate matches"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefining ? 'animate-spin' : ''}`} />
          <span>Refresh{newMembersCount > 0 ? ` (${newMembersCount} new)` : ''}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between text-xs text-[var(--fg-muted)] animate-pulse">
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--gold-text)] animate-spin" />
              Evaluating complementary profiles with Gemma 4...
            </span>
          </div>
          {/* Skeleton placeholders */}
          {[1, 2, 3].map(i => (
            <div key={i} className="py-5 border-b border-[var(--card-border)]/50 space-y-3 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-subtle)] border border-[var(--card-border)]" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-32 bg-[var(--bg-subtle)] rounded" />
                    <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded-full" />
                  </div>
                  <div className="h-3 w-3/4 bg-[var(--bg-subtle)] rounded" />
                </div>
                <div className="h-8 w-20 bg-[var(--bg-subtle)] rounded-xl" />
              </div>
              <div className="pl-14 space-y-1.5">
                <div className="h-3 w-5/6 bg-[var(--bg-subtle)] rounded" />
                <div className="h-10 w-full bg-[var(--bg-subtle)]/70 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="py-8 px-6 border border-dashed border-[var(--card-border)] rounded-2xl space-y-6 bg-[var(--card)]/40 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold-text)] grid place-items-center mx-auto">
            <Users className="w-6 h-6" />
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="font-bold text-base text-[var(--fg)]">Few members yet · Pioneer cohort</h3>
            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              You are among the first to join Kwegatta! As classmates and builders join with their skills and project needs, Gemma 4 will automatically surface your top collaborative matches here.
            </p>
          </div>

          {/* What happens next box */}
          <div className="max-w-lg mx-auto p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-left space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--gold-text)]">
              <Compass className="w-4 h-4" />
              <span>What happens next:</span>
            </div>
            <ol className="text-xs text-[var(--fg-muted)] space-y-2 pl-4 list-decimal leading-relaxed">
              <li>
                <strong className="text-[var(--fg)]">Invite people</strong>: Share your personal link with collaborators, students, and hackathon teammates.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Instant discovery</strong>: When they complete their profile, Gemma 4 evaluates what you offer vs what they need.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Real-time alerts</strong>: You'll see matched cards, why you complement each other, and mutual project opportunities.
              </li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setShowInviteModal(true)}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 font-semibold flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite people</span>
            </button>
            <button
              onClick={onShowQr}
              className="kw-btn kw-btn-ghost text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share my profile</span>
            </button>
          </div>

          {/* Inline Invite Dialog */}
          {showInviteModal && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="kw-card p-6 max-w-sm w-full space-y-4 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl text-center shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[var(--fg)]">Invite people to Kwegatta</h4>
                  <button onClick={() => setShowInviteModal(false)} className="text-[var(--fg-subtle)] hover:text-[var(--fg)] p-1">
                    ✕
                  </button>
                </div>

                {inviteQrDataUrl && (
                  <div className="p-3 bg-white rounded-xl inline-block mx-auto shadow-xs">
                    <img src={inviteQrDataUrl} alt="Invite QR" className="w-40 h-40 object-contain mx-auto" />
                  </div>
                )}

                <p className="text-xs text-[var(--fg-muted)]">
                  Scan this QR code or share your link to invite team members and classmates.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className="kw-input text-xs font-mono select-all flex-1"
                  />
                  <button
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(inviteUrl);
                        setCopiedInvite(true);
                        setTimeout(() => setCopiedInvite(false), 3000);
                      }
                    }}
                    className="kw-btn kw-btn-gold text-xs py-2 px-3 flex-shrink-0"
                  >
                    {copiedInvite ? <Check className="w-3.5 h-3.5 text-emerald-900" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedInvite ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[var(--card-border)]">
          {matches.map(m => {
            const profile = allProfiles.find(p => p.id === m.id);
            if (!profile) return null;
            const isConnected = connectedIds.has(profile.id);

            return (
              <div
                key={m.id}
                className="py-6 space-y-4 group animate-in fade-in duration-200"
              >
                {/* Member Overview */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <MatchOverlapAvatars
                      memberA={currentProfile}
                      memberB={profile}
                      score={m.score}
                      size={44}
                      animate={false}
                    />

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => onViewProfile(profile.id)}
                          className="font-semibold text-sm sm:text-base text-[var(--fg)] hover:text-[var(--gold-text)] transition-colors text-left"
                        >
                          {profile.name}
                        </button>
                        <span className="text-xs text-[var(--teal-text)] font-medium">
                          {profile.role}
                        </span>
                        {/* Requirement 3: Labelled Quick match or AI match */}
                        {m.matchType === 'quick' ? (
                          <span className="kw-badge text-[13px] bg-[var(--bg-subtle)] text-[var(--fg-muted)] border border-[var(--card-border)] flex items-center gap-1 font-medium transition-all">
                            <Zap className="w-2.5 h-2.5 text-[var(--gold-text)]" />
                            <span>Quick match</span>
                          </span>
                        ) : (
                          <span className="kw-badge text-[13px] bg-[var(--gold-subtle)] text-[var(--gold-text)] border border-[var(--gold)]/30 flex items-center gap-1 font-semibold transition-all animate-in fade-in">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>AI match</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--fg-muted)] leading-normal line-clamp-2 max-w-lg">
                        {profile.headline || profile.bio}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-start flex-shrink-0">
                    <button
                      onClick={() => onViewProfile(profile.id)}
                      className="kw-btn kw-btn-ghost text-xs py-1.5 px-3"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => handleConnect(m, profile)}
                      className={`kw-btn text-xs py-1.5 px-3 font-semibold ${
                        isConnected ? 'kw-btn-teal' : 'kw-btn-gold'
                      }`}
                    >
                      {isConnected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Connected</span>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Connect</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Match Narrative Reason */}
                <div className="text-xs text-[var(--fg-muted)] leading-relaxed pl-1 sm:pl-14">
                  <span className="text-[var(--fg)] font-medium">Why you match: </span>
                  <span>{m.reason}</span>
                </div>

                {/* Build Opportunity */}
                {m.spark && (
                  <div className="ml-1 sm:ml-14 p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] flex items-start gap-2.5 text-xs">
                    <Lightbulb className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[var(--fg)]">Opportunity: </span>
                      <span className="text-[var(--fg-muted)]">{m.spark}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
