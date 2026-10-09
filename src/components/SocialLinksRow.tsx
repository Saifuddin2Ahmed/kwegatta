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
    const host = parsed.hostname.toLowerCase();
    const d = domainSubstring.toLowerCase();
    return host === d || host.endsWith('.' + d);
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

  // 1. LinkedIn (linkedin.com)
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

  // 3. GitLab (gitlab.com)
  if (profile.gitlab && (isValidDomain(profile.gitlab, 'gitlab.com') || profile.gitlab.includes('gitlab.com'))) {
    links.push({
      key: 'gitlab',
      label: 'GitLab',
      url: normalizeUrl(profile.gitlab),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="m23.6 9.58-1.54-4.75a.99.99 0 0 0-.37-.47 1 1 0 0 0-.6-.19.98.98 0 0 0-.59.2 1 1 0 0 0-.36.47L18.6 9.58H5.4l-1.54-4.75a.99.99 0 0 0-.37-.47 1 1 0 0 0-.6-.19.98.98 0 0 0-.59.2 1 1 0 0 0-.36.47L.4 9.58a1.27 1.27 0 0 0 .46 1.42L12 19.34l11.14-8.34a1.27 1.27 0 0 0 .46-1.42z" />
        </svg>
      ),
      colorClass: 'text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 border-orange-500/30'
    });
  }

  // 4. Google Play Developer Page (play.google.com)
  if (profile.google_play && (isValidDomain(profile.google_play, 'play.google.com') || profile.google_play.includes('play.google.com'))) {
    links.push({
      key: 'google_play',
      label: 'Google Play',
      url: normalizeUrl(profile.google_play),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.609 1.814L13.792 12 3.61 22.186c-.37-.362-.61-.925-.61-1.632V3.446c0-.707.24-1.27.61-1.632zM15.207 13.414l2.457 2.457-11.83 6.83 9.373-9.287zm0-2.828L5.834 1.299l11.83 6.83-2.457 2.457zm1.414 1.414l3.528 2.037c.732.423.732 1.115 0 1.538l-3.528 2.037-2.121-2.121 2.121-2.121z" />
        </svg>
      ),
      colorClass: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30'
    });
  }

  // 5. Google Developer Profile (g.dev or developers.google.com)
  if (profile.google_dev && (isValidDomain(profile.google_dev, 'g.dev') || isValidDomain(profile.google_dev, 'developers.google.com') || profile.google_dev.includes('g.dev') || profile.google_dev.includes('developers.google.com'))) {
    links.push({
      key: 'google_dev',
      label: 'Google Developer',
      url: normalizeUrl(profile.google_dev),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
        </svg>
      ),
      colorClass: 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 border-blue-500/30'
    });
  }

  // 6. Hugging Face (huggingface.co)
  if (profile.huggingface && (isValidDomain(profile.huggingface, 'huggingface.co') || profile.huggingface.includes('huggingface.co'))) {
    links.push({
      key: 'huggingface',
      label: 'Hugging Face',
      url: normalizeUrl(profile.huggingface),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 2.237.734 4.304 1.973 5.975-.12.434-.403 1.488-.707 2.65-.184.706.446 1.336 1.152 1.152 1.162-.304 2.216-.587 2.65-.707C8.696 21.266 10.763 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-3.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7 4.5c.5-1 2-2 3.5-2s3 1 3.5 2c.2.4-.1.8-.5.8h-6c-.4 0-.7-.4-.5-.8z" />
        </svg>
      ),
      colorClass: 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border-amber-500/30'
    });
  }

  // 7. Kaggle (kaggle.com)
  if (profile.kaggle && (isValidDomain(profile.kaggle, 'kaggle.com') || profile.kaggle.includes('kaggle.com'))) {
    links.push({
      key: 'kaggle',
      label: 'Kaggle',
      url: normalizeUrl(profile.kaggle),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.825 23.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-2.06 1.98v4.577c0 .235-.117.36-.351.36H4.351c-.234 0-.351-.125-.351-.36V.36C4 .125 4.117 0 4.351 0h2.973c.234 0 .351.125.351.36v15.068l6.985-7.145c.14-.14.293-.21.457-.21h3.313c.164 0 .258.058.281.176.023.14-.035.246-.176.316l-7.395 7.426 7.535 9.539c.14.164.187.27.14.329z" />
        </svg>
      ),
      colorClass: 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border-cyan-500/30'
    });
  }

  // 8. IEEE Collabratec (ieee-collabratec.ieee.org)
  if (profile.ieee && (isValidDomain(profile.ieee, 'ieee-collabratec.ieee.org') || profile.ieee.includes('ieee-collabratec.ieee.org'))) {
    links.push({
      key: 'ieee',
      label: 'IEEE Collabratec',
      url: normalizeUrl(profile.ieee),
      icon: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5zM11 8v8h2V8h-2z" />
        </svg>
      ),
      colorClass: 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border-sky-500/30'
    });
  }

  // 9. Website / Portfolio
  if (profile.website && (profile.website.startsWith('http') || profile.website.includes('.'))) {
    links.push({
      key: 'website',
      label: 'Website',
      url: normalizeUrl(profile.website),
      icon: <Globe className={iconSize} />,
      colorClass: 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30'
    });
  }

  // 10. X / Twitter
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

  // 11. Facebook
  if (profile.facebook && (isValidDomain(profile.facebook, 'facebook.com') || profile.facebook.includes('facebook.com'))) {
    links.push({
      key: 'facebook',
      label: 'Facebook',
      url: normalizeUrl(profile.facebook),
      icon: <Facebook className={iconSize} />,
      colorClass: 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 border-blue-500/30'
    });
  }

  // 12. Instagram
  if (profile.instagram && (isValidDomain(profile.instagram, 'instagram.com') || profile.instagram.includes('instagram.com'))) {
    links.push({
      key: 'instagram',
      label: 'Instagram',
      url: normalizeUrl(profile.instagram),
      icon: <Instagram className={iconSize} />,
      colorClass: 'text-pink-500 hover:text-pink-400 hover:bg-pink-500/10 border-pink-500/30'
    });
  }

  // 13. TikTok
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

  // 14. YouTube
  if (profile.youtube && (isValidDomain(profile.youtube, 'youtube.com') || isValidDomain(profile.youtube, 'youtu.be') || profile.youtube.includes('youtube'))) {
    links.push({
      key: 'youtube',
      label: 'YouTube',
      url: normalizeUrl(profile.youtube),
      icon: <Youtube className={iconSize} />,
      colorClass: 'text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/30'
    });
  }

  // 15. Google Scholar
  if (profile.scholar && (isValidDomain(profile.scholar, 'scholar.google.com') || profile.scholar.includes('scholar.google'))) {
    links.push({
      key: 'scholar',
      label: 'Google Scholar',
      url: normalizeUrl(profile.scholar),
      icon: <GraduationCap className={iconSize} />,
      colorClass: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border-blue-500/30'
    });
  }

  // 16. ORCID
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

  // Custom Links (up to 3, with short label max 24 chars and https URL)
  const customLinks = Array.isArray(profile.custom_links)
    ? profile.custom_links
        .filter(c => c && typeof c.url === 'string' && /^https:\/\/[^\s]+$/i.test(c.url.trim()) && c.label && String(c.label).trim())
        .slice(0, 3)
    : [];

  if (links.length === 0 && customLinks.length === 0) return null;

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

      {customLinks.map((c, idx) => (
        <a
          key={`custom-${idx}`}
          href={c.url.trim()}
          target="_blank"
          rel="noopener noreferrer"
          title={c.label.trim()}
          aria-label={c.label.trim()}
          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-xs text-[var(--fg)] hover:text-[var(--gold-text)] hover:border-[var(--gold)]/40 transition-all active:scale-95 shadow-xs"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
          <span className="font-medium truncate max-w-[140px]">{c.label.trim().slice(0, 24)}</span>
        </a>
      ))}
    </div>
  );
};
