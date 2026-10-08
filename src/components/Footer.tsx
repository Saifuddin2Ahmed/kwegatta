import React from 'react';
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
    <footer className="w-full border-t border-[var(--card-border)] bg-[var(--bg-subtle)]/70 text-[var(--fg-muted)] transition-colors mt-8">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 pt-5 pb-4">
        {/* At >=1024px: brand block on left, three columns on right in one row.
            At 390px: brand block, then 3 columns in a 2-column grid, then bottom bar. */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-12">
          
          {/* Brand block */}
          <div className="space-y-1.5 lg:max-w-xs">
            <BrandLogo size="md" />
            <p className="text-[13px] text-[var(--fg-muted)] leading-snug">
              Find the people you should build and learn with.
            </p>
          </div>

          {/* Three link columns in a 2-column grid on mobile, 3 columns on desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 lg:gap-10">
            
            {/* Column 1: Product */}
            <div>
              <h4 className="text-[13px] font-semibold text-[var(--fg)] mb-1">
                Product
              </h4>
              <ul className="flex flex-col">
                <li>
                  <button
                    onClick={() => navigateToSection('people')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    People
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('matches')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    Matches
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('events')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    Events
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('wall')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    Live wall
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2: Project */}
            <div>
              <h4 className="text-[13px] font-semibold text-[var(--fg)] mb-1">
                Project
              </h4>
              <ul className="flex flex-col">
                <li>
                  <button
                    onClick={() => navigateToSection('about')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    About
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('about', 'how-it-works')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    How it works
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('privacy')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    Privacy
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Open source */}
            <div className="col-span-2 lg:col-span-1">
              <h4 className="text-[13px] font-semibold text-[var(--fg)] mb-1">
                Open source
              </h4>
              <ul className="flex flex-wrap lg:flex-col gap-x-4 lg:gap-x-0">
                <li>
                  <a
                    href="https://github.com/Saifuddin2Ahmed/kwegatta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/Saifuddin2Ahmed/kwegatta/blob/main/CONTRIBUTING.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors"
                  >
                    Contribute
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('license')}
                    className="min-h-[40px] inline-flex items-center text-[13px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded transition-colors cursor-pointer"
                  >
                    MIT License
                  </button>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-3 mt-4 border-t border-[var(--card-border)] flex flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--fg-subtle)]">
          <p>
            © 2026 Kwegatta · Made in Kampala ·{' '}
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
