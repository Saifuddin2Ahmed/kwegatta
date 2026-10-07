import React from 'react';
import { Zap, BookOpen, Users, MessageSquare, Bell, User, Info, Calendar } from 'lucide-react';

interface NavTabsProps {
  activeTab: string;
  unreadCount: number;
  onTabChange: (tab: string) => void;
}

export const NavTabs: React.FC<NavTabsProps> = ({ activeTab, unreadCount, onTabChange }) => {
  const tabs = [
    { id: 'home', label: 'Matches', icon: Zap },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'learn', label: 'Peer Learning', icon: BookOpen },
    { id: 'people', label: 'Directory', icon: Users },
    { id: 'feed', label: 'Project Wall', icon: MessageSquare },
    { id: 'inbox', label: 'Inbox', icon: Bell, badge: unreadCount },
    { id: 'me', label: 'My Profile', icon: User },
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
              className={`relative flex items-center gap-2 py-3 px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${
                isActive ? 'text-[var(--fg)] font-semibold' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[var(--gold)]' : 'text-[var(--fg-muted)]'}`} />
              <span>{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--gold)] text-[#090D16]">
                  {tab.badge}
                </span>
              ) : null}

              {/* Minimalist Bottom Indicator */}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--gold)]"
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
