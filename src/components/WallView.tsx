import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Profile, Post } from '../types';
import { db, PUBLIC_APP_URL } from '../services/api';
import { generateQrCodeDataUrl, MIN_MEMBERS_FOR_STATS } from '../utils';
import { Avatar } from './Avatar';
import { BrandLogo } from './BrandLogo';

const INITIAL_COLORS = [
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'bg-sky-500/20 text-sky-300 border-sky-500/30',
];

function renderInitialBadge(name: string, seed: number) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  const charCode = (name || '').charCodeAt(0) || seed;
  const color = INITIAL_COLORS[(charCode + seed) % INITIAL_COLORS.length];
  return (
    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-lg sm:text-xl border ${color} flex-shrink-0 select-none shadow-sm`}>
      {initial}
    </div>
  );
}

interface WallViewProps {
  onBack: () => void;
}

export const WallView: React.FC<WallViewProps> = ({ onBack }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [totalMatchesCount, setTotalMatchesCount] = useState<number>(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchWallData = async () => {
    setIsRefreshing(true);
    try {
      const [ps, wallFeedRes, pos] = await Promise.all([
        db.list<Profile>('profiles', { limit: 500 }),
        fetch('/api/wall/feed')
          .then(r => r.ok ? r.json() : { matches: [], count: 0 })
          .catch(() => ({ matches: [], count: 0 })),
        db.list<Post>('posts', { limit: 200 })
      ]);
      setProfiles(ps || []);
      setMatches(wallFeedRes.matches || []);
      setTotalMatchesCount(wallFeedRes.count ?? wallFeedRes.total_matches ?? (wallFeedRes.matches?.length || 0));
      setPosts(pos || []);
    } catch (e) {
      console.error('Error fetching wall data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Generate QR code using strictly PUBLIC_APP_URL
    generateQrCodeDataUrl(PUBLIC_APP_URL, 360).then(setQrCodeUrl);
    fetchWallData();

    // Auto-refresh periodically for projector
    const interval = setInterval(fetchWallData, 10000);
    return () => clearInterval(interval);
  }, []);

  const hasMembers = profiles.length > 0;

  return (
    <div data-theme="dark" className="min-h-screen bg-[#070B12] text-[#F8FAFC] p-4 sm:p-8 lg:p-10 flex flex-col justify-between transition-colors">
      
      {/* Top Projector Header Bar */}
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4 pb-6 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="kw-btn kw-btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 active:scale-95"
            title="Return to application"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to app</span>
          </button>
          
          <BrandLogo size="md" showText={true} />
        </div>

        <button
          onClick={fetchWallData}
          disabled={isRefreshing}
          className="kw-btn kw-btn-ghost text-xs p-2 rounded-lg"
          title="Refresh data"
          aria-label="Refresh wall data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Content Area */}
      {!hasMembers ? (
        /* Empty state: Large Centered QR Code */
        <div className="flex-1 flex flex-col items-center justify-center py-12 sm:py-20 text-center space-y-6 max-w-xl mx-auto">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl font-display font-bold text-[var(--fg)] tracking-tight">
              Scan to join. Be the first.
            </h1>
            <p className="text-base sm:text-xl text-[var(--fg-muted)] font-mono">
              {PUBLIC_APP_URL}
            </p>
          </div>

          {qrCodeUrl ? (
            <div className="p-4 bg-white rounded-3xl shadow-2xl inline-block">
              <img
                src={qrCodeUrl}
                alt="Scan to join Kwegatta"
                className="w-64 h-64 sm:w-80 sm:h-80 mx-auto rounded-xl"
              />
            </div>
          ) : (
            <div className="w-64 h-64 sm:w-80 sm:h-80 bg-[var(--card)] rounded-3xl animate-pulse" />
          )}

          <p className="text-sm text-[var(--fg-muted)] max-w-md">
            Open your phone camera to create your profile in about 2 minutes.
          </p>
        </div>
      ) : (
        /* Populated state: Counters + Full-Height Match List + Large Text (>= 20px) */
        <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col py-6 sm:py-8 space-y-8">
          
          {/* Three Counters (hidden when network has fewer than 25 members) */}
          {profiles.length >= MIN_MEMBERS_FOR_STATS && (
            <div className="grid grid-cols-3 gap-4 sm:gap-8 pb-6 border-b border-[var(--card-border)]">
              <div className="space-y-1">
                <div className="text-4xl sm:text-6xl font-bold text-[var(--fg)] tabular-nums tracking-tight">
                  {profiles.length}
                </div>
                <div className="text-sm sm:text-base text-[var(--fg-muted)] font-medium">
                  People here
                </div>
              </div>

              <div className="space-y-1 border-l border-[var(--card-border)] pl-4 sm:pl-8">
                <div className="text-4xl sm:text-6xl font-bold text-[var(--gold)] tabular-nums tracking-tight">
                  {totalMatchesCount || matches.length}
                </div>
                <div className="text-sm sm:text-base text-[var(--fg-muted)] font-medium">
                  Matches made
                </div>
              </div>

              <div className="space-y-1 border-l border-[var(--card-border)] pl-4 sm:pl-8">
                <div className="text-4xl sm:text-6xl font-bold text-[var(--teal)] tabular-nums tracking-tight">
                  {posts.length}
                </div>
                <div className="text-sm sm:text-base text-[var(--fg-muted)] font-medium">
                  Asks and offers
                </div>
              </div>
            </div>
          )}

          {/* Main Display Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
            
            {/* Left: Latest Matches List (Text >= 20px) */}
            <div className="lg:col-span-8 space-y-6">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-[var(--fg)] tracking-tight">
                Latest matches
              </h2>

              {matches.length === 0 ? (
                <div className="py-12 text-center text-lg text-[var(--fg-muted)] border border-dashed border-[var(--card-border)] rounded-2xl">
                  Matches appear as people join...
                </div>
              ) : (
                <div className="divide-y divide-[var(--card-border)]">
                  {matches.slice(0, 8).map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="py-4 sm:py-5 flex items-start justify-between gap-4"
                    >
                      {/* Member A + Member B (First names and initials badges only) */}
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          {renderInitialBadge(m.first_name_a, 0)}
                          <span className="text-xl sm:text-2xl font-bold text-[var(--fg)] truncate">
                            {m.first_name_a}
                          </span>
                          <span className="text-lg sm:text-xl text-[var(--fg-subtle)] font-mono px-1">
                            &amp;
                          </span>
                          {renderInitialBadge(m.first_name_b, 1)}
                          <span className="text-xl sm:text-2xl font-bold text-[var(--fg)] truncate">
                            {m.first_name_b}
                          </span>
                        </div>
                        {m.spark && (
                          <p className="text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed max-w-2xl pl-1">
                            {m.spark}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Scan to join QR Code */}
            <div className="lg:col-span-4 p-6 sm:p-8 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] flex flex-col items-center justify-center text-center space-y-4">
              <h3 className="text-xl sm:text-2xl font-display font-bold text-[var(--fg)]">
                Scan to join
              </h3>

              {qrCodeUrl ? (
                <div className="p-3 bg-white rounded-2xl shadow-md inline-block">
                  <img
                    src={qrCodeUrl}
                    alt="Scan to join"
                    className="w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 sm:w-56 sm:h-56 bg-[var(--card)] rounded-2xl animate-pulse" />
              )}

              <p className="text-xs sm:text-sm font-mono text-[var(--fg-muted)]">
                {PUBLIC_APP_URL}
              </p>
            </div>

          </div>

        </div>
      )}

      {/* Footer */}
      <div className="max-w-7xl w-full mx-auto pt-6 border-t border-[var(--card-border)] flex items-center justify-between text-xs text-[var(--fg-subtle)]">
        <span>Powered by Gemma 4 (open-weight)</span>
        <span>{PUBLIC_APP_URL}</span>
      </div>

    </div>
  );
};
