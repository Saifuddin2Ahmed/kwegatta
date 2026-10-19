import React from 'react';
import {
  ExternalLink,
  Github,
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Shield,
  Sparkles,
  MessageCircle,
  MessageSquareText,
  Zap,
  Lock,
  Download,
  Trophy,
  ChevronDown
} from 'lucide-react';
import { useEventPhotos } from '../hooks/useEventPhotos';
import { useTeam } from '../hooks/useTeam';
import { HEADER_IMAGES } from '../lib/headerImages';
import { TeamGrid } from './TeamGrid';

interface AboutViewProps {
  onNavigateHome: () => void;
  /** Signed-out visitors have no Matches page, so the back links are hidden for them */
  isSignedIn?: boolean;
}

/** 800px and 1600px copies of the built-in Hack Day photos; uploaded previews have one size only. */
function hackDaySrcSet(url: string): string | undefined {
  return url.startsWith('/images/') && url.includes('-800.webp')
    ? `${url} 800w, ${url.replace('-800.webp', '-1600.webp')} 1600w`
    : undefined;
}

const STEPS = [
  {
    icon: MessageSquareText,
    title: 'Tell us what you need and offer',
    body: 'A short guided chat, about 2 minutes on your phone. No long forms.'
  },
  {
    icon: Sparkles,
    title: 'Get matched',
    body: "Gemma 4 pairs you with people whose offer meets your need, using only the facts you give."
  },
  {
    icon: MessageCircle,
    title: 'Connect on WhatsApp',
    body: 'Open a ready-made hello message with one tap and start building.'
  }
];

const PRIVACY_POINTS = [
  {
    icon: Shield,
    title: 'No trackers',
    body: 'No third-party trackers, no advertising cookies and no behaviour tracking.'
  },
  {
    icon: Lock,
    title: 'Only your facts',
    body: 'Summaries use only what you tell us. The model is told never to invent skills, degrees or employers.'
  },
  {
    icon: Download,
    title: 'Export or delete any time',
    body: 'Download your data as JSON, or delete your profile and everything linked to it, from your profile page.'
  }
];

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--teal-text)]">{children}</span>
);

