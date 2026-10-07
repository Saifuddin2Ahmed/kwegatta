import React from 'react';
import {
  Globe,
  Github,
  Linkedin,
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  GraduationCap,
  BookOpen,
  ExternalLink
} from 'lucide-react';
import { Profile } from '../types';

interface SocialLinksRowProps {
  profile: Profile;
  className?: string;
  iconSize?: string;
}

function isValidDomain(url: string | undefined, domainSubstring: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase().includes(domainSubstring.toLowerCase());
  } catch (_) {
    return trimmed.toLowerCase().includes(domainSubstring.toLowerCase());
  }
}

function normalizeUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

export const SocialLinksRow: React.FC<SocialLinksRowProps> = ({
  profile,
  className = '',
  iconSize = 'w-4 h-4'
}) => {
  const links: {
    key: string;
    label: string;
    url: string;
    icon: React.ReactNode;
    colorClass: string;
  }[] = [];

  // 1. LinkedIn
  if (profile.linkedin && (isValidDomain(profile.linkedin, 'linkedin.com') || profile.linkedin.includes('linkedin'))) {
    links.push({
      key: 'linkedin',
      label: 'LinkedIn',
      url: normalizeUrl(profile.linkedin),
      icon: <Linkedin className={iconSize} />,
      colorClass: 'text-sky-500 hover:text-sky-400 hover:bg-sky-500/10 border-sky-500/30'
    });
  }

  // 2. GitHub
  if (profile.github) {
    const ghUrl = profile.github.startsWith('http') ? profile.github : `https://github.com/${profile.github.replace(/^@/, '')}`;
    links.push({
      key: 'github',
      label: 'GitHub',
      url: ghUrl,
      icon: <Github className={iconSize} />,
      colorClass: 'text-[var(--fg)] hover:text-white hover:bg-white/10 border-[var(--card-border)]'
    });
  }

  // 3. Website / Portfolio
  if (profile.website && (profile.website.startsWith('http') || profile.website.includes('.'))) {
    links.push({
      key: 'website',
      label: 'Website',
      url: normalizeUrl(profile.website),
      icon: <Globe className={iconSize} />,
      colorClass: 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30'
    });
  }

  // 4. X / Twitter
  const xUrl = profile.twitter;
  if (xUrl && (isValidDomain(xUrl, 'twitter.com') || isValidDomain(xUrl, 'x.com') || xUrl.includes('x.com') || xUrl.includes('twitter.com'))) {
    links.push({
      key: 'twitter',
      label: 'X (Twitter)',
      url: normalizeUrl(xUrl),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      colorClass: 'text-[var(--fg)] hover:text-white hover:bg-white/10 border-[var(--card-border)]'
    });
  }

  // 5. Facebook
  if (profile.facebook && (isValidDomain(profile.facebook, 'facebook.com') || profile.facebook.includes('facebook.com'))) {
    links.push({
      key: 'facebook',
      label: 'Facebook',
      url: normalizeUrl(profile.facebook),
      icon: <Facebook className={iconSize} />,
      colorClass: 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 border-blue-500/30'
    });
  }

  // 6. Instagram
  if (profile.instagram && (isValidDomain(profile.instagram, 'instagram.com') || profile.instagram.includes('instagram.com'))) {
    links.push({
      key: 'instagram',
      label: 'Instagram',
      url: normalizeUrl(profile.instagram),
      icon: <Instagram className={iconSize} />,
      colorClass: 'text-pink-500 hover:text-pink-400 hover:bg-pink-500/10 border-pink-500/30'
    });
  }

  // 7. TikTok
  if (profile.tiktok && (isValidDomain(profile.tiktok, 'tiktok.com') || profile.tiktok.includes('tiktok.com'))) {
    links.push({
      key: 'tiktok',
      label: 'TikTok',
      url: normalizeUrl(profile.tiktok),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      ),
      colorClass: 'text-[var(--fg)] hover:text-cyan-400 hover:bg-cyan-500/10 border-[var(--card-border)]'
    });
  }

  // 8. YouTube
  if (profile.youtube && (isValidDomain(profile.youtube, 'youtube.com') || isValidDomain(profile.youtube, 'youtu.be') || profile.youtube.includes('youtube'))) {
    links.push({
      key: 'youtube',
      label: 'YouTube',
      url: normalizeUrl(profile.youtube),
      icon: <Youtube className={iconSize} />,
      colorClass: 'text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/30'
    });
  }

  // 9. Google Scholar
  if (profile.scholar && (isValidDomain(profile.scholar, 'scholar.google.com') || profile.scholar.includes('scholar.google'))) {
    links.push({
      key: 'scholar',
      label: 'Google Scholar',
      url: normalizeUrl(profile.scholar),
      icon: <GraduationCap className={iconSize} />,
      colorClass: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border-blue-500/30'
    });
  }

  // 10. ORCID
  if (profile.orcid && (isValidDomain(profile.orcid, 'orcid.org') || profile.orcid.includes('orcid.org') || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(profile.orcid.trim()))) {
    const orcidUrl = profile.orcid.startsWith('http') ? profile.orcid : `https://orcid.org/${profile.orcid.trim()}`;
    links.push({
      key: 'orcid',
      label: 'ORCID Profile',
      url: orcidUrl,
      icon: <BookOpen className={iconSize} />,
      colorClass: 'text-lime-500 hover:text-lime-400 hover:bg-lime-500/10 border-lime-500/30'
    });
  }

  if (links.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {links.map(l => (
        <a
          key={l.key}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          title={l.label}
          aria-label={l.label}
          className={`p-2 rounded-xl border bg-[var(--card)] transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-xs ${l.colorClass}`}
        >
          {l.icon}
        </a>
      ))}
    </div>
  );
};
