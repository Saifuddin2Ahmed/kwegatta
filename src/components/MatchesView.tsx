import React, { useState, useEffect } from 'react';
import { Zap, Sparkles, MessageCircle, AlertCircle, RefreshCw, Lightbulb, UserPlus, UserCheck, ExternalLink, QrCode, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Profile, MatchResult } from '../types';
import { matchCandidatesWithGemma, db, APP_NAME, requestMemberConnect } from '../services/api';
import { formatWhatsAppUrl } from '../utils';
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

// Animated score counter component
const AnimatedScore: React.FC<{ target: number }> = ({ target }) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 700;
    const stepTime = 20;
    const totalSteps = duration / stepTime;
    const increment = target / totalSteps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCurrent(target);
        clearInterval(timer);
      } else {
        setCurrent(Math.round(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [target]);

  return <span>{current}%</span>;
};

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
  const [isAiUsed, setIsAiUsed] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newMembersCount, setNewMembersCount] = useState(0);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());

  const candidates = allProfiles.filter(p => p.id !== currentProfile.id);

  const triggerFirstMatchCelebration = () => {
    const fired = sessionStorage.getItem('kw_confetti_fired');
    if (!fired) {
      sessionStorage.setItem('kw_confetti_fired', 'true');

      // Light phone vibration
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([40, 60, 40]);
        }
      } catch (e) {
        // ignore
      }

      // Gold and teal celebratory confetti
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.65 },
        colors: ['#F5B700', '#12B5A6', '#FFFFFF', '#3B82F6'],
        disableForReducedMotion: true
      });
    }
  };

  const loadMatches = async (forceFresh = false) => {
    setIsLoading(true);
    setErrorMessage(null);

    const cacheKey = `kw_matches_${currentProfile.id}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached && !forceFresh) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.list && parsed.list.length > 0) {
          setMatches(parsed.list);
          setIsAiUsed(parsed.ai ?? true);
          const lastCount = parsed.count || 0;
          setNewMembersCount(Math.max(0, candidates.length - lastCount));
          setIsLoading(false);
          triggerFirstMatchCelebration();
          return;
        }
      } catch (e) {
        // invalid cache
      }
    }

    try {
      const res = await matchCandidatesWithGemma(currentProfile, candidates);
      setMatches(res.list);
      setIsAiUsed(res.ai);
      if (res.error) {
        setErrorMessage(res.error);
      }
      setNewMembersCount(0);

      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          list: res.list,
          ai: res.ai,
          count: candidates.length,
          timestamp: Date.now()
        })
      );

      if (res.list.length > 0) {
        triggerFirstMatchCelebration();
      }

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
    } catch (err: any) {
      setErrorMessage(err.message || 'Error executing match ranking');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMatches(false);
  }, [currentProfile.id, candidates.length]);

  const handleConnect = async (match: MatchResult, targetProfile: Profile) => {
    const text =
      match.icebreaker ||
      `Hi ${targetProfile.name.split(' ')[0]}, I'm ${currentProfile.name}. I matched with you on ${APP_NAME} (${match.score}%) and I'd love to explore building together!`;

    // Visual confirmation state
    setConnectedIds(prev => new Set(prev).add(targetProfile.id));

    try {
      // Connect request: records notification and returns protected WhatsApp number
      const conn = await requestMemberConnect(currentProfile.id, targetProfile.id, match.reason);
      const waUrl = formatWhatsAppUrl(conn.whatsapp, text);
      const link = waUrl || conn.linkedin || targetProfile.linkedin;

      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.warn('Connect request fallback:', err);
      // Fallback: direct notification
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
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Banner if model failed and fallback was used */}
      {(!isAiUsed || errorMessage) && (
        <div className="p-3 bg-[var(--attention-subtle)] border border-[var(--attention)] text-[var(--fg)] rounded-xl text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[var(--attention)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-[var(--attention)]">Basic match (AI unavailable):</span>{' '}
            {errorMessage || 'Gemma is currently answering other requests'}. These results are calculated using keyword matching so your networking is uninterrupted.
          </div>
        </div>
      )}

      {/* Main Matches Container */}
      <div className="kw-card bg-[var(--card)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-lg">
        <div className="kw-card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--gold)]" />
            <span className="text-sm font-bold text-[var(--fg)]">Top Complementary Matches</span>
            {isAiUsed ? (
              <span className="kw-badge kw-badge-gold text-[10px]">Gemma 4</span>
            ) : (
              <span className="kw-badge kw-badge-muted text-[10px]">Basic match</span>
            )}
          </div>

          <button
            onClick={() => loadMatches(true)}
            disabled={isLoading}
            className="kw-btn text-xs py-1.5 px-3 min-h-[32px] active:scale-95"
            title="Recalculate matches"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh{newMembersCount > 0 ? ` (${newMembersCount} new)` : ''}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-4">
            <div className="text-center space-y-2 pb-2">
              <div className="flex items-center justify-center gap-2 text-sm font-bold text-[var(--fg)]">
                <span>Gemma 4 is picking your complementary matches</span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
              <p className="text-xs text-[var(--fg-muted)]">
                Evaluating needs and offers across builders at Hack Day Kampala...
              </p>
            </div>

            {/* Skeleton Match Cards */}
            {[1, 2].map(n => (
              <div key={n} className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--bg-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full kw-skeleton" />
                    <div className="space-y-1.5">
                      <div className="w-28 h-3.5 kw-skeleton" />
                      <div className="w-44 h-2.5 kw-skeleton" />
                    </div>
                  </div>
                  <div className="w-16 h-6 rounded-full kw-skeleton" />
                </div>
                <div className="w-full h-10 rounded-lg kw-skeleton" />
              </div>
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center mx-auto">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[var(--fg)]">Be the first to connect</h3>
            <p className="text-xs text-[var(--fg-muted)] max-w-md mx-auto">
              Show your profile QR code to the person next to you in the room. As attendees join, Gemma 4 will automatically surface your top matches.
            </p>
            <button onClick={onShowQr} className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold active:scale-95">
              <QrCode className="w-3.5 h-3.5" />
              <span>Show my QR code</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {matches.map(m => {
              const profile = allProfiles.find(p => p.id === m.id);
              if (!profile) return null;
              const isFollowing = followingIds.has(profile.id);
              const isConnected = connectedIds.has(profile.id);

              return (
                <div
                  key={m.id}
                  className="p-5 space-y-3.5 hover:bg-[var(--card-hover)] transition-all animate-in fade-in duration-300"
                >
                  {/* Top row: Signature Overlapping Rings + Profile Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      {/* Signature Overlapping Circles Element */}
                      <MatchOverlapAvatars
                        memberA={currentProfile}
                        memberB={profile}
                        score={m.score}
                        size={48}
                        animate={true}
                      />

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => onViewProfile(profile.id)}
                            className="font-bold text-sm text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left"
                          >
                            {profile.name}
                          </button>
                          <span className="kw-badge kw-badge-teal text-[10px]">
                            {profile.role}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--fg-muted)] line-clamp-1 mt-0.5">
                          {profile.headline}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => onViewProfile(profile.id)}
                        className="kw-btn text-xs py-1.5 px-3 min-h-[34px]"
                      >
                        View Profile
                      </button>
                      <button
                        onClick={() => handleConnect(m, profile)}
                        className={`kw-btn text-xs py-1.5 px-3 min-h-[34px] font-bold ${
                          isConnected ? 'kw-btn-teal' : 'kw-btn-gold'
                        }`}
                      >
                        {isConnected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Message ready</span>
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

                  {/* Complementary match reason */}
                  <div className="text-xs text-[var(--fg)] leading-relaxed bg-[var(--bg-subtle)] p-3 rounded-xl border border-[var(--card-border)]">
                    <span className="text-[var(--gold)] font-bold mr-1">Why you match:</span>
                    <span>{m.reason}</span>
                  </div>

                  {/* Spark: project or small business idea */}
                  {m.spark && (
                    <div className="p-3 rounded-xl bg-[var(--gold-subtle)] border border-[rgba(245,183,0,0.3)] flex items-start gap-2.5 text-xs animate-in fade-in duration-500">
                      <Lightbulb className="w-4 h-4 text-[var(--gold)] flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[var(--gold)]">You could build: </strong>
                        <span className="text-[var(--fg)]">{m.spark}</span>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {profile.tags && profile.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {profile.tags.map(t => (
                        <span key={t} className="kw-badge kw-badge-muted text-[10px]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
