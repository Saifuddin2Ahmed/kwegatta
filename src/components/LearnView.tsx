import React, { useState, useEffect } from 'react';
import { BookOpen, GraduationCap, Users2, MessageCircle, ExternalLink, RefreshCw, UserPlus, UserCheck } from 'lucide-react';
import { Profile, LearnMatchResult } from '../types';
import { matchLearningPartners, db, APP_NAME, requestMemberConnect } from '../services/api';
import { formatWhatsAppUrl } from '../utils';
import { Avatar } from './Avatar';

interface LearnViewProps {
  currentProfile: Profile;
  allProfiles: Profile[];
  followingIds: Set<string>;
  onToggleFollow: (id: string) => void;
  onViewProfile: (id: string) => void;
}

export const LearnView: React.FC<LearnViewProps> = ({
  currentProfile,
  allProfiles,
  followingIds,
  onToggleFollow,
  onViewProfile
}) => {
  const [learningMatches, setLearningMatches] = useState<LearnMatchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const candidates = allProfiles.filter(p => p.id !== currentProfile.id);

  const calculateLearningMatches = async () => {
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
    calculateLearningMatches();
  }, [currentProfile.id, candidates.length]);

  const handleConnect = async (peer: Profile, roleType: 'mentor' | 'partner', reason: string) => {
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
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent)]" />
            <span>Peer Learning & Mentorship</span>
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Matched based on what you want to learn ({currentProfile.learns || 'your stated goals'}) and what you teach.
          </p>
        </div>

        <button
          onClick={calculateLearningMatches}
          disabled={isLoading}
          className="primer-btn text-xs py-1 px-2.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading ? (
        <div className="primer-box p-8 text-center text-xs text-[var(--muted)] space-y-2">
          <div className="flex items-center justify-center gap-1.5">
            <span>Finding your peer mentor and study partner</span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="primer-box p-8 text-center space-y-2">
          <h3 className="font-semibold text-sm">No other learners yet</h3>
          <p className="text-xs text-[var(--muted)]">
            When other students join, your mentor and study partner will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Mentor */}
          {learningMatches?.mentor && (
            <div className="primer-box flex flex-col justify-between p-4 space-y-3 border-t-2 border-t-[var(--accent)]">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="primer-label primer-label-blue text-[11px] font-semibold flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Recommended Mentor</span>
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">Teaches what you need</span>
                </div>

                <div className="flex items-start gap-3 pt-1">
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
                      className="font-semibold text-sm hover:text-[var(--accent)] text-left block truncate"
                    >
                      {learningMatches.mentor.profile.name}
                    </button>
                    <div className="text-xs text-[var(--muted)] line-clamp-1">
                      {learningMatches.mentor.profile.headline}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[var(--fg)] bg-[var(--subtle)] p-2.5 rounded border border-[var(--border-muted)] leading-relaxed">
                  {learningMatches.mentor.reason}
                </p>

                <div className="text-xs text-[var(--muted)] space-y-1">
                  <div>
                    <strong className="text-[var(--fg)]">Teaches:</strong>{' '}
                    {learningMatches.mentor.profile.teaches || learningMatches.mentor.profile.offers}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-muted)]">
                <button
                  onClick={() =>
                    handleConnect(
                      learningMatches.mentor!.profile,
                      'mentor',
                      learningMatches.mentor!.reason
                    )
                  }
                  className="primer-btn primer-btn-primary text-xs py-1 px-3 flex-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Connect</span>
                </button>
                <button
                  onClick={() => onToggleFollow(learningMatches.mentor!.profile.id)}
                  className="primer-btn text-xs py-1 px-2.5"
                >
                  {followingIds.has(learningMatches.mentor.profile.id) ? (
                    <UserCheck className="w-3.5 h-3.5 text-[var(--success)]" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5 text-[var(--muted)]" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Card 2: Study Partner */}
          {learningMatches?.studyPartner && (
            <div className="primer-box flex flex-col justify-between p-4 space-y-3 border-t-2 border-t-[var(--success)]">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="primer-label primer-label-green text-[11px] font-semibold flex items-center gap-1">
                    <Users2 className="w-3.5 h-3.5" />
                    <span>Study Partner</span>
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">Learning same topics</span>
                </div>

                <div className="flex items-start gap-3 pt-1">
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
                      className="font-semibold text-sm hover:text-[var(--accent)] text-left block truncate"
                    >
                      {learningMatches.studyPartner.profile.name}
                    </button>
                    <div className="text-xs text-[var(--muted)] line-clamp-1">
                      {learningMatches.studyPartner.profile.headline}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[var(--fg)] bg-[var(--subtle)] p-2.5 rounded border border-[var(--border-muted)] leading-relaxed">
                  {learningMatches.studyPartner.reason}
                </p>

                <div className="text-xs text-[var(--muted)] space-y-1">
                  <div>
                    <strong className="text-[var(--fg)]">Learning:</strong>{' '}
                    {learningMatches.studyPartner.profile.learns || learningMatches.studyPartner.profile.needs}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-muted)]">
                <button
                  onClick={() =>
                    handleConnect(
                      learningMatches.studyPartner!.profile,
                      'partner',
                      learningMatches.studyPartner!.reason
                    )
                  }
                  className="primer-btn primer-btn-primary text-xs py-1 px-3 flex-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Connect</span>
                </button>
                <button
                  onClick={() => onToggleFollow(learningMatches.studyPartner!.profile.id)}
                  className="primer-btn text-xs py-1 px-2.5"
                >
                  {followingIds.has(learningMatches.studyPartner.profile.id) ? (
                    <UserCheck className="w-3.5 h-3.5 text-[var(--success)]" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5 text-[var(--muted)]" />
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
