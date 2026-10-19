import React, { useEffect, useState } from 'react';
import { Github, Linkedin, Globe2, MessageCircle } from 'lucide-react';
import { TeamMember } from '../types';
import { getInitials } from '../utils';

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}

/** Gold or teal, always the same one for the same name. Dark text on both passes WCAG AA. */
export function teamInitialsColor(name: string): { bg: string; fg: string } {
  const hash = [...String(name || '?')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return hash % 2 === 0 ? { bg: '#F5B700', fg: '#090D16' } : { bg: '#12B5A6', fg: '#090D16' };
}

/** Team photo, or initials in a brand colour when there is no photo or it fails to load. */
export const TeamAvatar: React.FC<{ name: string; photoUrl?: string | null; size?: number }> = ({ name, photoUrl, size = 64 }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={`Photo of ${name}`}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="rounded-full object-cover flex-shrink-0 border border-[var(--card-border)] bg-[var(--bg-subtle)]"
        style={{ width: size, height: size }}
      />
    );
  }
  const color = teamInitialsColor(name);
  return (
    <div
      role="img"
      aria-label={name}
      data-testid="team-initials"
      className="rounded-full flex-shrink-0 grid place-items-center font-display font-bold select-none"
      style={{ width: size, height: size, backgroundColor: color.bg, color: color.fg, fontSize: Math.round(size * 0.36) }}
    >
      {getInitials(name)}
    </div>
  );
};

interface TeamGridProps {
  team: TeamMember[];
  loading: boolean;
}

/** Team cards from /api/team (managed in the Admin panel). Used on About and the Team page. */
export const TeamGrid: React.FC<TeamGridProps> = ({ team, loading }) => {
  if (loading && team.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" aria-busy="true" aria-label="Loading the team">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-44 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] animate-pulse" />
        ))}
      </div>
    );
  }
  if (team.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">The team list will appear here soon.</p>;
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-stretch" aria-label="Kwegatta team">
      {team.map(member => {
        const photoUrl = member.photo_url || member.linked_avatar || null;
        const role = member.title ? String(member.title).trim() : '';
        const affiliation = member.line2 ? String(member.line2).trim() : '';
        const background = member.line1 ? String(member.line1).trim() : '';
        const bio = member.bio ? String(member.bio).trim() : '';
        const since = member.since ? String(member.since).trim() : '';
        const links: Array<{ href: string; label: string; icon: React.ReactNode }> = [];
        if (member.github) links.push({ href: `https://github.com/${member.github}`, label: 'GitHub', icon: <Github className="w-4 h-4" /> });
        if (member.linkedin) links.push({ href: member.linkedin, label: 'LinkedIn', icon: <Linkedin className="w-4 h-4" /> });
        if (member.x) links.push({ href: member.x, label: 'X', icon: <XLogo /> });
        if (member.website) links.push({ href: member.website, label: 'website', icon: <Globe2 className="w-4 h-4" /> });
        if (member.whatsapp_url) links.push({ href: member.whatsapp_url, label: 'WhatsApp', icon: <MessageCircle className="w-4 h-4" /> });

        return (
          <li
            key={member.id || member.name}
            className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] flex flex-col gap-3 min-w-0 transition-colors hover:border-[var(--teal)]/40"
          >
            <div className="flex items-center gap-4 min-w-0">
              <TeamAvatar name={member.name} photoUrl={photoUrl} />
              <div className="min-w-0">
                {member.linked_profile_id ? (
                  <a
                    href={`/#/u/${member.linked_profile_id}`}
                    className="font-semibold text-base text-[var(--fg)] hover:text-[var(--teal-text)] hover:underline block break-words"
                  >
                    {member.name}
                  </a>
                ) : (
                  <h3 className="font-semibold text-base text-[var(--fg)] break-words">{member.name}</h3>
                )}
                {role && <p className="text-sm text-[var(--teal-text)] font-medium break-words">{role}</p>}
                {affiliation && <p className="text-[13px] text-[var(--fg-subtle)] break-words">{affiliation}</p>}
              </div>
            </div>

            {background && <p className="text-sm text-[var(--fg-muted)] leading-relaxed break-words">{background}</p>}
            {bio && <p className="text-sm text-[var(--fg-muted)] leading-relaxed break-words whitespace-pre-line">{bio}</p>}
            {since && <p className="text-xs text-[var(--fg-subtle)]">On the team since {since}</p>}

            {links.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 -ml-1.5 mt-auto pt-1">
                {links.map(l => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--fg-subtle)] hover:text-[var(--fg)] p-2 rounded-md transition-colors"
                    aria-label={`${member.name} on ${l.label}`}
                    title={l.label}
                  >
                    {l.icon}
                  </a>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
