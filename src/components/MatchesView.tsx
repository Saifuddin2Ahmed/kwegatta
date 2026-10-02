import React, { useState, useEffect } from 'react';
import { Zap, Sparkles, MessageCircle, AlertCircle, RefreshCw, Lightbulb, UserPlus, UserCheck, ExternalLink, QrCode } from 'lucide-react';
import { Profile, MatchResult } from '../types';
import { matchCandidatesWithGemma, db, APP_NAME, requestMemberConnect } from '../services/api';
import { formatWhatsAppUrl } from '../utils';
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
  const [isAiUsed, setIsAiUsed] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newMembersCount, setNewMembersCount] = useState(0);

  const candidates = allProfiles.filter(p => p.id !== currentProfile.id);

  const loadMatches = async (forceFresh = false) => {
    setIsLoading(true);
    setErrorMessage(null);

    const cacheKey = `kw_matches_${currentProfile.id}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached && !forceFresh) {
      try {
        const parsed = JSON.parse(cached);
        setMatches(parsed.list || []);
        setIsAiUsed(parsed.ai ?? true);
        const lastCount = parsed.count || 0;
        setNewMembersCount(Math.max(0, candidates.length - lastCount));
        setIsLoading(false);
        return;
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

      // Record match pairs in database & notify matched peer
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
      `Hi ${targetProfile.name.split(' ')[0]}, I'm ${currentProfile.name}. I matched with you on ${APP_NAME} and I'd love to explore building together!`;

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
        <div className="p-3 bg-[var(--attention-subtle)] border border-[var(--attention)] text-[var(--fg)] rounded-md text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[var(--attention)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-[var(--attention)]">Basic match (AI unavailable):</span>{' '}
            {errorMessage || 'Gemma is currently answering other requests'}. These results are calculated using keyword matching so your networking is uninterrupted.
          </div>
        </div>
      )}

      {/* Main Matches Box */}
      <div className="primer-box">
        <div className="primer-box-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent)]" />
            <span>Top Complementary Matches</span>
            {isAiUsed ? (
              <span className="primer-label primer-label-purple text-[10px]">Gemma 4</span>
            ) : (
              <span className="primer-label primer-label-amber text-[10px] font-semibold">
                Basic match (AI unavailable)
              </span>
            )}
          </div>

          <button
            onClick={() => loadMatches(true)}
            disabled={isLoading}
            className="primer-btn text-xs py-1 px-2.5"
            title="Recalculate matches"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh{newMembersCount > 0 ? ` (${newMembersCount} new)` : ''}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-xs text-[var(--muted)] space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--fg)]">
              <span>Gemma is picking your matches…</span>
              <span className="typing-dot"></span>
              <span className="typing-dot"></span>
              <span className="typing-dot"></span>
            </div>
            <p className="text-xs text-[var(--muted)]">Evaluating complementary needs and offers across Hack Day members...</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <h3 className="font-semibold text-base">Nobody else has joined yet</h3>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              Show your profile QR code to the person next to you in the room. Matches will appear here as soon as members register.
            </p>
            <button onClick={onShowQr} className="primer-btn primer-btn-primary text-xs py-1.5 px-3">
              <QrCode className="w-3.5 h-3.5" />
              <span>Show my QR code</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-muted)]">
            {matches.map(m => {
              const profile = allProfiles.find(p => p.id === m.id);
              if (!profile) return null;
              const isFollowing = followingIds.has(profile.id);

              return (
                <div key={m.id} className="p-4 space-y-3 hover:bg-[var(--subtle)] transition-colors">
                  {/* Top row: Avatar, Info, Match Score Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => onViewProfile(profile.id)}
                        className="flex-shrink-0 hover:opacity-80 transition-opacity"
                      >
                        <Avatar
                          profile={profile}
                          className="w-11 h-11"
                        />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onViewProfile(profile.id)}
                            className="font-semibold text-sm hover:text-[var(--accent)] text-left"
                          >
                            {profile.name}
                          </button>
                          <span className="primer-label primer-label-blue text-[10px]">
                            {profile.role}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--muted)] line-clamp-1">
                          {profile.headline}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isAiUsed && (
                        <span className="primer-label primer-label-amber text-[10px] font-semibold">
                          Basic match (AI unavailable)
                        </span>
                      )}
                      <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--primary)] text-white shadow-sm flex items-center gap-1">
                        <span>{m.score}%</span>
                        <span className="text-[10px] opacity-90">match</span>
                      </div>
                    </div>
                  </div>

                  {/* Complementary match reason */}
                  <p className="text-xs text-[var(--fg)] leading-relaxed bg-[var(--bg)] p-2.5 rounded border border-[var(--border-muted)]">
                    {m.reason}
                  </p>

                  {/* Spark: project or small business idea */}
                  {m.spark && (
                    <div className="p-2.5 rounded bg-[var(--accent-subtle)] border border-[var(--accent)] flex items-start gap-2 text-xs">
                      <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[var(--accent)]">You could build: </strong>
                        <span>{m.spark}</span>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {profile.tags?.slice(0, 5).map(tag => (
                      <span key={tag} className="primer-tag text-[11px]">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Actions: Connect on WhatsApp, Follow, View Profile */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => handleConnect(m, profile)}
                      className="primer-btn primer-btn-primary text-xs py-1 px-3"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{profile.whatsapp ? 'Chat on WhatsApp' : 'Connect'}</span>
                    </button>

                    {m.icebreaker && (
                      <button
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(m.icebreaker || '');
                          }
                        }}
                        className="primer-btn text-xs py-1 px-2.5"
                        title="Copy prepared icebreaker message"
                      >
                        <span>Copy intro message</span>
                      </button>
                    )}

                    <button
                      onClick={() => onToggleFollow(profile.id)}
                      className="primer-btn text-xs py-1 px-2.5"
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-[var(--success)]" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5 text-[var(--muted)]" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onViewProfile(profile.id)}
                      className="primer-btn text-xs py-1 px-2.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <span>View profile</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
