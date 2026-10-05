import React, { useState } from 'react';
import { X, Mail, Check, Copy, ExternalLink, Github, MessageSquare, MapPin } from 'lucide-react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const email = 'saifuddin.ai.dev@gmail.com';

  if (!isOpen) return null;

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden p-6 space-y-6 text-[var(--fg)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center border border-[var(--gold)]/30">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[var(--fg)]">
                Contact Maintainers
              </h3>
              <p className="text-xs text-[var(--fg-muted)]">Kwegatta Open-Source Team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--card-border)]/40 grid place-items-center transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lead Engineer & Context */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-2 text-xs">
          <div className="flex items-center justify-between font-semibold text-[var(--fg)]">
            <span>Saifuddin Ahmed</span>
            <span className="text-[var(--gold)] font-mono text-[10px]">Team Lead</span>
          </div>
          <p className="text-[var(--fg-muted)] leading-relaxed">
            Future Stars Center for Development &amp; Capacity Building · Hack Day Kampala × MUBS
          </p>
          <div className="flex items-center gap-1.5 text-[var(--fg-subtle)] text-[11px] pt-1 border-t border-[var(--card-border)]/50">
            <MapPin className="w-3 h-3 text-[var(--teal)] flex-shrink-0" />
            <span>Makerere University Business School (MUBS), Kampala, Uganda</span>
          </div>
        </div>

        {/* Email Box with One-Click Copy */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--fg-muted)] block">
            Direct Email Address
          </label>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg)] border border-[var(--card-border)]">
            <input
              type="text"
              readOnly
              value={email}
              className="flex-1 bg-transparent text-xs font-mono text-[var(--fg)] outline-none select-all px-1"
            />
            <button
              onClick={handleCopy}
              className={`kw-btn text-xs py-1 px-3 inline-flex items-center gap-1.5 transition-all ${
                copied ? 'bg-emerald-600 text-white' : 'kw-btn-gold'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* External Links */}
        <div className="space-y-2.5 pt-2">
          <a
            href={`mailto:${email}?subject=Kwegatta%20Inquiry`}
            className="w-full kw-btn kw-btn-ghost text-xs py-2 px-3 flex items-center justify-center gap-2 border border-[var(--card-border)] hover:border-[var(--gold)]"
          >
            <Mail className="w-3.5 h-3.5 text-[var(--gold)]" />
            <span>Open in Mail App</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-auto" />
          </a>

          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full kw-btn kw-btn-ghost text-xs py-2 px-3 flex items-center justify-center gap-2 border border-[var(--card-border)] hover:border-[var(--teal)]"
          >
            <Github className="w-3.5 h-3.5" />
            <span>Report Issue on GitHub</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-auto" />
          </a>
        </div>
      </div>
    </div>
  );
};
