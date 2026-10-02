import React, { useState } from 'react';
import { Profile } from '../types';
import { getInitials } from '../utils';

interface AvatarProps {
  profile: Profile | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | number;
  className?: string;
  alt?: string;
}

const SIZE_MAP: Record<string, { px: number; textClass: string; roundedClass: string }> = {
  xs: { px: 18, textClass: 'text-[9px]', roundedClass: 'rounded-full' },
  sm: { px: 24, textClass: 'text-[10px]', roundedClass: 'rounded-full' },
  md: { px: 32, textClass: 'text-xs', roundedClass: 'rounded-full' },
  lg: { px: 40, textClass: 'text-sm font-semibold', roundedClass: 'rounded-full' },
  xl: { px: 56, textClass: 'text-lg font-bold', roundedClass: 'rounded-full' },
  '2xl': { px: 80, textClass: 'text-2xl font-bold', roundedClass: 'rounded-full' },
  '3xl': { px: 160, textClass: 'text-4xl font-bold', roundedClass: 'rounded-full' }
};

// Deterministic pleasant color for initials
function getInitialsColor(name: string): { bg: string; text: string } {
  const hash = [...String(name || '?')].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hues = [210, 260, 140, 340, 30, 180, 280, 20];
  const hue = hues[hash % hues.length];
  return {
    bg: `hsl(${hue}, 45%, 35%)`,
    text: '#ffffff'
  };
}

export const Avatar: React.FC<AvatarProps> = ({
  profile,
  size = 'md',
  className = '',
  alt
}) => {
  const [imageError, setImageError] = useState(false);
  const name = profile?.name || 'Anonymous';
  const initials = getInitials(name);
  const color = getInitialsColor(name);

  const sizeConfig = typeof size === 'string' && SIZE_MAP[size] ? SIZE_MAP[size] : null;
  const dimension = sizeConfig ? sizeConfig.px : typeof size === 'number' ? size : 32;
  const textClass = sizeConfig ? sizeConfig.textClass : 'text-xs font-semibold';

  const avatarUrl = profile?.avatar && typeof profile.avatar === 'string' && profile.avatar.trim().length > 0
    ? profile.avatar.trim()
    : null;

  if (avatarUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt={alt || name}
        width={dimension}
        height={dimension}
        onError={() => setImageError(true)}
        className={`rounded-full object-cover border border-[var(--border)] flex-shrink-0 ${className}`}
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--border)] select-none font-semibold ${textClass} ${className}`}
      style={{
        width: dimension,
        height: dimension,
        backgroundColor: color.bg,
        color: color.text
      }}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
