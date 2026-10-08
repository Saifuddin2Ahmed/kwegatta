import React from 'react';
import { Bell, Zap, UserPlus, MessageCircle, Sparkles, CheckCheck } from 'lucide-react';
import { NotificationItem, Profile } from '../types';
import { formatTimeAgo } from '../utils';
import { Avatar } from './Avatar';

interface InboxViewProps {
  notifications: NotificationItem[];
  allProfiles: Profile[];
  onMarkAllRead: () => void;
  onViewProfile: (id: string) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  notifications,
  allProfiles,
  onMarkAllRead,
  onViewProfile
}) => {
  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'match':
        return <Zap className="w-4 h-4 text-[var(--attention)]" />;
      case 'follow':
        return <UserPlus className="w-4 h-4 text-[var(--accent)]" />;
      case 'connect':
        return <MessageCircle className="w-4 h-4 text-[var(--success)]" />;
      case 'welcome':
        return <Sparkles className="w-4 h-4 text-[var(--done)]" />;
      case 'digest':
      default:
        return <Bell className="w-4 h-4 text-[var(--muted)]" />;
    }
  };

  const handleRequestPush = async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
  };

  return (
    <div className="kw-container space-y-6 md:space-y-10">
      {/* Browser alert prompt if supported & not yet requested */}
      {'Notification' in window && Notification.permission === 'default' && (
        <div className="primer-box p-3 bg-[var(--accent-subtle)] border-[var(--accent)] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--accent)]" />
            <span>Enable browser alerts when new matches or followers join?</span>
          </div>
          <button
            onClick={handleRequestPush}
            className="primer-btn primer-btn-primary text-xs py-1 px-2.5"
          >
            Turn on alerts
          </button>
        </div>
      )}

      {/* Main Inbox Card */}
      <div className="primer-box">
        <div className="primer-box-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--muted)]" />
            <span>Inbox & Notifications</span>
            <span className="text-xs text-[var(--muted)] font-normal">
              ({notifications.length})
            </span>
          </div>

          {notifications.some(n => !n.read) && (
            <button
              onClick={onMarkAllRead}
              className="primer-btn text-xs py-1 px-2.5"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-10 text-center space-y-4">
            <Bell className="w-8 h-8 text-[var(--gold)] mx-auto opacity-70" />
            <h3 className="font-semibold text-base text-[var(--fg)]">Your inbox is clear</h3>
            <p className="text-[13px] text-[var(--fg-muted)] max-w-sm mx-auto">
              Start a conversation with a match or collaborator in the network.
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '#/matches';
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                }}
                className="kw-btn kw-btn-primary text-[13px] py-1.5 px-4 font-semibold cursor-pointer"
              >
                Explore matches
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-muted)]">
            {notifications.map(n => {
              const sender = n.from_id ? allProfiles.find(p => p.id === n.from_id) : null;

              return (
                <div
                  key={n.id}
                  className={`p-3.5 flex items-start gap-3 transition-colors ${
                    !n.read ? 'bg-[var(--accent-subtle)]/30' : 'hover:bg-[var(--subtle)]'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{getIcon(n.type)}</div>

                  {sender && (
                    <button
                      onClick={() => onViewProfile(sender.id)}
                      className="flex-shrink-0"
                    >
                      <Avatar profile={sender} className="w-7 h-7" />
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--fg)] leading-relaxed">
                      {n.body}
                    </p>
                    <div className="text-[13px] text-[var(--muted)] mt-1">
                      {formatTimeAgo(n.created_at)}
                    </div>
                  </div>

                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