export const AboutView: React.FC<AboutViewProps> = ({ onNavigateHome, isSignedIn = false }) => {
  const photos = useEventPhotos();
  const { team, loading: teamLoading } = useTeam();
  const hero = HEADER_IMAGES.about;

  const scrollToTeam = () => {
    const el = document.getElementById('team');
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-16 sm:space-y-24 animate-in fade-in">
      {/* Hero */}
      <div className="space-y-4">
        {isSignedIn && (
          <button
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Matches</span>
          </button>
        )}

        <section
          id="about-top"
          aria-labelledby="about-title"
          className="relative isolate overflow-hidden rounded-3xl flex items-end min-h-[440px] sm:min-h-[520px] lg:min-h-[560px]"
        >
          <img
            src={hero.src}
            srcSet={hero.srcSet}
            sizes="(min-width: 1200px) 1152px, 100vw"
            alt={hero.alt}
            width={1920}
            height={1080}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-20 w-full h-full object-cover"
          />
          <div aria-hidden="true" className="kw-hero-overlay absolute inset-0 -z-10" />

          <div className="w-full p-6 sm:p-12 lg:p-16 space-y-5 sm:space-y-6">
            <span className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25">
              Open-source AI matchmaking
            </span>
            <h1
              id="about-title"
              className="max-w-3xl text-3xl sm:text-5xl lg:text-6xl font-display font-bold text-white tracking-tight leading-[1.08] text-balance"
            >
              Find the people you should build and learn with.
            </h1>
            <p className="max-w-2xl text-base sm:text-xl text-white/90 leading-relaxed text-balance">
              Kwegatta matches students and builders by what they need and what they offer.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={onNavigateHome}
                className="kw-btn kw-btn-gold text-sm py-2.5 px-5 inline-flex items-center gap-2 font-semibold shadow-sm"
              >
                <span>Start matching</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={scrollToTeam}
                className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold py-2.5 px-5 text-white bg-white/10 ring-1 ring-white/40 hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>Meet the team</span>
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <p className="max-w-3xl text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed text-balance">
          Kwegatta comes from the Luganda word <strong className="text-[var(--fg)] font-semibold">okwegatta</strong>, meaning to unite or come together. In East Africa, we say: <span className="text-[var(--fg)] font-medium">Okwegatta ge maanyi</span> — unity is strength.
        </p>
      </div>

      {/* The problem and our answer */}
      <section id="challenge" aria-label="The problem and our answer" className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="p-6 sm:p-8 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-3">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
            The right people never meet.
          </h2>
          <p className="text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed">
            At hackathons, campuses and meetups, a developer and the founder who needs them sit two desks apart and never speak. Networking still depends on luck and on the friends you arrived with.
          </p>
        </div>
        <div className="p-6 sm:p-8 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-3">
          <Eyebrow>Our answer</Eyebrow>
          <h2 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)] tracking-tight">
            Match needs with offers.
          </h2>
          <p className="text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed">
            Kwegatta pairs people where one person's offer meets the other's need, not people with the same keywords. You get a short list of people worth meeting and a message ready to send.
          </p>
        </div>
      </section>

      {/* The team */}
      <section id="team" aria-labelledby="team-title" className="space-y-8 scroll-mt-24">
        <div className="space-y-2 max-w-2xl">
          <Eyebrow>The team</Eyebrow>
          <h2 id="team-title" className="text-2xl sm:text-4xl font-display font-bold text-[var(--fg)] tracking-tight">
            The people behind Kwegatta
          </h2>
          <p className="text-sm sm:text-base text-[var(--fg-muted)]">
            Built at Hack Day Kampala × MUBS.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <figure className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] aspect-[16/9] bg-[var(--bg-subtle)]">
            <img
              src={photos.hero}
              srcSet={hackDaySrcSet(photos.hero)}
              sizes="(min-width: 1200px) 570px, 50vw"
              alt="The Kwegatta team coding together at their table during Hack Day Kampala"
              loading="lazy"
              decoding="async"
              width={800}
              height={450}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </figure>
          <figure className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] aspect-[16/9] bg-[var(--bg-subtle)]">
            <img
              src={photos.hall}
              srcSet={hackDaySrcSet(photos.hall)}
              sizes="(min-width: 1200px) 570px, 50vw"
              alt="The Hack Day Kampala event room at the MUBS innovation centre"
              loading="lazy"
              decoding="async"
              width={800}
              height={450}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </figure>
        </div>

        <TeamGrid team={team} loading={teamLoading} />
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="space-y-8 scroll-mt-24">
        <div className="space-y-2 max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="how-title" className="text-2xl sm:text-4xl font-display font-bold text-[var(--fg)] tracking-tight">
            Three steps to the right people
          </h2>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--teal-subtle)] text-[var(--teal-text)] grid place-items-center" aria-hidden="true">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-[var(--fg-subtle)]">Step {i + 1}</span>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-[var(--fg)]">{step.title}</h3>
                <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{step.body}</p>
              </li>
            );
          })}
        </ol>

        {/* Match example */}
        <div className="p-5 sm:p-8 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-6" aria-label="Example match">
          <div className="grid grid-cols-1 md:grid-cols-9 gap-4 sm:gap-6 items-center">
            <div className="md:col-span-4 p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--gold)] text-[#090D16] font-bold text-sm grid place-items-center" aria-hidden="true">
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

            <div className="md:col-span-1 flex flex-col items-center justify-center text-center py-2 md:py-0">
              <div className="w-10 h-10 rounded-full bg-[var(--teal-subtle)] border border-[var(--teal)]/40 text-[var(--teal-text)] grid place-items-center" aria-hidden="true">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-[13px] font-mono font-semibold text-[var(--teal-text)] mt-1.5">91% Match</span>
            </div>

            <div className="md:col-span-4 p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--teal)] text-[#090D16] font-bold text-sm grid place-items-center" aria-hidden="true">
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

          <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0" aria-hidden="true" />
              <span className="text-[var(--fg)]">
                <strong>Suggested project:</strong> Build a mobile community portal together.
              </span>
            </div>
            <span className="text-xs font-semibold text-[var(--gold-text)] shrink-0">1-tap WhatsApp connect</span>
          </div>
        </div>
      </section>

      {/* Recognition */}
      <section id="story" aria-labelledby="recognition-title" className="scroll-mt-24">
        <div id="hackathon" className="scroll-mt-24" />
        <div id="awards" className="scroll-mt-24" />
        <div className="grid grid-cols-1 lg:grid-cols-2 rounded-3xl overflow-hidden border border-[var(--card-border)] bg-[var(--card)]">
          <div className="relative aspect-[16/10] lg:aspect-auto lg:min-h-[360px] bg-[var(--bg-subtle)]">
            <img
              src={photos.team}
              srcSet={hackDaySrcSet(photos.team)}
              sizes="(min-width: 1024px) 576px, 100vw"
              alt="Kwegatta team members working on code and design at Hack Day Kampala"
              loading="lazy"
              decoding="async"
              width={800}
              height={500}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div className="p-6 sm:p-10 space-y-4 flex flex-col justify-center">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--gold-text)]">
              <Trophy className="w-4 h-4" aria-hidden="true" />
              Recognition
            </span>
            <h2 id="recognition-title" className="text-2xl sm:text-3xl font-display font-bold text-[var(--fg)] tracking-tight">
              1st place at Hacktoberfest 2026 Hack Day Kampala × MUBS
            </h2>
            <p className="text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed">
              Kwegatta entered the Best Open-Source AI Project challenge at Makerere University Business School and was awarded 1st place. Sixty-seven people took part and eight projects were built.
            </p>
            <p className="text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed">
              The team was forwarded to the MUBS Entrepreneurship, Innovation and Incubation Centre for its incubator.
            </p>
          </div>
        </div>
      </section>

      {/* Privacy and open source */}
      <section id="privacy" aria-labelledby="privacy-title" className="space-y-8 scroll-mt-24">
        <div className="space-y-2 max-w-2xl">
          <Eyebrow>Privacy &amp; open source</Eyebrow>
          <h2 id="privacy-title" className="text-2xl sm:text-4xl font-display font-bold text-[var(--fg)] tracking-tight">
            Your data stays yours
          </h2>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {PRIVACY_POINTS.map(point => {
            const Icon = point.icon;
            return (
              <li key={point.title} className="p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] space-y-2">
                <Icon className="w-5 h-5 text-[var(--teal-text)]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-[var(--fg)]">{point.title}</h3>
                <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{point.body}</p>
              </li>
            );
          })}
        </ul>

        <div id="license" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] scroll-mt-24">
          <p className="text-sm text-[var(--fg-muted)]">
            Kwegatta is free, open-source software under the MIT licence.{' '}
            <a
              href="https://github.com/Saifuddin2Ahmed/kwegatta/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--teal-text)] font-medium underline underline-offset-2 hover:no-underline inline-flex items-center gap-1"
            >
              Read the licence
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </p>
          <a
            href="https://github.com/Saifuddin2Ahmed/kwegatta"
            target="_blank"
            rel="noopener noreferrer"
            className="kw-btn kw-btn-gold text-xs py-2 px-4 inline-flex items-center gap-2 font-semibold shrink-0 self-start sm:self-auto"
          >
            <Github className="w-4 h-4" />
            <span>Contribute on GitHub</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
          </a>
        </div>

        <details id="engine" className="group rounded-2xl border border-[var(--card-border)] bg-[var(--card)] scroll-mt-24">
          <summary className="flex items-center justify-between gap-3 cursor-pointer list-none p-5 sm:p-6 text-sm font-semibold text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] rounded-2xl">
            Technical details
            <ChevronDown className="w-4 h-4 text-[var(--fg-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-5 sm:px-6 pb-6 space-y-4 text-sm text-[var(--fg-muted)] leading-relaxed">
            <p>
              Kwegatta uses only open-weight models from Google DeepMind. <strong className="text-[var(--fg)]">gemma-4-26b-a4b-it</strong> is the default model for profile summaries and matching, and <strong className="text-[var(--fg)]">gemma-4-31b-it</strong> is the larger alternative. Closed proprietary APIs are not used, so the system stays auditable with no vendor lock-in.
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs">
              <div className="flex gap-2"><dt className="text-[var(--fg-subtle)]">Default:</dt><dd className="text-[var(--fg)]">gemma-4-26b-a4b-it</dd></div>
              <div className="flex gap-2"><dt className="text-[var(--fg-subtle)]">Alternative:</dt><dd className="text-[var(--fg)]">gemma-4-31b-it</dd></div>
              <div className="flex gap-2"><dt className="text-[var(--fg-subtle)]">Model licence:</dt><dd className="text-[var(--fg)]">Apache 2.0</dd></div>
              <div className="flex gap-2"><dt className="text-[var(--fg-subtle)]">Execution:</dt><dd className="text-[var(--fg)]">Server-side proxy</dd></div>
            </dl>
            <a
              href="https://ai.google.dev/gemma/docs/core"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal-text)] underline underline-offset-2 hover:no-underline"
            >
              Gemma terms
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
        </details>
      </section>
    </div>
  );
};
