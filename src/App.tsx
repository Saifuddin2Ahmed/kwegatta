import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { NavTabs } from './components/NavTabs';
import { MatchesView } from './components/MatchesView';
import { LearnView } from './components/LearnView';
import { PeopleView } from './components/PeopleView';
import { FeedView } from './components/FeedView';
import { InboxView } from './components/InboxView';
import { ProfileView } from './components/ProfileView';
import { OnboardingChat } from './components/OnboardingChat';
import { WallView } from './components/WallView';
import { SetupView } from './components/SetupView';
import { AboutView } from './components/AboutView';
import { Profile, Post, NotificationItem, Follow } from './types';
import { db, APP_NAME, calculateHeuristicScore } from './services/api';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<string>('home');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize theme
  useEffect(() => {
    const savedTheme = (localStorage.getItem('kw_theme') as 'dark' | 'light') ||
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('kw_theme', next);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4500);
  };

  // Fetch central shared database
  const refreshData = useCallback(async () => {
    try {
      const [ps, pos] = await Promise.all([
        db.list<Profile>('profiles', { limit: 500 }),
        db.list<Post>('posts', { limit: 100 })
      ]);
      setAllProfiles(ps);
      setPosts(pos);

      const myId = localStorage.getItem('kw_me');
      if (myId) {
        const found = ps.find(p => p.id === myId);
        if (found) {
          setCurrentProfile(found);
          const [fls, notifs] = await Promise.all([
            db.list<Follow>('follows', { eq: { follower_id: myId }, limit: 500 }),
            db.list<NotificationItem>('notifications', { eq: { to_id: myId }, limit: 100 })
          ]);
          setFollows(fls);
          setNotifications(notifs);
        }
      }
    } catch (err) {
      console.error('Failed to sync data:', err);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 15000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Handle URL hash changes
  const handleHashChange = useCallback(() => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/');
    const main = parts[0] || 'home';
    const sub = parts[1];

    if (main === 'wall') {
      setActiveTab('wall');
    } else if (main === 'u' && sub) {
      setViewedProfileId(sub);
      setActiveTab('userProfile');
    } else if (['home', 'learn', 'people', 'feed', 'inbox', 'me', 'setup', 'onboard'].includes(main)) {
      setActiveTab(main);
      setViewedProfileId(null);
    } else {
      setActiveTab('home');
      setViewedProfileId(null);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

  const navigateTo = (tab: string) => {
    if (tab === 'home') window.location.hash = '#/home';
    else if (tab === 'learn') window.location.hash = '#/learn';
    else if (tab === 'people') window.location.hash = '#/people';
    else if (tab === 'feed') window.location.hash = '#/feed';
    else if (tab === 'inbox') window.location.hash = '#/inbox';
    else if (tab === 'me') window.location.hash = '#/me';
    else if (tab === 'wall') window.location.hash = '#/wall';
    else if (tab === 'setup') window.location.hash = '#/setup';
    else if (tab === 'onboard') window.location.hash = '#/onboard';
    else window.location.hash = `#/${tab}`;
  };

  const navigateToProfile = (profileId: string) => {
    window.location.hash = `#/u/${profileId}`;
  };

  // Follow / Unfollow
  const handleToggleFollow = async (targetId: string) => {
    if (!currentProfile) {
      showToast('Join Kwegatta to follow other builders');
      navigateTo('onboard');
      return;
    }

    const existing = follows.find(f => f.following_id === targetId);
    if (existing) {
      await db.remove('follows', existing.id);
      setFollows(prev => prev.filter(f => f.id !== existing.id));
      showToast('Unfollowed member');
    } else {
      const newFollow: Follow = {
        id: 'fl-' + Date.now(),
        follower_id: currentProfile.id,
        following_id: targetId,
        created_at: new Date().toISOString()
      };
      await db.insert('follows', newFollow);
      setFollows(prev => [...prev, newFollow]);

      // Notify target member
      await db.insert('notifications', {
        to_id: targetId,
        from_id: currentProfile.id,
        type: 'follow',
        body: `${currentProfile.name} started following your profile.`,
        read: false,
        created_at: new Date().toISOString()
      });

      showToast('Now following');
    }
  };

  const handleMarkAllRead = async () => {
    if (!currentProfile) return;
    const unread = notifications.filter(n => !n.read);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    for (const n of unread) {
      await db.update('notifications', n.id, { read: true });
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('kw_me');
    setCurrentProfile(null);
    setFollows([]);
    setNotifications([]);
    navigateTo('onboard');
    showToast('Signed out of this device');
  };

  // Periodic nudge: check if new people joined who fit my needs
  useEffect(() => {
    if (!currentProfile) return;

    const lastCheck = localStorage.getItem(`kw_last_nudge_${currentProfile.id}`);
    const now = new Date().toISOString();
    localStorage.setItem(`kw_last_nudge_${currentProfile.id}`, now);

    if (lastCheck) {
      const newlyJoined = allProfiles.filter(
        p => p.id !== currentProfile.id && p.created_at && p.created_at > lastCheck
      );
      const fitting = newlyJoined.filter(
        p => calculateHeuristicScore(currentProfile, p) >= 50
      );

      if (fitting.length > 0) {
        const text = `${fitting.length} new ${fitting.length === 1 ? 'person' : 'people'} joined who match what you need: ${fitting.slice(0, 3).map(p => p.name.split(' ')[0]).join(', ')}.`;
        db.insert('notifications', {
          to_id: currentProfile.id,
          type: 'digest',
          body: text,
          read: false,
          created_at: now
        }).then(() => {
          showToast(text);
          refreshData();
        });
      }
    }
  }, [allProfiles.length, currentProfile?.id]);

  const followingIds = new Set(follows.map(f => f.following_id));
  const followerIds = new Set(
    follows.filter(f => f.following_id === currentProfile?.id).map(f => f.follower_id)
  );
  const unreadCount = notifications.filter(n => !n.read).length;

  // Dedicated Projector Wall View
  if (activeTab === 'wall') {
    return <WallView onBack={() => navigateTo('home')} />;
  }

  // Profile to display in ProfileView
  const displayedProfile =
    activeTab === 'me'
      ? currentProfile
      : activeTab === 'userProfile' && viewedProfileId
      ? allProfiles.find(p => p.id === viewedProfileId) || null
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]">
      {/* Header */}
      <Header
        currentProfile={currentProfile}
        unreadCount={unreadCount}
        theme={theme}
        onToggleTheme={toggleTheme}
        searchQuery={searchQuery}
        onSearchChange={q => {
          setSearchQuery(q);
          if (activeTab !== 'people') navigateTo('people');
        }}
        onNavigate={navigateTo}
      />

      {/* Navigation tabs */}
      <NavTabs
        activeTab={activeTab === 'userProfile' ? '' : activeTab}
        unreadCount={unreadCount}
        onTabChange={navigateTo}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm p-3 rounded-md bg-[var(--subtle)] border border-[var(--border)] shadow-xl text-xs text-[var(--fg)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[var(--muted)] hover:text-[var(--fg)] text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        {/* Onboarding View */}
        {(!currentProfile && activeTab !== 'userProfile') || activeTab === 'onboard' ? (
          <OnboardingChat
            onCompleted={newProfile => {
              setCurrentProfile(newProfile);
              setAllProfiles(prev => [newProfile, ...prev]);
              navigateTo('home');
              showToast(`Welcome ${newProfile.name.split(' ')[0]}! Your matches are ready.`);
            }}
          />
        ) : activeTab === 'home' ? (
          <MatchesView
            currentProfile={currentProfile!}
            allProfiles={allProfiles}
            followingIds={followingIds}
            onToggleFollow={handleToggleFollow}
            onViewProfile={navigateToProfile}
            onShowQr={() => navigateTo('me')}
          />
        ) : activeTab === 'learn' ? (
          <LearnView
            currentProfile={currentProfile!}
            allProfiles={allProfiles}
            followingIds={followingIds}
            onToggleFollow={handleToggleFollow}
            onViewProfile={navigateToProfile}
          />
        ) : activeTab === 'people' ? (
          <PeopleView
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            followingIds={followingIds}
            followerIds={followerIds}
            onToggleFollow={handleToggleFollow}
            onViewProfile={navigateToProfile}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
        ) : activeTab === 'feed' ? (
          <FeedView
            currentProfile={currentProfile}
            posts={posts}
            allProfiles={allProfiles}
            onAddPost={post => setPosts(prev => [post, ...prev])}
            onUpdatePost={updated => setPosts(prev => prev.map(p => (p.id === updated.id ? updated : p)))}
            onViewProfile={navigateToProfile}
            onSelectTag={setSelectedTag}
            selectedTag={selectedTag}
          />
        ) : activeTab === 'inbox' ? (
          <InboxView
            notifications={notifications}
            allProfiles={allProfiles}
            onMarkAllRead={handleMarkAllRead}
            onViewProfile={navigateToProfile}
          />
        ) : activeTab === 'setup' ? (
          <SetupView
            onSignOut={handleSignOut}
            onRefreshData={refreshData}
            onToast={showToast}
          />
        ) : activeTab === 'about' ? (
          <AboutView onNavigateHome={() => navigateTo('home')} />
        ) : displayedProfile ? (
          <ProfileView
            profile={displayedProfile}
            currentProfile={currentProfile}
            followersCount={follows.filter(f => f.following_id === displayedProfile.id).length}
            followingCount={follows.filter(f => f.follower_id === displayedProfile.id).length}
            isFollowing={followingIds.has(displayedProfile.id)}
            onToggleFollow={() => handleToggleFollow(displayedProfile.id)}
            onUpdateProfile={updated => {
              setCurrentProfile(updated);
              setAllProfiles(prev => prev.map(p => (p.id === updated.id ? updated : p)));
            }}
            onDeleteProfile={() => {
              localStorage.removeItem('kw_me');
              localStorage.removeItem('kwegatta_current_profile');
              setCurrentProfile(null);
              setAllProfiles(prev => prev.filter(p => p.id !== displayedProfile.id));
              navigateTo('onboard');
              showToast('Your profile and personal data have been completely deleted.');
            }}
            onToast={showToast}
          />
        ) : (
          <div className="primer-box p-12 text-center space-y-3">
            <h3 className="font-semibold text-base">Page not found</h3>
            <p className="text-xs text-[var(--muted)]">The requested member or page does not exist.</p>
            <button onClick={() => navigateTo('home')} className="primer-btn primer-btn-primary text-xs py-1.5 px-3">
              Go to Matches
            </button>
          </div>
        )}
      </main>

      {/* GitHub Primer Footer with Mandatory Notice and Links */}
      <footer className="mt-auto border-t border-[var(--border)] py-6 px-4 bg-[var(--subtle)]">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[var(--fg)] text-[var(--header)] grid place-items-center">
              <Sparkles className="w-3 h-3" />
            </div>
            <span>Kwegatta — Hack Day Kampala x MUBS</span>
          </div>

          {/* Hard requirement: "Powered by Gemma 4 (open-weight)" in the footer */}
          <div className="font-medium text-[var(--fg)]">
            Powered by Gemma 4 (open-weight)
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => navigateTo('about')}
              className="hover:underline hover:text-[var(--accent)] text-[var(--fg)] font-medium"
            >
              About & Team
            </button>
            <span>·</span>
            <a
              href="https://github.com/Saifuddin2Ahmed/kwegatta"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-[var(--accent)]"
            >
              Repository
            </a>
            <span>·</span>
            <a
              href="https://www.mlh.com/opensource-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-[var(--accent)]"
            >
              MLH Challenge
            </a>
            <span>·</span>
            <a
              href="https://ai.google.dev/gemma/docs/core"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-[var(--accent)]"
            >
              Gemma 4 Licence (Apache 2.0)
            </a>
            <span>·</span>
            <a href="#/wall" className="hover:underline hover:text-[var(--accent)]">
              Projector Wall
            </a>
            <span>·</span>
            <button
              onClick={() => navigateTo('setup')}
              className="hover:underline hover:text-[var(--accent)]"
            >
              Setup
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
