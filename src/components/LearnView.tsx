import React, { useState, useEffect } from 'react';
import { BookOpen, GraduationCap, Users2, MessageCircle, RefreshCw, UserPlus, UserCheck } from 'lucide-react';
import { Profile, LearnMatchResult } from '../types';
import { matchLearningPartners, db, APP_NAME, requestMemberConnect } from '../services/api';
import { formatWhatsAppUrl } from '../utils';
import { Avatar } from './Avatar';

interface LearnViewProps {
  currentProfile: Profile | null;
  allProfiles: Profile[];
  followingIds: Set<string>;
  onToggleFollow: (id: string) => void;
  onViewProfile: (id: string) => void;
  onJoinClick?: () => void;
}

export const LearnView: React.FC<LearnViewProps> = ({
  currentProfile,
  allProfiles,
  followingIds,
  onToggleFollow,
  onViewProfile,
  onJoinClick
}) => {
  const [learningMatches, setLearningMatches] = useState<LearnMatchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const candidates = currentProfile ? allProfiles.filter(p => p.id !== currentProfile.id) : allProfiles;

  const calculateLearningMatches = async () => {
    if (!currentProfile) return;
    setIsLoading(true);
    try {
      const res = await matchLearningPartners(currentProfile, candidates);
      setLearningMatches(res);
    } catch (err) {
      console.error('Error calculating learning partners:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentProfile) {
      calculateLearningMatches();
    }
  }, [currentProfile?.id, candidates.length]);

  const handleConnect = async (peer: Profile, roleType: 'mentor' | 'partner', reason: string) => {
    if (!currentProfile) {
      if (onJoinClick) onJoinClick();
      return;
    }
    const text = `Hi ${peer.name.split(' ')[0]}, I'm ${currentProfile.name}. On ${APP_NAME}, we were matched as ${
      roleType === 'mentor' ? 'peer mentor and mentee' : 'study partners'
    }! ${reason} Would you be open to exchanging notes?`;

    try {
      const conn = await requestMemberConnect(currentProfile.id, peer.id, reason);
      const wa = formatWhatsAppUrl(conn.whatsapp, text);
      const targetLink = wa || conn.linkedin || peer.linkedin;

      if (targetLink) {
        window.open(targetLink, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      await db.insert('notifications', {
        to_id: peer.id,
        from_id: currentProfile.id,
        type: 'connect',
        body: `${currentProfile.name} wants to connect as a ${roleType === 'mentor' ? 'mentee' : 'study partner'}: ${reason}`,
        read: false,
        created_at: new Date().toISOString()
      });

      if (peer.linkedin) {
        window.open(peer.linkedin, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="kw-container space-y-6 md:space-y-10">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--card-border)] pb-4">
        <div>
          <h2 className="text-xl font-display font-bold text-[var(--fg)] tracking-tight">
            Peer Mentorship &amp; Study Partners
          </h2>
          <p className="text-xs text-[var(--fg-muted)] mt-0.5">
            {currentProfile
              ? `Matched based on what you teach and your stated learning goals (${currentProfile.learns || 'your goals'})`
              : 'Discover what people in the community are teaching and looking to learn.'}
          </p>
        </div>

        {currentProfile && (
          <button
            onClick={calculateLearningMatches}
            disabled={isLoading}
            className="kw-btn kw-btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </button>
        )}
      </div>

      {!currentProfile ? (
        <div className="space-y-6">
          {/* Visitor Join Callout */}
          <div className="p-6 rounded-2xl bg-[var(--card)] border border-[var(--gold)]/40 shadow-lg space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0 border border-[var(--gold)]/30">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-display font-bold text-base sm:text-lg text-[var(--fg)]">
                  Find your personal mentor &amp; study partner
                </h3>
                <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
                  Join Kwegatta in about 2 minutes. Our open-weight Gemma 4 model matches you with one peer who teaches what you want to learn, and one study buddy sharing your exact goal.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  if (onJoinClick) onJoinClick();
                  else window.location.hash = '#/onboard';
                }}
                className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold"
              >
                Get matched in about 2 minutes
              </button>
            </div>
          </div>

          {/* Community Skills Directory */}
          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-sm text-[var(--fg)]">
              Members Teaching &amp; Sharing Knowledge ({allProfiles.filter(p => p.teaches).length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {allProfiles.filter(p => p.teaches).slice(0, 9).map(profile => (
                <div
                  key={profile.id}
                  onClick={() => onViewProfile(profile.id)}
                  className="p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)] hover:border-[var(--gold)]/50 cursor-pointer transition-all space-y-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Avatar profile={profile} className="w-9 h-9" />
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-[var(--fg)] truncate">{profile.name}</p>
                      <p className="text-[13px] text-[var(--fg-muted)] truncate">{profile.role || 'Member'}</p>
                    </div>
                  </div>
                  <div className="text-xs bg-[var(--teal-subtle)] text-[var(--teal)] p-2 rounded-lg font-medium border border-[var(--teal)]/20">
                    <span className="block text-[13px] uppercase font-bold text-[var(--teal)] opacity-80">Teaches:</span>
                    <span className="line-clamp-2">{profile.teaches}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center text-xs text-[var(--fg-muted)] space-y-2">
          <div className="flex items-center justify-center gap-1.5 font-medium text-[var(--fg)]">
            <span>Finding matching mentors and study peers</span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="py-16 text-center space-y-2 border border-dashed border-[var(--card-border)] rounded-xl">
          <h3 className="font-semibold text-sm text-[var(--fg)]">No other learners in the room yet</h3>
          <p className="text-xs text-[var(--fg-muted)]">
            As more attendees join, your complementary mentor and study partner will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1: Mentor */}
          {learningMatches?.mentor && (
            <div className="p-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--gold)] font-semibold uppercase tracking-wider text-[13px] flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4" />
                    <span>Recommended Peer Mentor</span>
                  </span>
                  <span className="text-[var(--fg-subtle)]">Teaches what you need</span>
                </div>

                <div className="flex items-start gap-3.5 pt-1">
                  <button
                    onClick={() => onViewProfile(learningMatches.mentor!.profile.id)}
                    className="flex-shrink-0"
                  >
                    <Avatar
                      profile={learningMatches.mentor.profile}
                      className="w-12 h-12"
                    />
                  </button>
                  <div className="min-w-0">
                    <button
                      onClick={() => onViewProfile(learningMatches.mentor!.profile.id)}
                      className="font-semibold text-base text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left block truncate"
                    >
                      {learningMatches.mentor.profile.name}
                    </button>
                    <div className="text-xs text-[var(--fg-muted)] line-clamp-1">
                      {learningMatches.mentor.profile.headline}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[var(--fg-muted)] bg-[var(--bg-subtle)] p-3 rounded-lg leading-relaxed">
                  {learningMatches.mentor.reason}
                </p>

                <div className="text-xs text-[var(--fg-muted)]">
                  <span className="text-[var(--fg)] font-medium">Teaches: </span>
                  <span>{learningMatches.mentor.profile.teaches || learningMatches.mentor.profile.offers}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-[var(--card-border)]/50">
                <button
                  onClick={() =>
                    handleConnect(
                      learningMatches.mentor!.profile,
                      'mentor',
                      learningMatches.mentor!.reason
                    )
                  }
                  className="kw-btn kw-btn-gold text-xs py-1.5 px-3 flex-1 font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Connect with Mentor</span>
                </button>
                <button
                  onClick={() => onToggleFollow(learningMatches.mentor!.profile.id)}
                  className="kw-btn kw-btn-ghost text-xs p-2"
                  aria-label="Follow member"
                >
                  {followingIds.has(learningMatches.mentor.profile.id) ? (
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Card 2: Study Partner */}
          {learningMatches?.studyPartner && (
            <div className="p-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--teal)] font-semibold uppercase tracking-wider text-[13px] flex items-center gap-1.5">
                    <Users2 className="w-4 h-4" />
                    <span>Study Partner</span>
                  </span>
                  <span className="text-[var(--fg-subtle)]">Learning same topics</span>
                </div>

                <div className="flex items-start gap-3.5 pt-1">
                  <button
                    onClick={() => onViewProfile(learningMatches.studyPartner!.profile.id)}
                    className="flex-shrink-0"
                  >
                    <Avatar
                      profile={learningMatches.studyPartner.profile}
                      className="w-12 h-12"
                    />
                  </button>
                  <div className="min-w-0">
                    <button
                      onClick={() => onViewProfile(learningMatches.studyPartner!.profile.id)}
                      className="font-semibold text-base text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left block truncate"
                    >
                      {learningMatches.studyPartner.profile.name}
                    </button>
                    <div className="text-xs text-[var(--fg-muted)] line-clamp-1">
                      {learningMatches.studyPartner.profile.headline}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[var(--fg-muted)] bg-[var(--bg-subtle)] p-3 rounded-lg leading-relaxed">
                  {learningMatches.studyPartner.reason}
                </p>

                <div className="text-xs text-[var(--fg-muted)]">
                  <span className="text-[var(--fg)] font-medium">Learning: </span>
                  <span>{learningMatches.studyPartner.profile.learns || learningMatches.studyPartner.profile.needs}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-[var(--card-border)]/50">
                <button
                  onClick={() =>
                    handleConnect(
                      learningMatches.studyPartner!.profile,
                      'partner',
                      learningMatches.studyPartner!.reason
                    )
                  }
                  className="kw-btn kw-btn-teal text-xs py-1.5 px-3 flex-1 font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Connect Study Partner</span>
                </button>
                <button
                  onClick={() => onToggleFollow(learningMatches.studyPartner!.profile.id)}
                  className="kw-btn kw-btn-ghost text-xs p-2"
                  aria-label="Follow member"
                >
                  {followingIds.has(learningMatches.studyPartner.profile.id) ? (
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
