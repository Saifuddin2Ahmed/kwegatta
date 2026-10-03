import React from 'react';
import { Zap, BookOpen, Users, MessageSquare, Bell, User, Info } from 'lucide-react';

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
    { id: 'about', label: 'About', icon: Info }
  ];

  return (
    <nav className="bg-[var(--header-bg)] border-b border-[var(--card-border)] overflow-x-auto scrollbar-none transition-colors" aria-label="Main Navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 sm:gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-2 py-3.5 px-3 sm:px-4 text-xs sm:text-[13px] whitespace-nowrap transition-all rounded-t-lg hover:bg-[var(--card-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${
                isActive ? 'font-bold text-[var(--fg)]' : 'font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--gold)] stroke-[2.2]' : 'text-[var(--fg-muted)]'}`} />
              <span>{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--gold)] text-[#090D16]">
                  {tab.badge}
                </span>
              ) : null}

              {/* Active indicator bar */}
              {isActive && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[2.5px] bg-[var(--gold)] rounded-t-full shadow-sm"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
