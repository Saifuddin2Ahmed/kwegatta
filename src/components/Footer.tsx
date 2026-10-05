import React, { useState } from 'react';
import { ExternalLink, Github, Mail } from 'lucide-react';
import { ContactModal } from './ContactModal';

interface FooterProps {
  onNavigate: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const [isContactOpen, setIsContactOpen] = useState(false);

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
    <>
      <footer className="w-full border-t border-[var(--card-border)] bg-[var(--bg-subtle)]/70 text-[var(--fg-muted)] transition-colors mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-8">
          
          {/* Brand Statement (Centered & Balanced) */}
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h3 className="text-lg sm:text-xl font-display font-bold text-[var(--fg)] tracking-tight">
              Find the people you should build and learn with.
            </h3>
            <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
              Open-weight AI matchmaking for builders, mentors &amp; collaborators.
            </p>
          </div>

          {/* 4 Balanced Discovery Columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center sm:text-left pt-2 border-t border-[var(--card-border)]/50">
            
            {/* Column 1: PRODUCT */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
                Product
              </h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    onClick={() => navigateToSection('people')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                  >
                    Discover People
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      const myId = localStorage.getItem('kw_me');
                      if (myId) {
                        navigateToSection('home');
                      } else {
                        navigateToSection('home', 'onboarding-composer');
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
                    onClick={() => navigateToSection('feed')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                  >
                    Project Wall
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

            {/* Column 2: COMMUNITY */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
                Community
              </h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    onClick={() => navigateToSection('about', 'team')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors font-medium text-[var(--fg)] cursor-pointer"
                  >
                    Our Team (7 Builders)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('about', 'story')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                  >
                    Hack Day Kampala × MUBS
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('people')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                  >
                    Community Directory
                  </button>
                </li>
                <li>
                  <a
                    href="https://hacktoberfest.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1"
                  >
                    <span>Hacktoberfest 2026</span>
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
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    onClick={() => navigateToSection('about', 'about-top')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                  >
                    About &amp; Origins
                  </button>
                </li>
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
                    onClick={() => navigateToSection('about', 'privacy')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer"
                  >
                    Privacy &amp; Data Policy
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setIsContactOpen(true)}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <Mail className="w-3 h-3 text-[var(--gold)]" />
                    <span>Contact Maintainers</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('admin')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer text-[var(--fg-subtle)] hover:text-[var(--fg)]"
                  >
                    Organiser Dashboard
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: OPEN SOURCE & AI */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">
                Open Source
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
                    href="https://ai.google.dev/gemma/docs/core"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--fg)] hover:underline transition-colors inline-flex items-center gap-1"
                  >
                    <span>Gemma 4 (31B-IT)</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => navigateToSection('about', 'license')}
                    className="hover:text-[var(--fg)] hover:underline transition-colors cursor-pointer text-left"
                  >
                    MIT License (Open Source)
                  </button>
                </li>
              </ul>
            </div>

          </div>

          {/* Centered Bottom Copyright & Legal Links */}
          <div className="pt-6 border-t border-[var(--card-border)] flex flex-col items-center justify-center gap-2.5 text-center text-xs text-[var(--fg-subtle)]">
            <p>© 2026 Kwegatta. Built for builders, mentors &amp; collaborators at Hack Day Kampala x MUBS.</p>
            
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
                onClick={() => navigateToSection('about', 'privacy')}
                className="hover:text-[var(--fg)] hover:underline cursor-pointer"
              >
                Privacy Policy
              </button>
              <span aria-hidden="true" className="text-[var(--fg-subtle)]">·</span>
              <button
                onClick={() => navigateToSection('about', 'license')}
                className="hover:text-[var(--fg)] hover:underline cursor-pointer"
              >
                License
              </button>
              <span aria-hidden="true" className="text-[var(--fg-subtle)]">·</span>
              <button
                onClick={() => setIsContactOpen(true)}
                className="hover:text-[var(--fg)] hover:underline cursor-pointer"
              >
                Contact
              </button>
              <span aria-hidden="true" className="text-[var(--fg-subtle)]">·</span>
              <button
                onClick={() => navigateToSection('admin')}
                className="hover:text-[var(--fg)] hover:underline cursor-pointer text-[var(--gold)]/80 hover:text-[var(--gold)]"
              >
                Organiser
              </button>
            </div>

            {/* Attribution */}
            <p className="pt-1 text-[11px] text-[var(--fg-subtle)]/80 font-normal">
              Powered by the open-weight model Gemma 4 (31B-IT)
            </p>
          </div>

        </div>
      </footer>

      {/* Accessible Contact Modal */}
      <ContactModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
      />
    </>
  );
};
