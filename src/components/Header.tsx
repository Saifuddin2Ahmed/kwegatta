import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Bell, Monitor, Search, Download, Smartphone, X, Command } from 'lucide-react';
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Detect standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

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
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosHint(prev => !prev);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--card-border)] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[70px] flex items-center justify-between gap-4">
        
        {/* LEFT: Brand Logo & Title with dedicated spacious container */}
        <div className="flex-shrink-0 flex items-center">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded-lg p-1"
            aria-label="Kwegatta Home"
          >
            <BrandLogo size="md" showText={true} />
          </button>
        </div>

        {/* CENTER: Dedicated, Centered Application Search Bar (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-md mx-6 justify-center">
          <div className="relative w-full group">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)] group-focus-within:text-[var(--gold)] transition-colors pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search people, skills, needs..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] hover:bg-[var(--card)] focus:bg-[var(--card)] border border-[var(--card-border)] focus:border-[var(--gold)] text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] rounded-xl pl-10 pr-12 py-2.5 shadow-sm transition-all focus:shadow-[0_0_0_3px_var(--gold-subtle)] focus:outline-none"
              aria-label="Search people, skills, and needs"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] font-mono text-[var(--fg-subtle)] bg-[var(--card)] border border-[var(--card-border)] px-1.5 py-0.5 rounded pointer-events-none">
              <span className="text-[9px]">⌘</span>K
            </div>
          </div>
        </div>

        {/* RIGHT: Actions, Controls & Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Mobile Search Trigger Icon */}
          <button
            onClick={() => {
              setShowMobileSearch(!showMobileSearch);
              if (!showMobileSearch) {
                setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
              }
            }}
            className="md:hidden w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all"
            aria-label="Toggle mobile search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* PWA Install Button */}
          {!isInstalled && (deferredPrompt || isIos) && (
            <div className="relative">
              <button
                onClick={handleInstallClick}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3 hidden lg:inline-flex items-center gap-1.5 active:scale-95"
                title="Install Kwegatta on your phone"
              >
                <Download className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Install</span>
              </button>
              {showIosHint && (
                <div className="absolute right-0 top-full mt-2 w-72 p-3.5 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl text-xs text-[var(--fg)] z-50 animate-in fade-in">
                  <div className="flex items-center justify-between pb-1">
                    <p className="font-semibold text-[var(--gold)] flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" /> Install on iPhone
                    </p>
                    <button onClick={() => setShowIosHint(false)} className="text-[var(--fg-muted)] hover:text-[var(--fg)]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[var(--fg-muted)] leading-relaxed mt-1">
                    Tap <span className="font-bold text-[var(--fg)]">Share</span> (the box with arrow), then tap <span className="font-bold text-[var(--fg)]">"Add to Home Screen"</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Live Wall shortcut button */}
          <button
            onClick={() => onNavigate('wall')}
            className="kw-btn kw-btn-ghost text-xs py-2 px-3 hidden sm:inline-flex items-center gap-1.5 active:scale-95"
            title="Open projector live wall"
          >
            <Monitor className="w-3.5 h-3.5 text-[var(--teal)]" />
            <span className="font-medium">Live wall</span>
          </button>

          {/* Theme Switcher Toggle */}
          <button
            onClick={onToggleTheme}
            className="w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
            aria-label="Switch color theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 rotate-0 hover:rotate-45" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 transition-transform duration-300" />
            )}
          </button>

          {/* Inbox Notification Bell */}
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

          {/* Primary Action: Profile Avatar or High-Converting Join CTA */}
          {currentProfile ? (
            <button
              onClick={() => onNavigate('me')}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-[var(--card-border)] hover:border-[var(--gold)] bg-[var(--btn)] active:scale-95 transition-all"
              title="View your profile"
            >
              <Avatar profile={currentProfile} className="w-7 h-7" />
              <span className="text-xs font-semibold text-[var(--fg)] max-w-[90px] truncate hidden sm:inline">
                {currentProfile.name.split(' ')[0]}
              </span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('onboard')}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 rounded-xl font-semibold active:scale-95 shadow-sm"
            >
              Join
            </button>
          )}
        </div>
      </div>

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
