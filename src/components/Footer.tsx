import React from 'react';
import { ExternalLink, Github, Mail } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
  onJoin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onJoin }) => {
  const navigateToSection = (tab: string, elementId?: string) => {
    onNavigate(tab);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-8">
        
        {/* Brand Statement */}
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h3 className="text-lg sm:text-xl font-display font-bold text-[var(--fg)] tracking-tight">
            Find the people you should build and learn with.
          </h3>
          <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
            Open-weight AI matchmaking for people, mentors &amp; collaborators.
          </p>
        </div>

        {/* 3 Balanced Discovery Columns (12 links total, no duplicates) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left pt-2 border-t border-[var(--card-border)]/50">
          
          {/* Column 1: PLATFORM (4 links) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
              Platform
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateToSection('people')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  People Directory
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    if (onJoin) {
                      onJoin();
                    } else {
                      navigateToSection('home');
                    }
                  }}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  AI Matchmaking
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateToSection('learn')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  Peer Mentorship
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateToSection('wall')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  Live Projector Wall
                </button>
              </li>
            </ul>
          </div>

          {/* Column 2: ABOUT & LEGAL (4 links) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
              About &amp; Legal
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateToSection('about', 'how-it-works')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateToSection('about', 'about-top')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  About Kwegatta
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('license')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                >
                  Open Source License
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: CONNECT & COMMUNITY (4 links) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
              Connect &amp; Open Source
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://github.com/Saifuddin2Ahmed/kwegatta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1.5"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span>GitHub Repository</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Saifuddin2Ahmed/kwegatta/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1"
                >
                  <Mail className="w-3 h-3 text-[var(--gold)]" />
                  <span>Contact Maintainers</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </li>
              <li>
                <a
                  href="https://ai.google.dev/gemma/docs/core"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1"
                >
                  <span>Gemma 4: gemma-4-26b-a4b-it (default) / 31b-it (alt)</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Centered Bottom Copyright & Model Attribution */}
        <div className="pt-6 border-t border-[var(--card-border)] flex flex-col items-center justify-center gap-2 text-center text-xs text-[var(--fg-subtle)]">
          <p>© 2026 Kwegatta. Built for people, mentors &amp; collaborators.</p>
          <p className="text-[11px] text-[var(--fg-subtle)]/80 font-normal">
            Powered by open-weight Gemma 4 (<span className="text-[var(--fg)]">gemma-4-26b-a4b-it</span> default · <span className="text-[var(--fg)]">gemma-4-31b-it</span> alternative)
          </p>
        </div>

      </div>
    </footer>
  );
};
