import React from 'react';
import { ExternalLink, Github } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="w-full border-t border-[var(--card-border)] bg-[var(--bg-subtle)]/50 text-[var(--fg-muted)] transition-colors mt-12 sm:mt-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
        
        {/* Brand Statement (Centered) */}
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h3 className="text-base sm:text-lg font-display font-bold text-[var(--fg)] tracking-tight">
            Find the people you should build with.
          </h3>
          <p className="text-xs sm:text-[13px] text-[var(--fg-muted)] leading-relaxed">
            AI-powered matchmaking for builders, mentors &amp; collaborators.
          </p>
        </div>

        {/* 3 Centered Discovery Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10 text-center">
          
          {/* Column 1: PRODUCT */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('people')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Discover People
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  AI Matchmaking
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('learn')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Peer Mentorship
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('feed')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Project Wall
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('wall')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Live Wall
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  How It Works
                </button>
              </li>
            </ul>
          </div>

          {/* Column 2: COMMUNITY */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
              Community
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Hack Day Kampala × MUBS
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors font-medium text-[var(--fg)]"
                >
                  Our Team
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('people')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Community Builders
                </button>
              </li>
              <li>
                <a
                  href="https://hacktoberfest.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1 justify-center"
                >
                  <span>Events &amp; Hacktoberfest</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: RESOURCES */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
              Resources
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  About Kwegatta
                </button>
              </li>
              <li>
                <a
                  href="https://github.com/Saifuddin2Ahmed/kwegatta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1 justify-center"
                >
                  <span>GitHub Repository</span>
                  <Github className="w-3 h-3 opacity-70" />
                </a>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  AI &amp; Gemma
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Privacy &amp; Data Policy
                </button>
              </li>
              <li>
                <a
                  href="mailto:saifuddin.ai.dev@gmail.com"
                  className="hover:text-[var(--fg)] hover:underline transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Centered Bottom Copyright & Legal Links */}
        <div className="pt-6 border-t border-[var(--card-border)]/70 flex flex-col items-center justify-center gap-2.5 text-center text-xs text-[var(--fg-subtle)]">
          <p>© 2026 Kwegatta. Built for builders, mentors &amp; collaborators.</p>
          
          <div className="flex items-center justify-center gap-3 text-[var(--fg-muted)]">
            <a
              href="https://github.com/Saifuddin2Ahmed/kwegatta"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--fg)] hover:underline"
            >
              GitHub
            </a>
            <span aria-hidden="true" className="text-[var(--fg-subtle)]">·</span>
            <button
              onClick={() => onNavigate('about')}
              className="hover:text-[var(--fg)] hover:underline"
            >
              Privacy
            </button>
            <span aria-hidden="true" className="text-[var(--fg-subtle)]">·</span>
            <a
              href="mailto:saifuddin.ai.dev@gmail.com"
              className="hover:text-[var(--fg)] hover:underline"
            >
              Contact
            </a>
          </div>

          {/* Very Last Line: Subtle Gemma 4 Attribution */}
          <p className="pt-1.5 text-[11px] text-[var(--fg-subtle)]/70 font-normal">
            Powered by Gemma 4
          </p>
        </div>

      </div>
    </footer>
  );
};
