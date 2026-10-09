import React, { useEffect, useRef } from 'react';
import { X, MessageCircle, UserPlus, Check, User, ExternalLink } from 'lucide-react';
import { NotificationItem, Profile } from '../types';
import { formatTimeAgo, formatWhatsAppUrl } from '../utils';
import { Avatar } from './Avatar';

interface NotificationModalProps {
  notification: NotificationItem | null;
  sender: Profile | null;
  isFollowingSender: boolean;
  onClose: () => void;
  onViewProfile: (profileId: string) => void;
  onFollowBack?: (profileId: string) => void;
  onOpenRelated?: (notification: NotificationItem) => void;
  triggerElement?: HTMLElement | null;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  notification,
  sender,
  isFollowingSender,
  onClose,
  onViewProfile,
  onFollowBack,
  onOpenRelated,
  triggerElement
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!notification) return;

    // Save previous active element if not provided
    const previousFocus = triggerElement || (document.activeElement as HTMLElement | null);

    // Initial focus on close button or modal container
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    // Trap focus inside modal & handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to clicked row on close
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
  }, [notification, onClose, triggerElement]);

  if (!notification) return null;

  const senderName = sender?.name || 'Kwegatta Network';
  const senderHeadline = sender?.headline || '';
  const canWhatsApp = Boolean(
    sender &&
    sender.whatsapp &&
    !sender.hide_whatsapp &&
    String(sender.whatsapp).trim().length > 0
  );

  const whatsAppUrl = canWhatsApp && sender?.whatsapp
    ? formatWhatsAppUrl(sender.whatsapp, `Hi ${sender.name.split(' ')[0] || ''}! I received your connection message on Kwegatta.`)
    : '';

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-modal-sender-name"
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--card-border)] p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 transition-colors"
      >
        {/* Header: Sender Info & Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {sender ? (
              <Avatar profile={sender} className="w-12 h-12 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold-text)] font-bold text-base grid place-items-center flex-shrink-0">
                KN
              </div>
            )}
            <div className="min-w-0">
              <h3
                id="notif-modal-sender-name"
                className="font-bold text-base text-[var(--fg)] truncate"
              >
                {senderName}
              </h3>
              {senderHeadline && (
                <p className="text-xs text-[var(--fg-muted)] truncate mt-0.5">
                  {senderHeadline}
                </p>
              )}
              <div className="text-[13px] text-[var(--fg-subtle)] font-mono mt-0.5">
                {formatTimeAgo(notification.created_at)}
              </div>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            aria-label="Close notification"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Full Notification Text */}
        <div className="p-4 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--card-border)]">
          <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-wrap">
            {notification.body}
          </p>
        </div>

        {/* Actions depending on notification type */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
          {notification.type === 'connect' && (
            <>
              {canWhatsApp && whatsAppUrl && (
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kw-btn kw-btn-success text-xs py-2 px-3.5 font-semibold flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Reply on WhatsApp</span>
                </a>
              )}

              {sender && !isFollowingSender && onFollowBack && (
                <button
                  type="button"
                  onClick={() => {
                    onFollowBack(sender.id);
                  }}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 font-semibold border border-[var(--card-border)] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[var(--teal-text)]" />
                  <span>Follow back</span>
                </button>
              )}

              {sender && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewProfile(sender.id);
                  }}
                  className="kw-btn kw-btn-primary text-xs py-2 px-3.5 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>View profile</span>
                </button>
              )}
            </>
          )}

          {notification.type === 'follow' && (
            <>
              {sender && !isFollowingSender && onFollowBack && (
                <button
                  type="button"
                  onClick={() => {
                    onFollowBack(sender.id);
                  }}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 font-semibold border border-[var(--card-border)] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[var(--teal-text)]" />
                  <span>Follow back</span>
                </button>
              )}

              {sender && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewProfile(sender.id);
                  }}
                  className="kw-btn kw-btn-primary text-xs py-2 px-3.5 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>View profile</span>
                </button>
              )}
            </>
          )}

          {notification.type !== 'connect' && notification.type !== 'follow' && (
            <>
              {sender && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewProfile(sender.id);
                  }}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 font-semibold border border-[var(--card-border)] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>View profile</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenRelated) {
                    onOpenRelated(notification);
                  } else if (sender) {
                    onViewProfile(sender.id);
                  }
                }}
                className="kw-btn kw-btn-primary text-xs py-2 px-3.5 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
