import React, { useState, useEffect } from 'react';
import { Sparkles, QrCode, Zap, ArrowLeft, RefreshCw, Users, MessageSquare } from 'lucide-react';
import { Profile, Post } from '../types';
import { db, APP_NAME } from '../services/api';
import { generateQrCodeDataUrl } from '../utils';
import { Avatar } from './Avatar';
import { BrandLogo } from './BrandLogo';

interface WallViewProps {
  onBack: () => void;
}

export const WallView: React.FC<WallViewProps> = ({ onBack }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchWallData = async () => {
    setIsRefreshing(true);
    try {
      const [ps, ms, pos] = await Promise.all([
        db.list<Profile>('profiles', { limit: 500 }),
        db.list<any>('matches', { limit: 30 }),
        db.list<Post>('posts', { limit: 200 })
      ]);
      setProfiles(ps);
      setMatches(ms);
      setPosts(pos);
    } catch (e) {
      console.error('Error fetching wall data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const joinUrl = window.location.origin + window.location.pathname;
    generateQrCodeDataUrl(joinUrl, 280).then(setQrCodeUrl);
    fetchWallData();

    // Auto-refresh periodically for projector
    const interval = setInterval(fetchWallData, 12000);
    return () => clearInterval(interval);
  }, []);

  // Compute trending tags
  const tagCounts: Record<string, number> = {};
  profiles.forEach(p => {
    (p.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] p-4 sm:p-8 flex flex-col justify-between transition-colors">
      
      {/* Top Bar with back button */}
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between pb-6 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="kw-btn kw-btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"
            title="Return to app"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to app</span>
          </button>
          
          <div className="flex items-center gap-3">
            <BrandLogo size="md" showText={true} />
            <span className="text-[var(--fg-muted)] font-normal text-sm hidden sm:inline">
              | Hack Day Kampala x MUBS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--teal-subtle)] border border-[var(--teal)]/30 text-[var(--teal)] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[var(--teal)] animate-pulse" />
            Live Room Projector
          </span>
          <button
            onClick={fetchWallData}
            disabled={isRefreshing}
            className="kw-btn kw-btn-ghost text-xs p-2"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Stats and Columns */}
      <div className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 py-8 flex-1">
        
        {/* Left 2 Columns: Big Metrics and Match Ticker */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Big Statistics Counter */}
          <div className="grid grid-cols-3 gap-4">
            <div className="kw-card p-6 bg-[var(--card)] text-center sm:text-left space-y-1">
              <div className="text-4xl sm:text-5xl font-extrabold text-[var(--gold)] tabular-nums tracking-tight">
                {profiles.length}
              </div>
              <div className="text-xs sm:text-sm text-[var(--fg-muted)] font-medium">
                Builders & Students Joined
              </div>
            </div>

            <div className="kw-card p-6 bg-[var(--card)] text-center sm:text-left space-y-1">
              <div className="text-4xl sm:text-5xl font-extrabold text-[var(--teal)] tabular-nums tracking-tight">
                {matches.length}
              </div>
              <div className="text-xs sm:text-sm text-[var(--fg-muted)] font-medium">
                AI Complementary Pairs
              </div>
            </div>

            <div className="kw-card p-6 bg-[var(--card)] text-center sm:text-left space-y-1">
              <div className="text-4xl sm:text-5xl font-extrabold text-purple-400 tabular-nums tracking-tight">
                {posts.length}
              </div>
              <div className="text-xs sm:text-sm text-[var(--fg-muted)] font-medium">
                Project Asks & Offers
              </div>
            </div>
          </div>

          {/* Latest Matches Stream */}
          <div className="kw-card p-6 bg-[var(--card)] space-y-4">
            <h3 className="font-bold text-base flex items-center gap-2 text-[var(--fg)]">
              <Zap className="w-4 h-4 text-[var(--gold)]" />
              <span>Latest Room Matches</span>
            </h3>

            {matches.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)] py-6 text-center">
                Matches are synthesized live by Gemma 4 as participants join...
              </p>
            ) : (
              <div className="divide-y divide-[var(--card-border)]">
                {matches.slice(0, 6).map(m => {
                  const a = profiles.find(p => p.id === m.a_id);
                  const b = profiles.find(p => p.id === m.b_id);
                  if (!a || !b) return null;

                  return (
                    <div key={m.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar profile={a} className="w-8 h-8" />
                        <strong className="text-sm font-semibold truncate text-[var(--fg)]">{a.name.split(' ')[0]}</strong>
                        <span className="text-xs text-[var(--fg-muted)]">with</span>
                        <Avatar profile={b} className="w-8 h-8" />
                        <strong className="text-sm font-semibold truncate text-[var(--fg)]">{b.name.split(' ')[0]}</strong>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="hidden md:inline text-xs text-[var(--fg-muted)] max-w-xs truncate">
                          {m.spark || m.reason}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[var(--gold-subtle)] border border-[var(--gold)]/30 text-[var(--gold)] font-bold text-xs tabular-nums">
                          {m.score}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Scan to Join QR & Trending tags */}
        <div className="space-y-6">
          <div className="kw-card p-8 bg-[var(--card)] text-center space-y-4 flex flex-col items-center justify-center">
            <h3 className="font-bold text-lg text-[var(--fg)]">
              Scan to Join in 60 Seconds
            </h3>

            {qrCodeUrl ? (
              <div className="p-4 bg-white rounded-2xl shadow-xl inline-block">
                <img src={qrCodeUrl} alt="Join QR Code" className="w-56 h-56 mx-auto" />
              </div>
            ) : (
              <div className="w-56 h-56 bg-[var(--bg-subtle)] rounded-2xl animate-pulse" />
            )}

            <p className="text-xs font-mono text-[var(--fg-subtle)] break-all max-w-xs">
              {window.location.origin + window.location.pathname}
            </p>
            <p className="text-xs text-[var(--fg-muted)] max-w-xs">
              Open your phone camera, scan the code, and tell Gemma 4 what you need and offer.
            </p>
          </div>

          {/* Trending In Room Today */}
          {topTags.length > 0 && (
            <div className="kw-card p-5 bg-[var(--card)] space-y-3">
              <h4 className="text-xs font-bold text-[var(--fg-muted)] uppercase tracking-wider">
                Trending In Room Today
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {topTags.map(([tag, count]) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] font-medium py-1 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] text-[var(--fg)]"
                  >
                    <span>#{tag}</span>
                    <span className="text-[var(--fg-subtle)] text-[10px]">({count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Clean Footer Bar */}
      <div className="max-w-7xl w-full mx-auto pt-6 border-t border-[var(--card-border)] flex items-center justify-between text-xs text-[var(--fg-subtle)]">
        <span>Powered by Gemma 4 (open-weight, Apache 2.0)</span>
        <span>Hacktoberfest 2026 — Makerere University Business School</span>
      </div>
    </div>
  );
};
