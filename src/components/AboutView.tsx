import React from 'react';
import {
  ExternalLink,
  Github,
  Linkedin,
  ArrowLeft,
  ArrowUpRight,
  Shield,
  Sparkles,
  ArrowRight,
  MessageCircle,
  Zap,
  Globe2,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { Avatar } from './Avatar';
import { useEventPhotos } from '../hooks/useEventPhotos';
import { useTeam } from '../hooks/useTeam';

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}

interface AboutViewProps {
  onNavigateHome: () => void;
  /** Signed-out visitors have no Matches page, so the back links are hidden for them */
  isSignedIn?: boolean;
}


export const AboutView: React.FC<AboutViewProps> = ({ onNavigateHome, isSignedIn = false }) => {
  const photos = useEventPhotos();
  const { team, loading: teamLoading } = useTeam();
  return (
    <div className="kw-container py-6 sm:py-12 space-y-6 md:space-y-10 animate-in fade-in">
      
      {/* 01. Hero Story Header */}
      <section id="about-top" className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          {isSignedIn ? (
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Matches</span>
            </button>
          ) : (
            <span />
          )}
          <span className="text-xs font-medium text-[var(--gold-text)] tracking-wide uppercase">
            Open-Source AI Matchmaking
          </span>
        </div>

        <div className="space-y-5 pt-3">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-display font-bold text-[var(--fg)] tracking-tight leading-[1.08] text-balance">
            Find the people you should build and learn with.
          </h1>
          <p className="text-base sm:text-xl text-[var(--fg-muted)] font-normal leading-relaxed max-w-2xl text-balance">
            Kwegatta comes from the Luganda word <strong className="text-[var(--fg)] font-semibold">okwegatta</strong>, meaning to unite or come together. In East Africa, we say: <span className="text-[var(--fg)] font-medium">Okwegatta ge maanyi</span> — unity is strength.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4">
          <button
            onClick={onNavigateHome}
            className="kw-btn kw-btn-gold text-xs py-2 px-4 inline-flex items-center gap-2 font-semibold shadow-sm"
          >
            <span>Start matching</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta"
            target="_blank"
            rel="noopener noreferrer"
            className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 inline-flex items-center gap-2 text-[var(--fg-muted)]"
          >
            <Github className="w-4 h-4" />
            <span>Explore source code</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </a>
        </div>
      </section>

      {/* 02. The Problem & Why Kwegatta Exists */}
      <section id="challenge" className="space-y-8 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-baseline">
          <div className="md:col-span-4 space-y-1">
            <span className="text-xs font-mono font-medium text-[var(--gold-text)]">01 / The challenge</span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
              Complementary people never find each other.
            </h2>
          </div>

          <div className="md:col-span-8 space-y-5 text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed">
            <p>
              In hackathons, university campuses, research hubs, and developer meetups, software engineers with technical chops and entrepreneurs with market insight sit two desks apart and never speak.
            </p>
            <p>
              Networking fails because it relies on serendipity, social extroversion, or vanity metrics. People talk only to the friends they arrived with, missing the collaborators who possess exactly what they need.
            </p>
          </div>
        </div>
      </section>

      {/* 03. The Visual Match Demonstration */}
      <section id="how-it-works" className="space-y-8 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="space-y-2">
          <span className="text-xs font-mono font-medium text-[var(--teal-text)]">02 / How it works</span>
          <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
            Matching needs with offers, not just keywords.
          </h2>
          <p className="text-xs sm:text-sm text-[var(--fg-muted)] max-w-xl">
            Instead of matching two identical developers, Kwegatta synthesizes complementary pairs where one member's offer fulfills the other's need.
          </p>
        </div>

        {/* Visual Match Architecture Showcase */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-9 gap-4 sm:gap-6 items-center">
            
            {/* Person A */}
            <div className="md:col-span-4 p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--gold)] text-[#090D16] font-bold text-sm grid place-items-center">
                  SA
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-[var(--fg)]">Product Creator</h4>
                  <p className="text-xs text-[var(--fg-muted)]">Future Stars Centre</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="text-[var(--teal-text)] font-medium">Offers: System Architecture &amp; UI</div>
                <div className="text-[var(--gold-text)] font-medium">Needs: Backend API &amp; Database</div>
              </div>
            </div>

            {/* Match Engine Node */}
            <div className="md:col-span-1 flex flex-col items-center justify-center text-center py-2 md:py-0">
              <div className="w-10 h-10 rounded-full bg-[var(--teal-subtle)] border border-[var(--teal)]/40 text-[var(--teal-text)] grid place-items-center shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-[13px] font-mono font-semibold text-[var(--teal-text)] mt-1.5">91% Match</span>
            </div>

            {/* Person B */}
            <div className="md:col-span-4 p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--teal)] text-[#090D16] font-bold text-sm grid place-items-center">
                  AM
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-[var(--fg)]">Cloud Developer</h4>
                  <p className="text-xs text-[var(--fg-muted)]">Sub-Saharan College</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="text-[var(--teal-text)] font-medium">Offers: Backend API &amp; Database</div>
                <div className="text-[var(--gold-text)] font-medium">Needs: System Architecture &amp; UI</div>
              </div>
            </div>

          </div>

          {/* Outcome Result */}
          <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0" />
              <span className="text-[var(--fg)]">
                <strong>Synthesized Collaboration:</strong> Build a high-throughput mobile community portal together.
              </span>
            </div>
            <span className="text-xs font-semibold text-[var(--gold-text)] shrink-0">1-Tap WhatsApp Connect</span>
          </div>
        </div>
      </section>

      {/* 03. Experience */}
      <section id="experience" className="space-y-8 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-4 space-y-1">
            <span className="text-xs font-mono font-medium text-[var(--gold-text)]">03 / Experience</span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
              Designed for speed on small phones.
            </h2>
          </div>

          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-[var(--fg-muted)]">
            <div className="space-y-2">
              <span className="text-sm font-semibold text-[var(--fg)] block">1. A short guided chat, about 2 minutes</span>
              <p className="leading-relaxed">
                Members share public details via a short guided chat, about 2 minutes on their smartphone. Zero lengthy forms or password barriers.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-semibold text-[var(--fg)] block">2. Fact-Based Synthesis</span>
              <p className="leading-relaxed">
                Gemma 4 synthesizes a crisp headline, role, and tags using only verified facts provided by the member. No hallucinated skills.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-semibold text-[var(--fg)] block">3. Peer Mentorship &amp; Study Buddies</span>
              <p className="leading-relaxed">
                Automatically finds one mentor teaching what you want to learn, and one study partner sharing the exact same goal.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-semibold text-[var(--fg)] block">4. Direct connection</span>
              <p className="leading-relaxed">
                Launch pre-composed WhatsApp icebreakers or connect with one tap.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 05. The Technology: Gemma 4 */}
      <section id="engine" className="space-y-8 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-baseline">
          <div className="md:col-span-4 space-y-1">
            <span className="text-xs font-mono font-medium text-[var(--teal-text)]">04 / The engine</span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
              AI as an engine for human connection.
            </h2>
          </div>

          <div className="md:col-span-8 space-y-5 text-sm text-[var(--fg-muted)] leading-relaxed">
            <p>
              Kwegatta is powered strictly by open-weight models from Google DeepMind, with <strong className="text-[var(--fg)]">gemma-4-26b-a4b-it</strong> as the default production model for sub-second profile synthesis and matchmaking, and <strong className="text-[var(--fg)]">gemma-4-31b-it</strong> as the designated high-capacity alternative. Closed proprietary APIs are excluded to ensure complete community sovereignty, permanent auditability, and zero vendor lock-in.
            </p>
            <p>
              AI does not replace human relationship-building; it reduces the search friction so real people can connect faster.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--fg-subtle)] font-mono">
              <span>Default: gemma-4-26b-a4b-it</span>
              <span>·</span>
              <span>Alternative: gemma-4-31b-it</span>
              <span>·</span>
              <span>Licence: Apache 2.0</span>
              <span>·</span>
              <span>Execution: Server-Side Proxy</span>
            </div>
          </div>
        </div>
      </section>

      {/* 06. The Team Behind Kwegatta */}
      <section id="team" className="space-y-10 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <span className="text-xs font-mono font-medium text-[var(--gold-text)]">05 / People</span>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[var(--fg)] tracking-tight">
              The Team
            </h2>
            <p className="text-xs sm:text-sm text-[var(--fg-muted)] mt-1">
              The people who built Kwegatta at Hack Day Kampala x MUBS.
            </p>
          </div>
        </div>

        {/* Team Photo Gallery Showcase */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-xl overflow-hidden border border-[var(--card-border)] shadow-md group">
            <img
              src={photos.hero}
              alt="Kwegatta team at Hack Day Kampala"
              className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-300"
              referrerPolicy="no-referrer"
            />
            <div className="p-3 bg-[var(--card)] text-xs text-[var(--fg-muted)]">
              Kwegatta team table · Hack Day Kampala x MUBS (Makerere University Business School)
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-[var(--card-border)] shadow-md group">
            <img
              src={photos.hall}
              alt="Hack Day Kampala event room"
              className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-300"
              referrerPolicy="no-referrer"
            />
            <div className="p-3 bg-[var(--card)] text-xs text-[var(--fg-muted)]">
              Event room · EIIC Innovation Centre at Makerere University Business School
            </div>
          </div>
        </div>

        {teamLoading && team.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" aria-busy="true" aria-label="Loading the team">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-xl bg-[var(--card)] border border-[var(--card-border)] animate-pulse" />
            ))}
          </div>
        ) : team.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">The team list will appear here soon.</p>
        ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start" aria-label="Kwegatta team">
          {team.map((member) => {
            const photoUrl = member.photo_url || member.linked_avatar || null;
            const line2 = member.line2 || '';
            const title = member.title ? String(member.title).trim() : '';
            const line1 = member.line1 ? String(member.line1).trim() : '';
            const bio = member.bio ? String(member.bio).trim() : '';
            const since = member.since ? String(member.since).trim() : '';
            const links: Array<{ href: string; label: string; icon: React.ReactNode }> = [];
            if (member.github) links.push({ href: `https://github.com/${member.github}`, label: 'GitHub', icon: <Github className="w-4 h-4" /> });
            if (member.linkedin) links.push({ href: member.linkedin, label: 'LinkedIn', icon: <Linkedin className="w-4 h-4" /> });
            if (member.x) links.push({ href: member.x, label: 'X', icon: <XLogo /> });
            if (member.website) links.push({ href: member.website, label: 'website', icon: <Globe2 className="w-4 h-4" /> });
            if (member.whatsapp_url) links.push({ href: member.whatsapp_url, label: 'WhatsApp', icon: <MessageCircle className="w-4 h-4" /> });

            return (
              <li
                key={member.id || member.name}
                className="p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] flex flex-col gap-3 min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt=""
                      loading="lazy"
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-[var(--card-border)]"
                    />
                  ) : (
                    <Avatar profile={{ name: member.name } as any} className="w-12 h-12 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    {member.linked_profile_id ? (
                      <a
                        href={`/#/u/${member.linked_profile_id}`}
                        className="font-semibold text-sm sm:text-base text-[var(--fg)] hover:text-[var(--gold-text)] hover:underline block break-words"
                      >
                        {member.name}
                      </a>
                    ) : (
                      <h3 className="font-semibold text-sm sm:text-base text-[var(--fg)] break-words">{member.name}</h3>
                    )}
                    {title && <p className="text-xs text-[var(--teal-text)] font-medium mt-0.5 break-words">{title}</p>}
                  </div>
                </div>

                {line2 && <p className="text-[13px] text-[var(--fg-subtle)] break-words">{line2}</p>}
                {line1 && <p className="text-xs text-[var(--fg-muted)] leading-relaxed break-words">{line1}</p>}
                {bio && <p className="text-xs text-[var(--fg-muted)] leading-relaxed break-words whitespace-pre-line">{bio}</p>}
                {since && <p className="text-xs text-[var(--fg-subtle)]">On the team since {since}</p>}

                {links.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 -ml-1.5">
                    {links.map(l => (
                      <a
                        key={l.label}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--fg-subtle)] hover:text-[var(--fg)] p-1.5 rounded-md transition-colors"
                        aria-label={`${member.name} on ${l.label}`}
                        title={l.label}
                      >
                        {l.icon}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        )}
      </section>

      {/* 07. Open Source & Community Roots */}
      <section id="story" className="space-y-6 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div id="hackathon" className="scroll-mt-24"></div>
        <div id="awards" className="scroll-mt-24"></div>
        <div className="p-8 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-6">
          <div className="space-y-2">
            <span className="text-xs font-mono font-medium text-[var(--teal-text)]">06 / Open source &amp; awards</span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
              Built as a Digital Public Good for global communities.
            </h2>
            <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed max-w-2xl">
              Kwegatta was built at <strong className="text-[var(--fg)]">Hacktoberfest 2026 Hack Day Kampala × MUBS</strong> (Makerere University Business School). We entered the Best Open-Source AI Project challenge, and Kwegatta was awarded 1st place · Hacktoberfest 2026 Hack Day Kampala. Sixty-seven people took part and eight projects were built. Kwegatta was awarded 1st place, and the team was forwarded to the MUBS Entrepreneurship, Innovation and Incubation Centre for its incubator. Released under the MIT licence, it is designed for adaptation by universities, NGOs, and developer networks worldwide.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="https://github.com/Saifuddin2Ahmed/kwegatta"
              target="_blank"
              rel="noopener noreferrer"
              className="kw-btn kw-btn-gold text-xs py-2 px-4 inline-flex items-center gap-2 font-semibold"
            >
              <Github className="w-4 h-4" />
              <span>Contribute on GitHub</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
            </a>
            {isSignedIn && (
              <button
                onClick={onNavigateHome}
                className="kw-btn kw-btn-ghost text-xs py-2 px-4"
              >
                Back to Matches
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 08. Privacy & Data Sovereignty Policy */}
      <section id="privacy" className="space-y-8 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-baseline">
          <div className="md:col-span-4 space-y-1">
            <span className="text-xs font-mono font-medium text-[var(--gold-text)]">07 / Privacy &amp; data policy</span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
              Zero telemetry. Full member sovereignty.
            </h2>
          </div>

          <div className="md:col-span-8 space-y-6 text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
            <div className="p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] space-y-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-[var(--fg)]">Zero Client-Side Telemetry</h4>
                  <p className="text-xs text-[var(--fg-muted)]">
                    No third-party trackers, no advertising cookies, and zero behavioral telemetry. Your browsing and profile activity is never sold or shared with analytics providers.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-[var(--fg)]">Fact-Based Open-Source AI Only</h4>
                  <p className="text-xs text-[var(--fg-muted)]">
                    All AI summaries use strictly the facts you supply during onboarding. The open-weight model Gemma 4 is instructed never to invent skills, degrees, or employers.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[var(--teal-text)] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-[var(--fg)]">Full Export &amp; Erasure Rights</h4>
                  <p className="text-xs text-[var(--fg-muted)]">
                    You can export all your data in standard JSON format or permanently delete your profile and all associated posts, matches, and notifications at any time from your profile page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 09. License & Open Source Terms */}
      <section id="license" className="space-y-8 border-t border-[var(--card-border)] pt-14 sm:pt-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-baseline">
          <div className="md:col-span-4 space-y-1">
            <span className="text-xs font-mono font-medium text-[var(--teal-text)]">08 / Legal &amp; licence</span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
              MIT License
            </h2>
            <p className="text-xs text-[var(--fg-muted)]">Free, open-source software.</p>
          </div>

          <div className="md:col-span-8 space-y-4 text-xs text-[var(--fg-muted)] leading-relaxed">
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] font-mono text-[13px] text-[var(--fg)] space-y-2">
              <p className="font-bold">Copyright (c) 2026 Kwegatta Contributors</p>
              <p>
                Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software...
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="https://github.com/Saifuddin2Ahmed/kwegatta/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="kw-btn kw-btn-ghost text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
              >
                <span>Read Full LICENSE on GitHub</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
              <a
                href="https://ai.google.dev/gemma/docs/core"
                target="_blank"
                rel="noopener noreferrer"
                className="kw-btn kw-btn-ghost text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
              >
                <span>Gemma Apache 2.0 Terms</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};
