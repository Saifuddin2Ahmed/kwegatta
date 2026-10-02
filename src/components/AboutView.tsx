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
  BookOpen,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { Avatar } from './Avatar';

interface AboutViewProps {
  onNavigateHome: () => void;
}

const TEAM_MEMBERS = [
  {
    name: 'Abubaker Mohamed Adam',
    affiliation: 'Sub-Saharan College',
    background: 'NGO volunteer',
    role: 'Community and NGO partnerships'
  },
  {
    name: 'Adinan Juuko',
    affiliation: 'Victoria University',
    background: 'Software Engineering',
    role: 'Testing and quality'
  },
  {
    name: 'Mupole Uwizeye Alexis',
    affiliation: 'Bugema University',
    background: 'Business Computing',
    role: 'Product and data'
  },
  {
    name: 'Nabagulanyi Prossy Sherry',
    affiliation: 'Makerere University Business School',
    background: 'Student',
    role: 'User research and outreach'
  },
  {
    name: 'Ojambo Emmanuel',
    affiliation: 'Makerere University Business School',
    background: 'Accounting',
    role: 'Business model and sustainability'
  },
  {
    name: 'Saifuddin Ahmed',
    affiliation: 'Future Stars Center for Development and Capacity Building (refugee-led NGO)',
    background: 'Engineer',
    role: 'Team lead and engineering'
  }
];

