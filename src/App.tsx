import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { NavTabs } from './components/NavTabs';
import { MatchesView } from './components/MatchesView';
import { LearnView } from './components/LearnView';
import { PeopleView } from './components/PeopleView';
import { FeedView } from './components/FeedView';
import { InboxView } from './components/InboxView';
import { ProfileView } from './components/ProfileView';
import { LivingNetworkHero } from './components/LivingNetworkHero';
import { OnboardingChat } from './components/OnboardingChat';
import { WallView } from './components/WallView';
import { SetupView } from './components/SetupView';
import { AdminView } from './components/AdminView';
import { AboutView } from './components/AboutView';
import { Footer } from './components/Footer';
import { Profile, Post, NotificationItem, Follow } from './types';
import { db, APP_NAME, ensureAuthToken } from './services/api';

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

  // Initialize theme (default to dark ink theme)
  useEffect(() => {
    const savedTheme = (localStorage.getItem('kw_theme') as 'dark' | 'light') || 'dark';
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
      const myId = localStorage.getItem('kw_me');
      if (myId) {
        try {
          await ensureAuthToken(myId);
        } catch (e) {
          // continue
        }
      }

      const [ps, pos] = await Promise.all([
        db.list<Profile>('profiles', { limit: 500 }),
        db.list<Post>('posts', { limit: 100 })
      ]);
      
      if (ps && ps.length > 0) {
        setAllProfiles(ps);
      }
      if (pos) {
        setPosts(pos);
      }

      if (myId && ps && ps.length > 0) {
        const found = ps.find(p => p.id === myId);
        if (found) {
          setCurrentProfile(found);
          const [fls, notifs] = await Promise.all([
            db.list<Follow>('follows', { eq: { follower_id: myId }, limit: 500 }),
            db.list<NotificationItem>('notifications', { eq: { to_id: myId }, limit: 100 })
          ]);
          setFollows(fls || []);
          setNotifications(notifs || []);
        }
      }
    } catch (err) {
      // Quiet fallback
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
    } else if (['home', 'learn', 'people', 'feed', 'inbox', 'me', 'setup', 'admin', 'about', 'onboard'].includes(main)) {
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
    else if (tab === 'admin') window.location.hash = '#/admin';
    else if (tab === 'setup') window.location.hash = '#/setup';
    else if (tab === 'about') window.location.hash = '#/about';
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
    localStorage.removeItem('kwegatta_current_profile');
    setCurrentProfile(null);
    navigateTo('onboard');
    showToast('Signed out successfully');
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const followingIds = new Set(follows.map(f => f.following_id));
  const followerIds = new Set(follows.filter(f => f.following_id === currentProfile?.id).map(f => f.follower_id));

  // Determine displayed profile for userProfile or me
  const displayedProfile =
    activeTab === 'userProfile' && viewedProfileId
      ? allProfiles.find(p => p.id === viewedProfileId) || null
      : activeTab === 'me'
      ? currentProfile
      : null;

  // Projector Wall Mode is full-screen standalone
  if (activeTab === 'wall') {
    return (
      <WallView
        onBack={() => navigateTo('home')}
      />
    );
  }

  const isAdminAuthenticated = Boolean(sessionStorage.getItem('kw_admin_token'));

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] flex flex-col font-sans transition-colors selection:bg-[var(--gold)] selection:text-[#090D16]">
      
      {/* Top Application Header */}
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

      {/* Navigation tabs (visible when user is onboarded) */}
      {currentProfile && activeTab !== 'onboard' && (
        <NavTabs
          activeTab={activeTab === 'userProfile' ? '' : activeTab}
          unreadCount={unreadCount}
          onTabChange={navigateTo}
        />
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)] shadow-2xl text-xs font-medium text-[var(--fg)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3">
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[var(--fg-muted)] hover:text-[var(--fg)] text-xs font-bold p-1"
            aria-label="Dismiss toast"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Container with standard max-width and balanced vertical rhythm */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        
        {/* Onboarding & Landing View (when visitor has no profile or explicitly opened onboarding) */}
        {(!currentProfile && activeTab !== 'userProfile' && activeTab !== 'admin' && activeTab !== 'about') || activeTab === 'onboard' ? (
          <div className="space-y-8">
            <LivingNetworkHero
              profiles={allProfiles}
              postsCount={posts.length}
              onJoinClick={() => {
                const el = document.getElementById('onboarding-composer');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
            <div id="onboarding-composer">
              <OnboardingChat
                onCompleted={newProfile => {
                  setCurrentProfile(newProfile);
                  setAllProfiles(prev => [newProfile, ...prev]);
                  navigateTo('home');
                  showToast(`Welcome ${newProfile.name.split(' ')[0]}! Your matches are ready.`);
                }}
              />
            </div>
          </div>
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
        ) : activeTab === 'admin' ? (
          <AdminView
            onBack={() => navigateTo('home')}
            onRefreshGlobalData={refreshData}
            onToast={showToast}
          />
        ) : activeTab === 'setup' ? (
          isAdminAuthenticated ? (
            <SetupView
              onSignOut={handleSignOut}
              onRefreshData={refreshData}
              onToast={showToast}
            />
          ) : (
            <div className="kw-card p-12 text-center space-y-4 max-w-md mx-auto">
              <h3 className="font-bold text-base text-[var(--fg)]">Page not found</h3>
              <p className="text-xs text-[var(--fg-muted)]">The requested page does not exist or requires admin authorization.</p>
              <button onClick={() => navigateTo('home')} className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold">
                Go to Matches
              </button>
            </div>
          )
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
          <div className="kw-card p-12 text-center space-y-4 max-w-md mx-auto">
            <h3 className="font-bold text-base text-[var(--fg)]">Page not found</h3>
            <p className="text-xs text-[var(--fg-muted)]">The requested member or page does not exist.</p>
            <button onClick={() => navigateTo('home')} className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold">
              Go to Matches
            </button>
          </div>
        )}
      </main>

      {/* Production-Grade Multi-Column Startup Footer */}
      <Footer onNavigate={navigateTo} />

    </div>
  );
}
