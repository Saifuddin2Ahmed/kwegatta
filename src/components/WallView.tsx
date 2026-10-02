import React, { useState, useEffect } from 'react';
import { Sparkles, QrCode, Zap, ArrowLeft, RefreshCw } from 'lucide-react';
import { Profile, Post } from '../types';
import { db, APP_NAME } from '../services/api';
import { generateQrCodeDataUrl } from '../utils';
import { Avatar } from './Avatar';

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
    generateQrCodeDataUrl(joinUrl, 260).then(setQrCodeUrl);
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
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] p-4 sm:p-8 flex flex-col justify-between">
      {/* Top Bar with back button */}
      <div className="flex items-center justify-between pb-6 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="primer-btn text-xs py-1.5 px-3"
            title="Return to app"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to app</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--fg)] text-[var(--header)] grid place-items-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {APP_NAME} <span className="text-[var(--muted)] font-normal text-base hidden sm:inline">| Hack Day Kampala x MUBS</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="primer-label primer-label-green text-xs font-semibold px-2.5 py-1">
            Live Room Projector
          </span>
          <button
            onClick={fetchWallData}
            disabled={isRefreshing}
            className="primer-btn text-xs py-1 px-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Stats and Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-8 flex-1">
        {/* Left 2 Columns: Big Metrics and Match Ticker */}
        <div className="lg:col-span-2 space-y-6">
          {/* Big Statistics Counter */}
          <div className="grid grid-cols-3 gap-4">
            <div className="primer-box p-5 bg-[var(--subtle)] text-center sm:text-left">
              <div className="text-4xl sm:text-5xl font-extrabold text-[var(--accent)] font-mono">
                {profiles.length}
              </div>
              <div className="text-xs sm:text-sm text-[var(--muted)] font-medium mt-1">
                Builders & Students Joined
              </div>
            </div>

            <div className="primer-box p-5 bg-[var(--subtle)] text-center sm:text-left">
              <div className="text-4xl sm:text-5xl font-extrabold text-[var(--success)] font-mono">
                {matches.length}
              </div>
              <div className="text-xs sm:text-sm text-[var(--muted)] font-medium mt-1">
                AI Complementary Pairs
              </div>
            </div>

            <div className="primer-box p-5 bg-[var(--subtle)] text-center sm:text-left">
              <div className="text-4xl sm:text-5xl font-extrabold text-[var(--done)] font-mono">
                {posts.length}
              </div>
              <div className="text-xs sm:text-sm text-[var(--muted)] font-medium mt-1">
                Project Asks & Offers
              </div>
            </div>
          </div>

          {/* Latest Matches Stream */}
          <div className="primer-box p-5 bg-[var(--subtle)] space-y-3">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--attention)]" />
              <span>Latest Room Matches</span>
            </h3>

            {matches.length === 0 ? (
              <p className="text-sm text-[var(--muted)] py-4">
                Matches are synthesized live by Gemma 4 as participants join...
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-muted)]">
                {matches.slice(0, 6).map(m => {
                  const a = profiles.find(p => p.id === m.a_id);
                  const b = profiles.find(p => p.id === m.b_id);
                  if (!a || !b) return null;

                  return (
                    <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar profile={a} className="w-8 h-8" />
                        <strong className="text-sm font-semibold truncate">{a.name.split(' ')[0]}</strong>
                        <span className="text-xs text-[var(--muted)]">with</span>
                        <Avatar profile={b} className="w-8 h-8" />
                        <strong className="text-sm font-semibold truncate">{b.name.split(' ')[0]}</strong>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="hidden md:inline text-xs text-[var(--muted)] max-w-xs truncate">
                          {m.spark || m.reason}
                        </span>
                        <span className="primer-label primer-label-green text-xs font-semibold px-2 py-0.5">
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

        {/* Right Column: Giant Scan-to-Join QR Code & Trending Tags */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="primer-box p-6 bg-[var(--subtle)] text-center space-y-4 shadow-lg border-2 border-[var(--accent)]">
            <h2 className="text-lg font-bold">Scan to Join in 60 Seconds</h2>
            {qrCodeUrl ? (
              <div className="bg-white p-3 rounded-lg inline-block shadow-md">
                <img src={qrCodeUrl} alt="Join QR Code" className="w-48 h-48 sm:w-56 sm:h-56 mx-auto" />
              </div>
            ) : (
              <div className="w-48 h-48 mx-auto bg-gray-200 animate-pulse rounded" />
            )}
            <p className="text-xs text-[var(--muted)] font-mono break-all">
              {window.location.origin}
            </p>
            <p className="text-xs text-[var(--fg)] font-medium">
              Open your phone camera, scan and say what you need and offer.
            </p>
          </div>

          {/* Trending Tags Cloud */}
          <div className="primer-box p-5 bg-[var(--subtle)] space-y-3">
            <h3 className="font-semibold text-xs text-[var(--muted)] uppercase tracking-wider">
              Trending In Room Today
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {topTags.map(([tag, count]) => (
                <span key={tag} className="primer-tag text-xs py-1 px-2.5">
                  #{tag} <strong className="ml-1 opacity-70">({count})</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted)]">
        <div>Powered by Gemma 4 (open-weight, Apache 2.0)</div>
        <div>Hacktoberfest 2026 — Makerere University Business School</div>
      </footer>
    </div>
  );
};