export const AboutView: React.FC<AboutViewProps> = ({ onNavigateHome }) => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
      {/* Hero Header */}
      <div className="primer-box p-6 sm:p-8 bg-[var(--subtle)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--fg)] text-[var(--header)] grid place-items-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--fg)]">About Kwegatta</h1>
          </div>
          <span className="primer-label primer-label-green text-xs font-semibold">
            Hacktoberfest 2026 Nominee
          </span>
        </div>

        <p className="text-sm text-[var(--fg)] leading-relaxed max-w-2xl">
          <strong>Kwegatta</strong> (from Luganda: <em>to connect, unite, join forces</em>) is an open-source networking and peer-learning platform where students and builders find the people they should build and learn with.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta"
            target="_blank"
            rel="noopener noreferrer"
            className="primer-btn text-xs py-1.5 px-3 inline-flex items-center gap-1.5 font-semibold"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub Repository</span>
            <ExternalLink className="w-3 h-3 text-[var(--muted)]" />
          </a>
          <a
            href="https://www.mlh.com/opensource-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="primer-btn primer-btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
          >
            <Award className="w-3.5 h-3.5" />
            <span>MLH Challenge Page</span>
            <ExternalLink className="w-3 h-3 text-white/80" />
          </a>
          <button
            onClick={onNavigateHome}
            className="primer-btn text-xs py-1.5 px-3"
          >
            Back to Matches
          </button>
        </div>
      </div>

      {/* The Hackathon Context */}
      <div className="primer-box p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Calendar className="w-4 h-4 text-[var(--accent)]" />
          <span>Hackathon Context & Location</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded space-y-1.5">
            <span className="text-[var(--muted)] font-medium">Event:</span>
            <p className="font-semibold text-[var(--fg)]">
              Hacktoberfest 2026 Hack Day Kampala x MUBS
            </p>
            <span className="text-[var(--muted)] block">Friday 2 October 2026</span>
          </div>

          <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded space-y-1.5">
            <span className="text-[var(--muted)] font-medium">Venue:</span>
            <p className="font-semibold text-[var(--fg)] flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <span>Entrepreneurship, Innovation and Incubation Centre (EIIC), Makerere University Business School, Nakawa Campus, Kampala, Uganda</span>
            </p>
          </div>

          <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded space-y-1.5">
            <span className="text-[var(--muted)] font-medium">Hosts & Organizers:</span>
            <p className="text-[var(--fg)] leading-relaxed">
              Hosted by <strong>Web3 Club MUBS</strong> and <strong>GDG on Campus MUBS</strong>. Hacktoberfest 2026 is powered by <strong>Major League Hacking (MLH)</strong> and <strong>DEV</strong>, presented by <strong>DigitalOcean</strong>.
            </p>
            <span className="primer-label primer-label-blue text-[10px]">Theme: "AI belongs to everyone"</span>
          </div>

          <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded space-y-1.5">
            <span className="text-[var(--muted)] font-medium">Challenge Category:</span>
            <p className="font-semibold text-[var(--fg)]">
              Best Open-Source AI Project
            </p>
            <p className="text-[var(--muted)] text-[11px] leading-relaxed">
              Requiring open-source/open-weight AI, a public repository under an open-source licence, full run instructions, and a live working demo.
            </p>
          </div>
        </div>
      </div>

      {/* The Open-Weight AI Model */}
      <div className="primer-box p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Cpu className="w-4 h-4 text-[var(--done)]" />
          <span>The Model: Gemma 4 (31B IT)</span>
        </div>

        <p className="text-xs text-[var(--fg)] leading-relaxed">
          Kwegatta runs strictly and solely on the open-weight model <strong>gemma-4-31b-it</strong>. Closed or proprietary models are prohibited to ensure technological sovereignty and permanent open-source reproducibility.
        </p>

        <div className="p-3 bg-[var(--subtle)] rounded border border-[var(--border)] text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--muted)]">Model Identifier:</span>
            <code className="bg-[var(--bg)] px-2 py-0.5 rounded border border-[var(--border)] font-mono text-[var(--accent)] font-semibold">
              gemma-4-31b-it
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--muted)]">Parameter Scale:</span>
            <span className="text-[var(--fg)] font-medium">31 Billion Parameters (Qualifying Large Language Model)</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--muted)]">Licence:</span>
            <a
              href="https://ai.google.dev/gemma/docs/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>Apache 2.0 (Open-Weight Model Licence)</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--muted)]">Privacy Architecture:</span>
            <span className="text-[var(--success)] font-medium flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Executed strictly server-side; zero API keys in browser</span>
            </span>
          </div>
        </div>
      </div>

      {/* Team Table (Equal Credit, Alphabetical) */}
      <div className="primer-box">
        <div className="primer-box-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--accent)]" />
            <span>Kwegatta Team</span>
          </div>
          <span className="text-[11px] text-[var(--muted)]">Equal credit · Alphabetical order</span>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {TEAM_MEMBERS.map(member => (
            <div
              key={member.name}
              className="p-3.5 bg-[var(--subtle)] rounded border border-[var(--border)] flex items-start gap-3 hover:border-[var(--accent)] transition-colors"
            >
              <Avatar
                profile={{ name: member.name } as any}
                className="w-10 h-10 flex-shrink-0"
              />
              <div className="space-y-1 min-w-0 flex-1">
                <div className="font-semibold text-xs text-[var(--fg)] leading-snug">
                  {member.name}
                </div>
                <div className="text-[11px] text-[var(--muted)] leading-tight">
                  {member.affiliation}
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="primer-label primer-label-blue text-[10px]">
                    {member.role}
                  </span>
                  <span className="primer-label text-[10px] text-[var(--muted)]">
                    {member.background}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Digital Public Goods & Open-Source Integrity */}
      <div className="primer-box p-5 space-y-3 bg-[var(--subtle)] text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-[var(--success)]" />
            <span>Digital Public Goods & Community Standards</span>
          </span>
          <span className="primer-label primer-label-green text-[10px]">DPG Aligned</span>
        </div>

        <p className="text-[var(--muted)] leading-relaxed">
          Kwegatta is designed to be <strong>aligned with</strong> the Digital Public Goods Standard, advancing <strong>SDG 4</strong> (Quality Education), <strong>SDG 8</strong> (Decent Work & Economic Growth), <strong>SDG 9</strong> (Industry & Innovation), and <strong>SDG 17</strong> (Partnerships for the Goals).
        </p>

        <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
          <span className="px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)]">
            OSI-Approved MIT Licence
          </span>
          <span className="px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)]">
            Zero Telemetry / No Tracking
          </span>
          <span className="px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)]">
            User Data Export (JSON)
          </span>
          <span className="px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)]">
            Permanent Profile Deletion
          </span>
          <span className="px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)]">
            Phone Number Scrape Protection
          </span>
        </div>
      </div>
    </div>
  );
};
