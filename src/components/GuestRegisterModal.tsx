import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { registerEventGuest } from '../services/api';

export interface GuestRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  onSuccess: (token: string) => void;
  onToast: (msg: string) => void;
  onJoinClick?: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const GuestRegisterModal: React.FC<GuestRegisterModalProps> = ({
  isOpen,
  onClose,
  eventId,
  onSuccess,
  onToast,
  onJoinClick,
  triggerRef
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestAgree, setGuestAgree] = useState(false);
  const [guestWebsite, setGuestWebsite] = useState(''); // honeypot
  const [submittingGuest, setSubmittingGuest] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape & trap focus inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      triggerRef?.current?.focus();
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return;
    if (!guestName.trim()) {
      onToast('Please enter your full name.');
      return;
    }
    if (!guestPhone.trim() && !guestEmail.trim()) {
      onToast('Please add at least one way to reach you.');
      return;
    }
    if (!guestAgree) {
      onToast('You must agree to share contact details with the host.');
      return;
    }

    setSubmittingGuest(true);
    try {
      const res = await registerEventGuest(eventId, {
        name: guestName.trim(),
        phone: guestPhone.trim() || undefined,
        email: guestEmail.trim() || undefined,
        agree: guestAgree,
        website: guestWebsite
      });
      if (res.token) {
        try {
          localStorage.setItem(`kw_guest_${eventId}`, res.token);
        } catch {}
        setGuestName('');
        setGuestPhone('');
        setGuestEmail('');
        setGuestAgree(false);
        setGuestWebsite('');
        onSuccess(res.token);
      }
    } catch (err: any) {
      onToast(err?.message || 'Failed to register');
    } finally {
      setSubmittingGuest(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="kw-card max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
          <div>
            <h3 className="font-bold text-sm text-[var(--fg)]">Register for event</h3>
            <p className="text-xs text-[var(--fg-muted)]">No account needed.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Honeypot hidden input */}
          <input
            type="text"
            name="website"
            value={guestWebsite}
            onChange={e => setGuestWebsite(e.target.value)}
            style={{ display: 'none' }}
            tabIndex={-1}
            autoComplete="off"
          />

          <div>
            <label className="font-semibold text-[var(--fg)] block mb-1">Full name *</label>
            <input
              ref={firstInputRef}
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="Your name"
              required
              className="kw-input text-xs"
            />
          </div>

          <div>
            <label className="font-semibold text-[var(--fg)] block mb-1">WhatsApp or phone</label>
            <input
              type="tel"
              value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
              placeholder="+256700000000"
              className="kw-input text-xs"
            />
          </div>

          <div>
            <label className="font-semibold text-[var(--fg)] block mb-1">Email</label>
            <input
              type="email"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              placeholder="you@example.com"
              className="kw-input text-xs"
            />
          </div>

          <p className="text-[13px] text-[var(--fg-subtle)] italic">
            Add at least one way to reach you.
          </p>

          <label className="flex items-start gap-2 cursor-pointer text-xs text-[var(--fg-muted)]">
            <input
              type="checkbox"
              checked={guestAgree}
              onChange={e => setGuestAgree(e.target.checked)}
              required
              className="mt-0.5"
            />
            <span>I agree that the host can see these details to manage this event.</span>
          </label>

          <div className="space-y-2 pt-2 border-t border-[var(--card-border)]">
            <button
              type="submit"
              disabled={submittingGuest}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold w-full cursor-pointer"
            >
              {submittingGuest ? 'Registering...' : 'Register'}
            </button>
            <div className="flex items-center justify-between text-[13px] pt-1">
              {onJoinClick && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onJoinClick();
                  }}
                  className="text-[var(--gold-text)] hover:underline cursor-pointer font-semibold"
                >
                  Have an account? Sign in
                </button>
              )}
              <a href="#/privacy" className="text-[var(--fg-muted)] hover:underline">
                Privacy Policy
              </a>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
