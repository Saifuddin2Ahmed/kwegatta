import React from 'react';
import {
  Sparkles,
  ExternalLink,
  Github,
  Award,
  Users,
  MapPin,
  Calendar,
  Building,
  HeartHandshake,
  Cpu,
  ShieldCheck,
  ArrowLeft,
  Code,
  GitPullRequest
} from 'lucide-react';
import { Avatar } from './Avatar';
import { BrandLogo } from './BrandLogo';

interface AboutViewProps {
  onNavigateHome: () => void;
}

const TEAM_MEMBERS = [
  {
    name: 'Saifuddin Ahmed',
    affiliation: 'Future Stars Centre for Development and Capacity Building',
    background: 'Engineer building digital and AI systems for NGOs and communities',
    role: 'Team Lead & Engineering',
    github: 'Saifuddin2Ahmed'
  },
  {
    name: 'Abubaker Mohamed Adam',
    affiliation: 'Sub-Saharan College',
    background: 'Volunteer in NGOs',
    role: 'Community & NGO Partnerships',
    github: 'abubakermohammed092077-bit'
  },
  {
    name: 'Adinan Juuko',
    affiliation: 'Victoria University',
    background: 'Software Engineering',
    role: 'Quality Assurance & Testing',
    github: null
  },
  {
    name: 'Mupole Uwizeye Alexis',
    affiliation: 'Bugema University',
    background: 'Business Computing',
    role: 'Product & Data',
    github: 'Alexis-Mupole'
  },
  {
    name: 'Nabagulanyi Prossy Sherry',
    affiliation: 'Makerere University Business School (MUBS)',
    background: 'Student',
    role: 'User Research & Community Outreach',
    github: null
  },
  {
    name: 'Ojambo Emmanuel',
    affiliation: 'Makerere University Business School (MUBS)',
    background: 'Accounting',
    role: 'Business & Sustainability',
    github: 'ojambo9'
  },
  {
    name: 'Amme Patience Esther',
    affiliation: 'Makerere University Business School (MUBS)',
    background: 'Bachelor of Marketing',
    role: 'Marketing & Communications',
    github: 'Aditech-191'
  }
];

