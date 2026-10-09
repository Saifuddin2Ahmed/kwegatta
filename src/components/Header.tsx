import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Laptop, Bell, Search, X, ChevronDown, User, LogOut, Download } from 'lucide-react';
import { Profile } from '../types';
import { Avatar } from './Avatar';
import { BrandLogo } from './BrandLogo';
import { ThemePreference } from '../utils';

export const SIGNED_OUT_NAV_ITEMS = [
  { id: 'people', label: 'People' },
  { id: 'events', label: 'Events' },
  { id: 'about', label: 'About' }
] as const;

export const SIGNED_IN_NAV_ITEMS = [
  { id: 'home', label: 'Matches' },
  { id: 'people', label: 'People' },
  { id: 'events', label: 'Events' },
  { id: 'learn', label: 'Learn' },
  { id: 'feed', label: 'Feed' },
  { id: 'inbox', label: 'Inbox' }
] as const;

interface HeaderProps {
  currentProfile: Profile | null;
  unreadCount: number;
  themePreference: ThemePreference;
  onCycleTheme: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNavigate: (tab: string) => void;
  onJoin?: () => void;
  onOpenSignIn?: () => void;
  onSignOut?: () => void;
  activeTab?: string;
  isDemoMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentProfile,
  unreadCount,
  themePreference,
  onCycleTheme,
  searchQuery,
  onSearchChange,
  onNavigate,
  onJoin,
  onOpenSignIn,
  onSignOut,
  activeTab
}) => {
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  });
  const [isIosSafari, setIsIosSafari] = useState<boolean>(false);
  const [showIosHint, setShowIosHint] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isWebkit = typeof navigator !== 'undefined' && /WebKit/i.test(navigator.userAgent);
    if (isIos && isWebkit && !isInstalled) {
      setIsIosSafari(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isInstalled]);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isApple = typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent);
  const searchShortcutHint = isApple ? '⌘K' : 'Ctrl K';

  useEffect(() => {
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Desktop links: signed-in sees SIGNED_IN_NAV_ITEMS; signed-out sees SIGNED_OUT_NAV_ITEMS
  const navItems = currentProfile ? SIGNED_IN_NAV_ITEMS : SIGNED_OUT_NAV_ITEMS;

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--header-bg)] backdrop-blur-xl border-b border-[var(--card-border)] transition-colors">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-16 sm:h-[68px] flex items-center justify-between gap-3 sm:gap-4">
        
        {/* LEFT: Logo & Desktop Links (Single Navigation Row) */}
        <div className="flex-shrink-0 flex items-center gap-4 lg:gap-6">
          <button
            onClick={() => onNavigate(currentProfile ? 'home' : 'people')}
            className="flex items-center gap-2.5 hover:opacity-90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded-lg p-0.5 cursor-pointer"
            aria-label="Kwegatta Home"
          >
            <BrandLogo size="md" showText={true} />
          </button>

          {/* Desktop Navigation: exactly one row */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Desktop Navigation">
            {navItems.map(link => {
              const isActive = activeTab === link.id || (!activeTab && link.id === (currentProfile ? 'home' : 'people'));
              return (
                <button
                  key={link.id}
                  onClick={() => onNavigate(link.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-lg text-[14px] transition-all cursor-pointer ${
                    isActive
                      ? 'text-[var(--gold-text)] bg-[var(--gold-subtle)] font-bold border-b-2 border-[var(--gold)]'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] font-medium'
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
              className="w-full bg-[var(--bg-subtle)] hover:bg-[var(--card)] focus:bg-[var(--card)] border border-[var(--card-border)] focus:border-[var(--gold)] text-[13px] text-[var(--fg)] placeholder:text-[var(--fg-subtle)] rounded-xl pl-9 pr-14 py-2 shadow-xs transition-all focus:shadow-[0_0_0_3px_var(--gold-subtle)] focus:outline-none"
              aria-label="Search people, skills, and needs"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[13px] font-mono text-[var(--fg-subtle)] bg-[var(--card)] border border-[var(--card-border)] px-1.5 py-0.5 rounded pointer-events-none">
              <span>{searchShortcutHint}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Search Toggle (Mobile), Theme Switcher, Notifications, Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile Search Icon */}
          <button
            onClick={() => {
              setShowMobileSearch(!showMobileSearch);
              if (!showMobileSearch) {
                setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
              }
            }}
            className="md:hidden w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all cursor-pointer"
            aria-label="Toggle search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Install App button if prompt available */}
          {!isInstalled && (deferredPrompt || isIosSafari) && (
            <div className="relative">
              <button
                type="button"
                onClick={isIosSafari ? () => setShowIosHint(!showIosHint) : handleInstallApp}
                className="text-[13px] font-semibold py-1.5 px-3 rounded-xl border border-[var(--gold)]/40 bg-[var(--gold-subtle)] text-[var(--fg)] hover:bg-[var(--gold)] hover:text-[#0B1220] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Install app"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install app</span>
              </button>
              {isIosSafari && showIosHint && (
                <div className="absolute right-0 top-full mt-2 w-56 p-3 bg-[var(--card)] border border-[var(--gold)]/40 rounded-xl shadow-2xl text-[13px] text-[var(--fg)] z-50 animate-in fade-in">
                  <p className="font-bold text-[var(--fg)] mb-1">Install on iPhone:</p>
                  <p className="text-[13px] text-[var(--fg-muted)]">
                    Tap Share, then Add to Home Screen
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Theme Switcher: Cycles System → Light → Dark */}
          <button
            onClick={onCycleTheme}
            className="w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)] cursor-pointer"
            aria-label={`Current theme: ${themePreference}. Click to cycle System, Light, Dark.`}
            title={`Theme: ${themePreference === 'system' ? 'System (follows device)' : themePreference === 'light' ? 'Light' : 'Dark'}`}
          >
            {themePreference === 'system' ? (
              <Laptop className="w-4 h-4 text-[var(--fg-muted)] transition-transform duration-200" />
            ) : themePreference === 'light' ? (
              <Sun className="w-4 h-4 text-amber-500 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon className="w-4 h-4 text-slate-300 transition-transform duration-300" />
            )}
          </button>

          {/* Inbox Notification Bell (when signed in) */}
          {currentProfile && (
            <button
              onClick={() => onNavigate('inbox')}
              className="relative w-9 h-9 rounded-xl border border-[var(--card-border)] grid place-items-center bg-[var(--btn)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--btn-hover)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--gold)] cursor-pointer"
              aria-label="Notifications"
              title="Inbox & notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-[var(--gold)] text-[#070B12] text-[13px] font-bold flex items-center justify-center leading-none shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Signed-out buttons: Sign in + primary Join */}
          {!currentProfile && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onOpenSignIn}
                className="text-[13px] font-semibold py-1.5 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-[var(--fg)] hover:border-[var(--gold)] active:scale-95 transition-all cursor-pointer shadow-xs"
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  if (onJoin) onJoin();
                  else onNavigate('onboard');
                }}
                className="kw-btn kw-btn-primary text-[13px] py-1.5 px-3.5 rounded-xl font-bold active:scale-95 shadow-xs cursor-pointer"
              >
                Join
              </button>
            </div>
          )}

          {/* Signed-in user Profile Avatar Menu */}
          {currentProfile && (
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-[var(--card-border)] hover:border-[var(--gold)] bg-[var(--btn)] active:scale-95 transition-all cursor-pointer shadow-xs"
                title="Profile menu"
                aria-expanded={showProfileMenu}
              >
                <Avatar profile={currentProfile} className="w-7 h-7" />
                <span className="text-[13px] font-semibold text-[var(--fg)] max-w-[85px] truncate hidden sm:inline">
                  {currentProfile.name.split(' ')[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl z-50 py-1.5 text-[13px] animate-in fade-in zoom-in-95">
                  <div className="px-3.5 py-2 border-b border-[var(--card-border)]/60">
                    <p className="font-bold text-[var(--fg)] truncate">{currentProfile.name}</p>
                    <p className="text-[13px] text-[var(--fg-muted)] truncate">{currentProfile.email || currentProfile.role}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onNavigate('me');
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg)] cursor-pointer"
                  >
                    <User className="w-4 h-4 text-[var(--fg-muted)]" />
                    <span>My profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      if (onSignOut) onSignOut();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-rose-500 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visitor top bar on mobile (<768px): People, Events, About */}
      {!currentProfile && (
        <div className="md:hidden flex items-center justify-around gap-1 px-4 py-2 border-t border-[var(--card-border)] bg-[var(--bg-subtle)]/40 text-[13px]">
          {SIGNED_OUT_NAV_ITEMS.map(link => {
            const isActive = activeTab === link.id;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'text-[var(--gold)] bg-[var(--gold-subtle)] font-bold underline underline-offset-4'
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
              className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] text-[13px] text-[var(--fg)] rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:border-[var(--gold)]"
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
