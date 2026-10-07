import React, { useState, useEffect } from 'react';
import { Megaphone, ExternalLink, X } from 'lucide-react';
import { fetchPinnedAnnouncement } from '../services/api';

export const PinnedAnnouncementBar: React.FC = () => {
  const [announcement, setAnnouncement] = useState<{ id: string; text: string; link?: string; active: boolean } | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('kw_dismissed_announcement') : null;
  });

  const checkAnnouncement = async () => {
    try {
      const ann = await fetchPinnedAnnouncement();
      setAnnouncement(ann);
    } catch {
      // Quiet
    }
  };

  useEffect(() => {
    checkAnnouncement();
    const interval = setInterval(checkAnnouncement, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!announcement || !announcement.active || !announcement.text) {
    return null;
  }

  if (dismissedId === announcement.id) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem('kw_dismissed_announcement', announcement.id);
    setDismissedId(announcement.id);
  };

  return (
    <div
      role="banner"
      aria-label="Community Announcement"
      className="bg-[var(--gold)]/10 text-[var(--fg)] border-b border-[var(--gold)]/20 px-3 py-2 text-xs transition-all relative z-50 backdrop-blur-sm"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Megaphone className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0 animate-pulse" />
          <span className="font-semibold text-[var(--gold)] text-[10px] uppercase tracking-wider flex-shrink-0">
            Notice
          </span>
          <span className="truncate font-medium text-xs">
            {announcement.text}
          </span>
          {announcement.link && (
            <a
              href={announcement.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--gold)] hover:underline font-semibold flex-shrink-0 text-xs ml-1"
            >
              <span>Learn more</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
          aria-label="Dismiss announcement"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
