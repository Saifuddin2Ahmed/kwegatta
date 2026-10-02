import React from 'react';
import { Sparkles, Sun, Moon, Bell, Monitor, Search } from 'lucide-react';
import { Profile } from '../types';
import { Avatar } from './Avatar';

interface HeaderProps {
  currentProfile: Profile | null;
  unreadCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNavigate: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProfile,
  unreadCount,
  theme,
  onToggleTheme,
  searchQuery,
  onSearchChange,
  onNavigate
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[var(--header)] border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2 font-semibold text-[15px] text-[var(--fg)] hover:opacity-90"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--fg)] text-[var(--header)] grid place-items-center shadow-sm">
            <Sparkles className="w-4 h-4 stroke-[2.2]" />
          </div>
          <span className="hidden sm:inline tracking-tight font-bold">Kwegatta</span>
        </button>

        {/* Search input in header */}
        <div className="relative hidden md:block w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search people, skills, needs..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="primer-input pl-8 py-1 text-xs"
            aria-label="Search people"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Projector wall shortcut */}
        <button
          onClick={() => onNavigate('wall')}
          className="primer-btn text-xs py-1 px-2.5 hidden sm:inline-flex"
          title="Open projector live wall"
        >
          <Monitor className="w-3.5 h-3.5 text-[var(--muted)]" />
          <span>Live wall</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="w-8 h-8 rounded-md border border-[var(--border)] grid place-items-center bg-[var(--btn)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] transition-colors"
          aria-label="Switch color theme"
          title="Toggle dark/light mode"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Inbox notification bell */}
        <button
          onClick={() => onNavigate('inbox')}
          className="relative w-8 h-8 rounded-md border border-[var(--border)] grid place-items-center bg-[var(--btn)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] transition-colors"
          aria-label="Notifications"
          title="Inbox & notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User avatar / profile button */}
        {currentProfile ? (
          <button
            onClick={() => onNavigate('me')}
            className="rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--accent)] transition-all overflow-hidden"
            title="Your profile"
          >
            <Avatar profile={currentProfile} className="w-7 h-7" />
          </button>
        ) : (
          <button
            onClick={() => onNavigate('onboard')}
            className="primer-btn primer-btn-primary text-xs py-1 px-3"
          >
            Join
          </button>
        )}
      </div>
    </header>
  );
};
