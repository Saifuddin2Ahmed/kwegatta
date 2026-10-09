import React from 'react';
import { Zap, Users, Calendar, User } from 'lucide-react';

export const MOBILE_SIGNED_IN_TABS = [
  { id: 'home', label: 'Matches', icon: Zap },
  { id: 'people', label: 'People', icon: Users },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'me', label: 'Profile', icon: User }
] as const;

interface NavTabsProps {
  activeTab: string;
  unreadCount?: number;
  onTabChange: (tab: string) => void;
}

export const NavTabs: React.FC<NavTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--header-bg)] backdrop-blur-xl border-t border-[var(--card-border)] pb-safe shadow-lg transition-colors"
      aria-label="Mobile Navigation"
    >
      <div className="grid grid-cols-4 max-w-md mx-auto h-14">
        {MOBILE_SIGNED_IN_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
            (!activeTab && tab.id === 'home') ||
            (tab.id === 'me' && (activeTab === 'userProfile' || activeTab === 'me'));

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] cursor-pointer ${
                isActive
                  ? 'text-[var(--fg)] font-bold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)] font-medium'
              }`}
            >
              {/* Active Tab Indicator Bar (top of tab) - not color alone */}
              {isActive && (
                <span
                  className="absolute top-0 left-4 right-4 h-0.5 bg-[var(--gold)] rounded-full shadow-xs"
                  aria-hidden="true"
                />
              )}

              <Icon
                className={`w-4 h-4 transition-transform ${
                  isActive ? 'text-[var(--gold-text)] scale-110' : 'text-[var(--fg-muted)]'
                }`}
                aria-hidden="true"
              />

              <span className={`text-[13px] leading-none ${isActive ? 'font-bold underline underline-offset-4 decoration-[var(--gold)]' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
