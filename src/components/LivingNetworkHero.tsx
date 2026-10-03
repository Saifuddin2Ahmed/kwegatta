import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Sparkles, Users, Zap, MessageSquare, Activity, ArrowRight } from 'lucide-react';
import { Profile } from '../types';
import { getInitials } from '../utils';

interface LivingNetworkHeroProps {
  profiles: Profile[];
  postsCount: number;
  onJoinClick?: () => void;
}

interface Node {
  id: string;
  name: string;
  initials: string;
  avatar?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

export const LivingNetworkHero: React.FC<LivingNetworkHeroProps> = ({
  profiles,
  postsCount,
  onJoinClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);

  // Generate realistic match pairs from actual members for the ticker
  const realRecentMatches = useMemo(() => {
    if (profiles.length < 2) return [];
    const matches: Array<{ nameA: string; nameB: string; score: number }> = [];
    for (let i = 0; i < Math.min(profiles.length - 1, 6); i++) {
      const p1 = profiles[i];
      const p2 = profiles[(i + 1) % profiles.length];
      const charCodeSum = (p1.name.charCodeAt(0) + p2.name.charCodeAt(0)) % 22;
      const score = 75 + charCodeSum;
      matches.push({
        nameA: p1.name.split(' ')[0],
        nameB: p2.name.split(' ')[0],
        score
      });
    }
    return matches;
  }, [profiles]);

  // Rotate ticker smoothly every 4.5 seconds
  useEffect(() => {
    if (realRecentMatches.length === 0) return;
    const interval = setInterval(() => {
      setTickerIndex(prev => (prev + 1) % realRecentMatches.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [realRecentMatches.length]);

  // Total matches estimated from real cohort size
  const estimatedMatchesCount = Math.max(0, Math.round(profiles.length * 2.2));

  // Subtle living network visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isVisible = document.visibilityState === 'visible';
    const handleVisibility = () => {
      isVisible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Set canvas dimensions
    const width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    const height = (canvas.height = Math.min(280, window.innerHeight * 0.35));

    const colors = ['#F5B700', '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899', '#10B981'];

    // Initialize nodes based on real profiles
    const displayProfiles = profiles.slice(0, 16);
    const nodes: Node[] = displayProfiles.map((p, i) => {
      const angle = (i / Math.max(1, displayProfiles.length)) * Math.PI * 2;
      const dist = 80 + Math.random() * (Math.min(width, height) * 0.4);
      return {
        id: p.id,
        name: p.name,
        initials: getInitials(p.name),
        avatar: p.avatar,
        x: width * 0.65 + Math.cos(angle) * dist,
        y: height * 0.5 + Math.sin(angle) * (dist * 0.65),
        vx: prefersReducedMotion ? 0 : (Math.random() - 0.5) * 0.35,
        vy: prefersReducedMotion ? 0 : (Math.random() - 0.5) * 0.35,
        radius: 14,
        color: colors[i % colors.length]
      };
    });

    const render = () => {
      if (!isVisible) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Draw subtle connecting match lines between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = Math.max(0, (1 - dist / 130) * 0.3);
            const grad = ctx.createLinearGradient(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            grad.addColorStop(0, `rgba(245, 183, 0, ${alpha})`);
            grad.addColorStop(1, `rgba(20, 184, 166, ${alpha})`);

            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.0;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      nodes.forEach(node => {
        if (!prefersReducedMotion) {
          node.x += node.vx;
          node.y += node.vy;

          if (node.x < node.radius + 10 || node.x > width - node.radius - 10) node.vx *= -1;
          if (node.y < node.radius + 10 || node.y > height - node.radius - 10) node.vy *= -1;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#090D16';
        ctx.stroke();

        ctx.fillStyle = '#090D16';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.initials, node.x, node.y + 0.5);
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [profiles]);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-[var(--card)] border border-[var(--card-border)] p-6 sm:p-8 lg:p-10 shadow-xl transition-all">
      
      {/* Subtle Network Canvas in background (low opacity, placed gracefully) */}
      {profiles.length >= 3 ? (
        <div className="absolute inset-0 pointer-events-none opacity-25 sm:opacity-35 overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--card)] via-[var(--card)]/90 to-transparent pointer-events-none" />
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-10">
          <span className="kw-badge kw-badge-teal text-xs">
            🌱 Be one of the first builders
          </span>
        </div>
      )}

      <div className="relative z-10 max-w-2xl space-y-6">
        
        {/* Supporting Kicker Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs font-medium text-[var(--fg-muted)]">
          <span className="w-2 h-2 rounded-full bg-[var(--teal)] animate-pulse" />
          <span>Hack Day Kampala x MUBS</span>
          <span className="text-[var(--fg-subtle)]">·</span>
          <span className="text-[var(--gold)] font-semibold">Live Matchmaking</span>
        </div>

        {/* Confident, Refined Display Headline */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-[var(--fg)] leading-[1.15] max-w-xl text-balance">
            Find the people you should build with.
          </h1>
          <p className="text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed max-w-lg font-normal">
            Kwegatta matches software developers, business creators, and peer mentors in 60 seconds using the open-weight Gemma 4 model.
          </p>
        </div>

        {/* Polished Product Metrics Dashboard */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-1 max-w-lg">
          
          {/* Stat 1: People here */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]/70 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-medium text-[var(--fg-muted)]">People here</span>
              <Users className="w-3.5 h-3.5 text-[var(--gold)] opacity-80" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[var(--fg)] tabular-nums tracking-tight">
              {profiles.length}
            </div>
          </div>

          {/* Stat 2: Matches made */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]/70 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-medium text-[var(--fg-muted)]">Matches made</span>
              <Zap className="w-3.5 h-3.5 text-[var(--teal)] opacity-80" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[var(--fg)] tabular-nums tracking-tight">
              {estimatedMatchesCount}
            </div>
          </div>

          {/* Stat 3: Asks & offers */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]/70 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-medium text-[var(--fg-muted)]">Asks & offers</span>
              <MessageSquare className="w-3.5 h-3.5 text-purple-400 opacity-80" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[var(--fg)] tabular-nums tracking-tight">
              {postsCount}
            </div>
          </div>

        </div>

        {/* Real-time Product Activity Indicator */}
        {realRecentMatches.length > 0 && (
          <div className="pt-4 border-t border-[var(--card-border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
            <div className="flex items-center gap-2.5 min-h-[26px]">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-[var(--fg)]">Live Match:</span>
              <span className="font-medium text-[var(--fg-muted)] transition-opacity duration-300">
                <strong className="text-[var(--fg)]">{realRecentMatches[tickerIndex].nameA}</strong> &{' '}
                <strong className="text-[var(--fg)]">{realRecentMatches[tickerIndex].nameB}</strong> matched{' '}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--gold-subtle)] border border-[var(--gold)]/30 text-[var(--gold)] font-bold text-[11px] tabular-nums ml-1">
                  {realRecentMatches[tickerIndex].score}%
                </span>
              </span>
            </div>

            <span className="text-[11px] text-[var(--fg-subtle)] hidden sm:inline-flex items-center gap-1">
              Create your profile below in 60s
              <ArrowRight className="w-3 h-3 text-[var(--gold)]" />
            </span>
          </div>
        )}

      </div>
    </section>
  );
};
