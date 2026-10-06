import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Bell, Search, X } from 'lucide-react';
import { Profile } from '../types';
import { Avatar } from './Avatar';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  currentProfile: Profile | null;
  unreadCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNavigate: (tab: string) => void;
  onJoin?: () => void;
  activeTab?: string;
  isDemoMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentProfile,
  unreadCount,
  theme,
  onToggleTheme,
  searchQuery,
  onSearchChange,
  onNavigate,
  onJoin,
  activeTab
}) => {
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // Requirement 6: Search hint shows "Ctrl K" on Windows and Android, "⌘K" on Apple
  const isApple = typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent);
  const searchShortcutHint = isApple ? '⌘K' : 'Ctrl K';

  useEffect(() => {
    // Keyboard shortcut to focus search (/ or Cmd/Ctrl+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') ||
          ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        if (window.innerWidth < 768) {
          setShowMobileSearch(true);
          setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const navLinks = [
    { id: 'home', label: 'Matches' },
    { id: 'people', label: 'People' },
    { id: 'learn', label: 'Learn' },
    { id: 'feed', label: 'Feed' },
    { id: 'about', label: 'About' }
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--card-border)] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[68px] flex items-center justify-between gap-3 sm:gap-4">
        
        {/* LEFT: Logo & Links */}
        <div className="flex-shrink-0 flex items-center gap-4 lg:gap-6">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 hover:opacity-90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded-lg p-0.5 cursor-pointer"
            aria-label="Kwegatta Home"
          >
            <BrandLogo size="md" showText={true} />
          </button>

          {/* Desktop Navigation: Matches, People, Learn, Feed, About */}
          <nav className="hidden md:flex items-center gap-1 text-xs">
            {navLinks.map(link => {
              const isActive = activeTab === link.id || (!activeTab && link.id === 'home');
              return (
                <button
                  key={link.id}
                  onClick={() => onNavigate(link.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'text-[var(--gold)] bg-[var(--gold-subtle)] font-bold'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* CENTER: Search */}
        <div className="hidden md:flex flex-1 max-w-xs lg:max-w-sm mx-2 lg:mx-4 justify-center">
          <div className="relative w-full group">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)] group-focus-within:text-[var(--gold)] transition-colors pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search people, skills, needs..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] hover:bg-[var(--card)] focus:bg-[var(--card)] border border-[var(--card-border)] focus:border-[var(--gold)] text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] rounded-xl pl-9 pr-12 py-2 shadow-sm transition-all focus:shadow-[0_0_0_3px_var(--gold-subtle)] focus:outline-none"
              aria-label="Search people, skills, and needs"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] font-mono text-[var(--fg-subtle)] bg-[var(--card)] border border-[var(--card-border)] px-1.5 py-0.5 rounded pointer-events-none">
              <span>{searchShortcutHint}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Search Toggle (Mobile), Theme Switcher, Notifications, Join / Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile Search Icon */}
          <button
            onClick={() => {
              setShowMobileSearch(!showMobileSearch);
              if (!showMobileSearch) {
                setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
              }
            }}
            className="md:hidden w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all"
            aria-label="Toggle search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Theme Switcher */}
          <button
            onClick={onToggleTheme}
            className="w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)] cursor-pointer"
            aria-label="Switch color theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 transition-transform duration-300" />
            )}
          </button>

          {/* Inbox Notification Bell (when signed in) */}
          {currentProfile && (
            <button
              onClick={() => onNavigate('inbox')}
              className="relative w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              aria-label="Notifications"
              title="Inbox & notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-4 px-1 rounded-full bg-[var(--gold)] text-[#090D16] text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Primary Action: Profile Avatar or Join CTA */}
          {currentProfile ? (
            <button
              onClick={() => onNavigate('me')}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-[var(--card-border)] hover:border-[var(--gold)] bg-[var(--btn)] active:scale-95 transition-all cursor-pointer"
              title="View your profile"
            >
              <Avatar profile={currentProfile} className="w-7 h-7" />
              <span className="text-xs font-semibold text-[var(--fg)] max-w-[85px] truncate hidden sm:inline">
                {currentProfile.name.split(' ')[0]}
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                if (onJoin) onJoin();
                else onNavigate('onboard');
              }}
              className="kw-btn kw-btn-gold text-xs py-1.5 px-3.5 rounded-xl font-semibold active:scale-95 shadow-sm cursor-pointer"
            >
              Join
            </button>
          )}
        </div>
      </div>

      {/* Mobile Nav Links Row (only for visitors who don't have NavTabs) */}
      {!currentProfile && (
        <div className="md:hidden flex items-center gap-1 px-4 py-2 border-t border-[var(--card-border)] bg-[var(--bg-subtle)]/40 overflow-x-auto scrollbar-none text-xs">
          {navLinks.map(link => {
            const isActive = activeTab === link.id || (!activeTab && link.id === 'home');
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={`px-3 py-1 rounded-md whitespace-nowrap font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'text-[var(--gold)] bg-[var(--gold-subtle)] font-bold'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Expandable Mobile Search Bar */}
      {showMobileSearch && (
        <div className="md:hidden px-4 pb-3 pt-1 border-t border-[var(--card-border)] bg-[var(--bg)] animate-in slide-in-from-top-2 duration-200">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)] pointer-events-none" />
            <input
              ref={mobileSearchInputRef}
              type="search"
              placeholder="Search people, skills, needs..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:border-[var(--gold)]"
              aria-label="Search people"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)] hover:text-[var(--fg)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
