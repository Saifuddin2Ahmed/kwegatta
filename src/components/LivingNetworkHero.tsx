import React, { useEffect, useRef } from 'react';
import {
  Trophy,
  Users,
  Zap,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Github,
  ExternalLink
} from 'lucide-react';
import { Profile } from '../types';
import { getInitials } from '../utils';
import { useEventPhotos } from '../hooks/useEventPhotos';

export interface HeroProps {
  profiles: Profile[];
  matchesCount?: number;
  postsCount: number;
  onJoinClick?: () => void;
}

export interface KampalaStoryProps {
  onNavigate?: (tab: string) => void;
}

const TEAM_MEMBERS = [
  {
    name: 'Abubaker Mohamed Adam',
    affiliation: 'Sub-Saharan College',
    background: 'NGO volunteer',
    role: 'Community and NGO partnerships',
    github: 'abubakermohammed092077-bit'
  },
  {
    name: 'Adinan Juuko',
    affiliation: 'Victoria University',
    background: 'Software Engineering',
    role: 'Testing and quality',
    github: 'Aditech-191'
  },
  {
    name: 'Amme Patience Esther',
    affiliation: 'Makerere University Business School',
    background: 'Bachelor of Marketing',
    role: 'Marketing and communications',
    github: null
  },
  {
    name: 'Mupole Uwizeye Alexis',
    affiliation: 'Bugema University',
    background: 'Business Computing',
    role: 'Product and data',
    github: 'Alexis-Mupole'
  },
  {
    name: 'Nabagulanyi Prossy Sherry',
    affiliation: 'Makerere University Business School',
    background: 'Student',
    role: 'User research and outreach',
    github: null
  },
  {
    name: 'Ojambo Emmanuel',
    affiliation: 'Makerere University Business School',
    background: 'Accounting',
    role: 'Business model and sustainability',
    github: null
  },
  {
    name: 'Saifuddin Ahmed',
    affiliation: 'Future Stars Center for Development and Capacity Building (refugee-led NGO)',
    background: 'Engineer',
    role: 'Team lead and engineering',
    github: 'Saifuddin2Ahmed'
  }
];