export const AboutView: React.FC<AboutViewProps> = ({ onNavigateHome }) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in py-2">
      
      {/* Hero Header */}
      <div className="kw-card p-6 sm:p-8 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" showText={true} />
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)]">
              About &amp; Origins
            </h1>
          </div>
          <span className="kw-badge kw-badge-teal text-xs font-semibold">
            Open-Source AI Project
          </span>
        </div>

        {/* Meaning of Kwegatta Section */}
        <div className="p-4 sm:p-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--gold)]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>The Meaning of Kwegatta</span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--fg)] leading-relaxed">
            <strong className="text-[var(--fg)] font-semibold">"Kwegatta"</strong> is a Luganda word meaning <em>"to unite"</em> or <em>"to come together."</em>
          </p>
          <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
            That idea is at the heart of the platform: bringing the right people together based on what they can offer, what they need, what they can teach, and what they want to learn. As the saying goes, <em>Okwegatta ge maanyi: unity is strength.</em>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta"
            target="_blank"
            rel="noopener noreferrer"
            className="kw-btn kw-btn-gold text-xs py-2 px-3.5 inline-flex items-center gap-1.5 font-semibold"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub Repository</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <button
            onClick={onNavigateHome}
            className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Matches</span>
          </button>
        </div>
      </div>

      {/* The Open-Weight AI Architecture */}
      <div className="kw-card p-5 sm:p-6 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-[var(--fg)]">
          <Cpu className="w-4 h-4 text-[var(--teal)]" />
          <span>AI Architecture &amp; The Gemma 4 Model</span>
        </div>

        <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
          Kwegatta runs strictly and solely on the open-weight model <strong className="text-[var(--fg)]">gemma-4-31b-it</strong>. Closed or proprietary models are prohibited to ensure technological sovereignty, privacy, and permanent open-source reproducibility.
        </p>

        <div className="p-3.5 bg-[var(--bg-subtle)] rounded-xl border border-[var(--card-border)] text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--fg-muted)]">Model Identifier:</span>
            <code className="bg-[var(--card)] px-2 py-0.5 rounded border border-[var(--card-border)] font-mono text-[var(--gold)] font-semibold">
              gemma-4-31b-it
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--fg-muted)]">Parameter Scale:</span>
            <span className="text-[var(--fg)] font-medium">31 Billion Parameters (Open-Weight LLM)</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--fg-muted)]">Licence:</span>
            <a
              href="https://ai.google.dev/gemma/docs/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--gold)] hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>Apache 2.0 (Open-Weight Model Licence)</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--fg-muted)]">Privacy Architecture:</span>
            <span className="text-[var(--teal)] font-medium flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Executed strictly server-side; zero API keys in browser</span>
            </span>
          </div>
        </div>
      </div>

      {/* Team Table */}
      <div className="kw-card bg-[var(--card)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-[var(--fg)]">
            <Users className="w-4 h-4 text-[var(--gold)]" />
            <span>Our Team</span>
          </div>
          <span className="text-[11px] text-[var(--fg-muted)]">Core contributors</span>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {TEAM_MEMBERS.map(member => (
            <div
              key={member.name}
              className="p-3.5 bg-[var(--bg-subtle)] rounded-xl border border-[var(--card-border)] flex items-start gap-3 hover:border-[var(--gold)]/40 transition-colors"
            >
              <Avatar
                profile={{ name: member.name } as any}
                className="w-10 h-10 flex-shrink-0"
              />
              <div className="space-y-1 min-w-0 flex-1">
                <div className="font-semibold text-xs text-[var(--fg)] leading-snug flex items-center justify-between gap-2">
                  <span className="truncate">{member.name}</span>
                  {member.github ? (
                    <a
                      href={`https://github.com/${member.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--gold)] hover:underline inline-flex items-center gap-1 font-mono flex-shrink-0"
                    >
                      <span>@{member.github}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-[var(--fg-subtle)] font-mono flex-shrink-0">none yet</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--fg-muted)] leading-tight">
                  {member.affiliation}
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="kw-badge kw-badge-teal text-[10px]">
                    {member.role}
                  </span>
                  <span className="kw-badge kw-badge-muted text-[10px]">
                    {member.background}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Want to build with us? CTA */}
        <div className="p-4 sm:p-5 bg-[var(--bg-subtle)]/60 border-t border-[var(--card-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-semibold text-[var(--fg)]">Want to build with us?</p>
            <p className="text-[var(--fg-muted)] text-[11px]">Kwegatta is open source and welcomes contributors across engineering, product, and community.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://github.com/Saifuddin2Ahmed/kwegatta"
              target="_blank"
              rel="noopener noreferrer"
              className="kw-btn kw-btn-gold text-xs py-1.5 px-3 inline-flex items-center gap-1.5 font-semibold"
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              <span>Contribute on GitHub</span>
            </a>
          </div>
        </div>
      </div>

      {/* Community & Campus Origins */}
      <div className="kw-card p-5 sm:p-6 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-[var(--fg)]">
          <Calendar className="w-4 h-4 text-[var(--gold)]" />
          <span>Community &amp; Campus Roots</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div className="p-3.5 bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl space-y-1.5">
            <span className="text-[var(--fg-muted)] font-medium">Event:</span>
            <p className="font-semibold text-[var(--fg)]">
              Hacktoberfest 2026 Hack Day Kampala x MUBS
            </p>
            <span className="text-[var(--fg-subtle)] block">Friday 2 October 2026</span>
          </div>

          <div className="p-3.5 bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl space-y-1.5">
            <span className="text-[var(--fg-muted)] font-medium">Venue:</span>
            <p className="font-semibold text-[var(--fg)] flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <span>Entrepreneurship, Innovation and Incubation Centre (EIIC), Makerere University Business School, Kampala, Uganda</span>
            </p>
          </div>
        </div>
      </div>

      {/* Digital Public Goods & Open-Source Integrity */}
      <div className="kw-card p-5 space-y-3 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm flex items-center gap-2 text-[var(--fg)]">
            <HeartHandshake className="w-4 h-4 text-[var(--teal)]" />
            <span>Digital Public Goods &amp; Privacy Standards</span>
          </span>
          <span className="kw-badge kw-badge-teal text-[10px]">DPG Aligned</span>
        </div>

        <p className="text-[var(--fg-muted)] leading-relaxed">
          Kwegatta is designed to align with open, privacy-conscious, and community-oriented Digital Public Goods principles, advancing SDG 4 (Quality Education), SDG 8 (Decent Work &amp; Economic Growth), SDG 9 (Industry &amp; Innovation), and SDG 17 (Partnerships for the Goals).
        </p>

        <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] text-[var(--fg)]">
            OSI-Approved MIT Licence
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] text-[var(--fg)]">
            Zero Telemetry / No Tracking
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] text-[var(--fg)]">
            User Data Export (JSON)
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] text-[var(--fg)]">
            Permanent Profile Deletion
          </span>
        </div>
      </div>

    </div>
  );
};
