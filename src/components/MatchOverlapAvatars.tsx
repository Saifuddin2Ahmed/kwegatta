import React from 'react';
import { Profile } from '../types';
import { Avatar } from './Avatar';

interface MatchOverlapAvatarsProps {
  memberA: Profile;
  memberB: Profile;
  score: number;
  size?: number;
  animate?: boolean;
}

export const MatchOverlapAvatars: React.FC<MatchOverlapAvatarsProps> = ({
  memberA,
  memberB,
  score,
  size = 56,
  animate = true
}) => {
  // Score mapping: 30% -> -8px overlap; 100% -> -34px deep overlap
  const clampedScore = Math.min(100, Math.max(20, score));
  const normalized = (clampedScore - 20) / 80; // 0 to 1
  const overlapMargin = Math.round(8 + normalized * 26); // 8px to 34px

  return (
    <div className="relative inline-flex items-center select-none" style={{ minWidth: size * 2 - overlapMargin }}>
      {/* Circle Left: Member A */}
      <div
        className={`relative z-10 ${animate ? 'animate-slide-left' : ''}`}
        style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          borderRadius: '9999px'
        }}
      >
        <Avatar
          profile={memberA}
          size={size}
          className="ring-2 ring-[var(--card)]"
        />
      </div>

      {/* Circle Right: Member B with negative margin based on match score */}
      <div
        className={`relative z-20 ${animate ? 'animate-slide-right' : ''}`}
        style={{
          marginLeft: `-${overlapMargin}px`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          borderRadius: '9999px'
        }}
      >
        <Avatar
          profile={memberB}
          size={size}
          className="ring-2 ring-[var(--card)]"
        />
      </div>

      {/* Score Badge floating in the overlap intersection */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          left: `calc(${size}px - ${overlapMargin / 2}px)`,
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div
          className="px-2 py-0.5 rounded-full font-display font-bold text-xs tracking-tight shadow-lg border-2 border-[var(--card)] flex items-center gap-0.5"
          style={{
            backgroundColor: 'var(--gold)',
            color: '#0B1220'
          }}
          title={`${score}% compatibility score`}
        >
          <span>{score}</span>
          <span className="text-[9px] opacity-80">%</span>
        </div>
      </div>
    </div>
  );
};