export const HeroSection: React.FC<HeroProps> = ({
  profiles,
  matchesCount = 0,
  postsCount,
  onJoinClick
}) => {
  const photos = useEventPhotos();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const width = (canvas.width = canvas.offsetWidth);
    const height = (canvas.height = canvas.offsetHeight);

    const dots = Array.from({ length: 24 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1.5
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      ctx.strokeStyle = 'rgba(245, 183, 0, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      ctx.fillStyle = 'rgba(245, 183, 0, 0.35)';
      for (const dot of dots) {
        dot.x += dot.vx;
        dot.y += dot.vy;
        if (dot.x < 0 || dot.x > width) dot.vx *= -1;
        if (dot.y < 0 || dot.y > height) dot.vy *= -1;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const scrollToStory = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('story');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative overflow-hidden pt-2 pb-4">
      {/* Background Living Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
        aria-hidden="true"
      />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Award Line, Headline, Subhead, Button, Free Notice */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Single small award line above headline */}
          <div>
            <a
              href="#story"
              onClick={scrollToStory}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--gold)] hover:underline tracking-wide cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 flex-shrink-0" />
              <span>2nd place · Hacktoberfest 2026 Hack Day Kampala</span>
            </a>
          </div>

          {/* Headline & Subhead */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-[var(--fg)] leading-[1.08] text-balance">
              Find the people you should build and learn with.
            </h1>
            <p className="text-base sm:text-lg text-[var(--fg-muted)] leading-relaxed font-normal max-w-2xl text-balance">
              Say what you need and what you offer. In about a minute, Kwegatta matches you with people who complete you: co-founders, teammates, mentors and study partners.
            </p>
          </div>

          {/* Action Button & Free Notice */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={onJoinClick}
                className="kw-btn kw-btn-gold text-sm sm:text-base py-3 px-6 font-bold shadow-lg inline-flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Get matched in about 2 minutes</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 text-xs sm:text-sm text-[var(--fg-muted)]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Free and open source. Sign in with Google in one tap.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: One team photo with a one-line caption underneath (On phones goes under the button) */}
        <div className="lg:col-span-5">
          <figure className="space-y-2">
            <div className="rounded-2xl overflow-hidden border border-[var(--card-border)] bg-[var(--card)] aspect-[16/10] sm:aspect-[4/3] shadow-md">
              <img
                src={photos.hero}
                srcSet={`${photos.hero} 800w, ${photos.hero.replace('800.webp', '1600.webp')} 1600w`}
                sizes="(max-width: 1024px) 100vw, 42vw"
                alt="Kwegatta team building at Makerere University Business School"
                className="w-full h-full object-cover"
                width={800}
                height={533}
              />
            </div>
            <figcaption className="text-xs text-[var(--fg-muted)] text-center sm:text-left">
              Kwegatta team building at MUBS Entrepreneurship Centre, Kampala.
            </figcaption>
          </figure>
        </div>
      </div>

      {/* Requirement 4: STATS. Hide the three counters while they are zero. Show them as one compact row once the first member joins. */}
      {profiles.length > 0 && (
        <div className="relative z-10 flex flex-wrap items-center gap-6 pt-5 mt-4 text-xs text-[var(--fg-muted)] border-t border-[var(--card-border)]/60">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
            <span>
              <strong className="text-[var(--fg)] font-bold">{profiles.length}</strong>{' '}
              {profiles.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[var(--gold)]" />
            <span>
              <strong className="text-[var(--gold)] font-bold">{matchesCount}</strong> matches made
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              <strong className="text-emerald-400 font-bold">{postsCount}</strong> asks &amp; offers
            </span>
          </div>
        </div>
      )}
    </section>
  );
};

export const KampalaStorySection: React.FC<KampalaStoryProps> = () => {
  const photos = useEventPhotos();
  return (
    <section id="story" className="border-t border-[var(--card-border)] pt-12 sm:pt-16 space-y-12 sm:space-y-16">
      {/* Story Narrative & Two Other Photos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--gold)] tracking-wide">
            <Trophy className="w-3.5 h-3.5" />
            <span>2nd place · Hacktoberfest 2026 Hack Day Kampala</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-[var(--fg)] tracking-tight">
            Built in one day in Kampala
          </h2>

          <div className="space-y-4 text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed">
            <p>
              Hacktoberfest 2026 Hack Day Kampala x MUBS took place on Friday 2 October 2026 at Makerere University Business School, hosted by Web3 Club MUBS and GDG on Campus MUBS, powered by MLH and DEV.
            </p>
            <p>
              We entered the Best Open-Source AI Project challenge: build something real with an open-weight AI model. We built Kwegatta using strictly Gemma 4.
            </p>
            <p>
              Seven people from different universities and organisations met that morning, built Kwegatta by the afternoon, and was named one of the two winning teams (2nd place).
            </p>
          </div>
        </div>

        {/* The Two Other Photos with WebP srcset, lazy loading, and captions underneath */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <figure className="space-y-1.5">
            <div className="rounded-xl overflow-hidden border border-[var(--card-border)] bg-[var(--card)] aspect-[16/10] shadow-sm">
              <img
                src={photos.hall}
                srcSet={`${photos.hall} 800w, ${photos.hall.replace('800.webp', '1600.webp')} 1600w`}
                sizes="(max-width: 1024px) 100vw, 25vw"
                alt="Hack Day Kampala event room at MUBS"
                className="w-full h-full object-cover"
                loading="lazy"
                width={800}
                height={500}
              />
            </div>
            <figcaption className="text-[11px] text-[var(--fg-muted)]">
              EIIC Innovation Centre, Makerere University Business School.
            </figcaption>
          </figure>

          <figure className="space-y-1.5">
            <div className="rounded-xl overflow-hidden border border-[var(--card-border)] bg-[var(--card)] aspect-[16/10] shadow-sm">
              <img
                src={photos.team}
                srcSet={`${photos.team} 800w, ${photos.team.replace('800.webp', '1600.webp')} 1600w`}
                sizes="(max-width: 1024px) 100vw, 25vw"
                alt="Kwegatta team working on code and UI"
                className="w-full h-full object-cover"
                loading="lazy"
                width={800}
                height={500}
              />
            </div>
            <figcaption className="text-[11px] text-[var(--fg-muted)]">
              Collaborating on Kwegatta architecture and UI.
            </figcaption>
          </figure>
        </div>
      </div>

      {/* Row of Four Key Facts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--fg)] font-display tracking-tight">
            1 day
          </div>
          <p className="text-xs text-[var(--fg-muted)]">Time to build</p>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--gold)] font-display tracking-tight">
            7 people
          </div>
          <p className="text-xs text-[var(--fg-muted)]">Collaborating team</p>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--teal)] font-display tracking-tight">
            Gemma 4
          </div>
          <p className="text-xs text-[var(--fg-muted)]">Open-weight AI model</p>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--fg)] font-display tracking-tight">
            MIT licence
          </div>
          <p className="text-xs text-[var(--fg-muted)]">Free and open source</p>
        </div>
      </div>

      {/* Team Roster Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg sm:text-xl font-display font-bold text-[var(--fg)] tracking-tight">
            The team
          </h3>
          <span className="text-xs text-[var(--fg-subtle)]">
            Equal credit · Alphabetical order
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {TEAM_MEMBERS.map(member => (
            <div
              key={member.name}
              className="p-4 sm:p-5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] font-bold text-xs grid place-items-center flex-shrink-0">
                    {getInitials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[var(--fg)] truncate">
                      {member.name}
                    </h4>
                    <p className="text-xs text-[var(--teal)] font-medium truncate">
                      {member.role}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[var(--fg-muted)] line-clamp-2">
                  {member.affiliation}
                </p>
              </div>

              {member.github && (
                <div className="pt-2 border-t border-[var(--card-border)] flex items-center justify-between text-xs">
                  <a
                    href={`https://github.com/${member.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--fg-muted)] hover:text-[var(--gold)] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>@{member.github}</span>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* GitHub Repository Link */}
      <div className="pt-2">
        <a
          href="https://github.com/Saifuddin2Ahmed/kwegatta"
          target="_blank"
          rel="noopener noreferrer"
          className="kw-btn kw-btn-ghost text-xs sm:text-sm py-2.5 px-4 inline-flex items-center gap-2 active:scale-95"
        >
          <Github className="w-4 h-4" />
          <span>View the code on GitHub</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
      </div>
    </section>
  );
};

// Legacy compatibility export
export interface LivingNetworkHeroProps {
  profiles: Profile[];
  matches?: any[];
  postsCount: number;
  isDemoMode?: boolean;
  onJoinClick?: () => void;
  onNavigate?: (tab: string) => void;
  children?: React.ReactNode;
}

export const LivingNetworkHero: React.FC<LivingNetworkHeroProps> = ({
  profiles,
  matches,
  postsCount,
  onJoinClick,
  children
}) => {
  return (
    <div className="space-y-12 sm:space-y-16">
      <HeroSection
        profiles={profiles}
        matchesCount={matches?.length || 0}
        postsCount={postsCount}
        onJoinClick={onJoinClick}
      />
      {children}
      <KampalaStorySection />
    </div>
  );
};
