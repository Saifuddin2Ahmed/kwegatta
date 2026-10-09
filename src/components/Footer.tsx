import React from 'react';
import { Github } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onNavigate: (tab: string, elementId?: string) => void;
  onJoin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const navigateToSection = (tab: string, elementId?: string) => {
    onNavigate(tab, elementId);
    if (elementId) {
      setTimeout(() => {
        const el = document.getElementById(elementId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 120);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="w-full relative bg-[var(--bg-subtle)]/70 text-[var(--fg-muted)] transition-colors mt-8">
      {/* 2px gradient line across the top: from gold #F5B700 to teal #12B5A6 */}
      <div className="w-full h-[2px] bg-gradient-to-r from-[#F5B700] to-[#12B5A6]" />

      <div className="max-w-[1200px] mx-auto px-4 py-5 sm:py-6 flex flex-col items-center text-center space-y-3 sm:space-y-4">
        {/* Brand block: (logo mark) Kwegatta + Tagline */}
        <div className="flex flex-col items-center space-y-1">
          <BrandLogo size="md" />
          <p className="text-[13px] text-[var(--fg-muted)] leading-snug max-w-sm">
            Find the people you should build and learn with.
          </p>
        </div>

        {/* Navigation links row: People · Matches · Events · Live wall · About · How it works · Privacy */}
        <nav aria-label="Footer Navigation" className="flex flex-wrap items-center justify-center gap-x-1.5 sm:gap-x-2 text-[13px] text-[var(--fg-muted)]">
          <button
            onClick={() => navigateToSection('people')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            People
          </button>
          <span className="text-[var(--fg-subtle)] select-none" aria-hidden="true">·</span>
          <button
            onClick={() => navigateToSection('matches')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            Matches
          </button>
          <span className="text-[var(--fg-subtle)] select-none" aria-hidden="true">·</span>
          <button
            onClick={() => navigateToSection('events')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            Events
          </button>
          <span className="text-[var(--fg-subtle)] select-none" aria-hidden="true">·</span>
          <button
            onClick={() => navigateToSection('wall')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            Live wall
          </button>
          <span className="text-[var(--fg-subtle)] select-none" aria-hidden="true">·</span>
          <button
            onClick={() => navigateToSection('about')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            About
          </button>
          <span className="text-[var(--fg-subtle)] select-none" aria-hidden="true">·</span>
          <button
            onClick={() => navigateToSection('about', 'how-it-works')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            How it works
          </button>
          <span className="text-[var(--fg-subtle)] select-none" aria-hidden="true">·</span>
          <button
            onClick={() => onNavigate('privacy')}
            className="min-h-[40px] px-2 inline-flex items-center hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
          >
            Privacy
          </button>
        </nav>

        {/* Three small outlined pill buttons: [GitHub] [Contribute] [MIT License] */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3.5 py-1.5 inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card)]/60 text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] transition-all"
          >
            <Github className="w-4 h-4 text-[var(--fg)]" />
            <span>GitHub</span>
          </a>
          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3.5 py-1.5 inline-flex items-center rounded-full border border-[var(--card-border)] bg-[var(--card)]/60 text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] transition-all"
          >
            Contribute
          </a>
          <button
            onClick={() => onNavigate('license')}
            className="min-h-[40px] px-3.5 py-1.5 inline-flex items-center rounded-full border border-[var(--card-border)] bg-[var(--card)]/60 text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] transition-all cursor-pointer"
          >
            MIT License
          </button>
        </div>

        {/* Bottom line: © 2026 Kwegatta · Powered by open-weight Gemma 4 */}
        <div className="pt-1 text-[13px] text-[var(--fg-subtle)]">
          <p>
            © 2026 Kwegatta ·{' '}
            <a
              href="https://ai.google.dev/gemma/docs/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--fg-muted)] hover:text-[var(--fg)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded"
            >
              Powered by open-weight Gemma 4
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};
