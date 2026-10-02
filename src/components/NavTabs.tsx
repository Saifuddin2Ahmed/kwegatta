import React from 'react';
import { Zap, BookOpen, Users, MessageSquare, Bell, User, Settings, Info } from 'lucide-react';

interface NavTabsProps {
  activeTab: string;
  unreadCount: number;
  onTabChange: (tab: string) => void;
}

export const NavTabs: React.FC<NavTabsProps> = ({ activeTab, unreadCount, onTabChange }) => {
  const tabs = [
    { id: 'home', label: 'Matches', icon: Zap },
    { id: 'learn', label: 'Learn', icon: BookOpen },
    { id: 'people', label: 'People', icon: Users },
    { id: 'feed', label: 'Feed', icon: MessageSquare },
    { id: 'inbox', label: 'Inbox', icon: Bell, badge: unreadCount },
    { id: 'me', label: 'Profile', icon: User },
    { id: 'about', label: 'About', icon: Info },
    { id: 'setup', label: 'Setup', icon: Settings }
  ];

  return (
    <nav className="bg-[var(--header)] border-b border-[var(--border)] px-4 flex gap-1 overflow-x-auto scrollbar-none" aria-label="Main Navigation">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center gap-2 py-3 px-3 text-[13px] whitespace-nowrap transition-colors rounded-t-md hover:bg-[var(--btn-hover)] ${
              isActive ? 'font-semibold text-[var(--fg)]' : 'font-normal text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} />
            <span>{tab.label}</span>
            {tab.badge && tab.badge > 0 ? (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-[rgba(110,118,129,0.3)] text-[var(--fg)]">
                {tab.badge}
              </span>
            ) : null}

            {/* GitHub Primer orange underline indicator */}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--underline)] rounded-t-sm"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
