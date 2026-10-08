import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { NavTabs } from './components/NavTabs';
import { MatchesView } from './components/MatchesView';
import { LearnView } from './components/LearnView';
import { PeopleView } from './components/PeopleView';
import { FeedView } from './components/FeedView';
import { InboxView } from './components/InboxView';
import { ProfileView } from './components/ProfileView';
import { HeroSection, KampalaStorySection } from './components/LivingNetworkHero';
import { Footer } from './components/Footer';
import { EventsView } from './components/EventsView';
import { PinnedAnnouncementBar } from './components/PinnedAnnouncementBar';
import { Profile, Post, NotificationItem, Follow } from './types';
import {
  db,
  APP_NAME,
  ensureAuthToken,
  claimExistingProfile,
  fetchMyAccountProfile
} from './services/api';
import {
  ThemePreference,
  getStoredThemePreference,
  saveThemePreference,
  resolveTheme,
  getNextThemePreference,
  applyThemeToDocument
} from './utils';
import { auth, handleRedirectResult, logOut } from './services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { AuthModal } from './components/AuthModal';

const AdminView = React.lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));
const WallView = React.lazy(() => import('./components/WallView').then(m => ({ default: m.WallView })));
const SetupView = React.lazy(() => import('./components/SetupView').then(m => ({ default: m.SetupView })));
const AboutView = React.lazy(() => import('./components/AboutView').then(m => ({ default: m.AboutView })));
const PrivacyView = React.lazy(() => import('./components/PrivacyView').then(m => ({ default: m.PrivacyView })));
const LicenseView = React.lazy(() => import('./components/LicenseView').then(m => ({ default: m.LicenseView })));
const OnboardingChat = React.lazy(() => import('./components/OnboardingChat').then(m => ({ default: m.OnboardingChat })));

export default function App() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [showSignInModal, setShowSignInModal] = useState<boolean>(false);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showUpdateBar, setShowUpdateBar] = useState(false);

  // Listen for new service worker taking control
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let hadPreviousController = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      setShowUpdateBar(true);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
        setShowUpdateBar(true);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker.addEventListener('message', onMessage);

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && (hadPreviousController || navigator.serviceWorker.controller)) {
            setShowUpdateBar(true);
          }
        });
      });
    }).catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  // Initialize theme: follows device preference by default, syncs with media query
  useEffect(() => {
    const pref = getStoredThemePreference();
    setThemePreference(pref);
    const resolved = resolveTheme(pref);
    applyThemeToDocument(resolved);

    // Listen to device preference change if preference is 'system'
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      const handler = (e: MediaQueryListEvent) => {
        if (getStoredThemePreference() === 'system') {
          const nextResolved = e.matches ? 'light' : 'dark';
          applyThemeToDocument(nextResolved);
        }
      };
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, []);

  // Ensure live projector wall (#/wall) is always dark
  useEffect(() => {
    if (activeTab === 'wall') {
      applyThemeToDocument('dark');
    } else {
      applyThemeToDocument(resolveTheme(themePreference));
    }
  }, [activeTab, themePreference]);

  const cycleTheme = () => {
    const nextPref = getNextThemePreference(themePreference);
    setThemePreference(nextPref);
    saveThemePreference(nextPref);
    const nextResolved = resolveTheme(nextPref);
    if (activeTab !== 'wall') {
      applyThemeToDocument(nextResolved);
    }
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

      const [ps, pos, ms] = await Promise.all([
        db.list<Profile>('profiles', { limit: 500 }),
        db.list<Post>('posts', { limit: 100 }),
        db.list<any>('matches', { limit: 100 })
      ]);
      
      setAllProfiles(ps || []);
      setPosts(pos || []);
      setMatches(ms || []);

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

    const runSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runSync();
      }
    };

    const handleCustomRefresh = () => {
      refreshData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('kwegatta_refresh', handleCustomRefresh);
    const interval = setInterval(runSync, 30000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('kwegatta_refresh', handleCustomRefresh);
    };
  }, [refreshData]);

  // Listen for live background AI profile polish updates
  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const updated = e.detail as Profile;
      if (updated && updated.id) {
        setCurrentProfile(prev => (prev && prev.id === updated.id ? updated : prev));
        setAllProfiles(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      }
    };
    window.addEventListener('kwegatta_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('kwegatta_profile_updated', handleProfileUpdate);
  }, []);

  // Handle URL hash changes (and pathname direct links like /privacy, /license)
  const handleHashChange = useCallback(() => {
    const rawHash = window.location.hash.replace(/^#\/?/, '');
    const rawPath = window.location.pathname.replace(/^\//, '');
    const directPath = ['privacy', 'license', 'about', 'wall'].includes(rawPath) ? rawPath : '';
    const effective = rawHash || directPath || 'home';
    const parts = effective.split('/');
    const main = parts[0] || 'home';
    const sub = parts[1];

    if (main === 'wall') {
      setActiveTab('wall');
    } else if (main === 'u' && sub) {
      setViewedProfileId(sub);
      setActiveTab('userProfile');
    } else if (main === 'events') {
      setActiveTab('events');
      setSelectedEventId(sub || null);
      setViewedProfileId(null);
    } else if (['home', 'events', 'learn', 'people', 'feed', 'inbox', 'me', 'setup', 'admin', 'about', 'onboard', 'privacy', 'license'].includes(main)) {
      setActiveTab(main);
      setViewedProfileId(null);
      setSelectedEventId(null);
    } else {
      setActiveTab('home');
      setViewedProfileId(null);
      setSelectedEventId(null);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

  const navigateTo = (tab: string) => {
    if (tab === 'home') window.location.hash = '#/home';
    else if (tab === 'events') window.location.hash = '#/events';
    else if (tab === 'learn') window.location.hash = '#/learn';
    else if (tab === 'people') window.location.hash = '#/people';
    else if (tab === 'feed') window.location.hash = '#/feed';
    else if (tab === 'inbox') window.location.hash = '#/inbox';
    else if (tab === 'me') window.location.hash = '#/me';
    else if (tab === 'wall') window.location.hash = '#/wall';
    else if (tab === 'admin') window.location.hash = '#/admin';
    else if (tab === 'setup') window.location.hash = '#/setup';
    else if (tab === 'about') window.location.hash = '#/about';
    else if (tab === 'privacy') window.location.hash = '#/privacy';
    else if (tab === 'license') window.location.hash = '#/license';
    else if (tab === 'onboard') triggerJoinFlow();
    else window.location.hash = `#/${tab}`;
  };

  const triggerJoinFlow = () => {
    // "Join" and "Get matched in about 2 minutes" work from every page:
    // go to the landing page, scroll to the onboarding chat and focus the input.
    window.location.hash = '#/onboard';
    setActiveTab('onboard');
    setTimeout(() => {
      const el = document.getElementById('onboarding-composer');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          const input = el.querySelector('input:not([type="file"]):not([hidden]), textarea, button') as HTMLElement | null;
          input?.focus();
        }, 350);
      }
    }, 120);
  };

  const navigateToProfile = (profileId: string) => {
    window.location.hash = `#/u/${profileId}`;
  };

  // Follow / Unfollow
  const handleToggleFollow = async (targetId: string) => {
    if (!currentProfile) {
      showToast('Join Kwegatta to follow other people');
      triggerJoinFlow();
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

  // Listen for Firebase auth state and handle redirect logins
  useEffect(() => {
    handleRedirectResult().catch(err => console.warn('[Firebase Auth] Redirect check:', err));

    const unsubscribe = onAuthStateChanged(auth, async user => {
      setFirebaseUser(user);
      if (user) {
        try {
          const accountProfile = await fetchMyAccountProfile();
          if (accountProfile) {
            setCurrentProfile(accountProfile);
            localStorage.setItem('kw_me', accountProfile.id);
            localStorage.setItem('kwegatta_current_profile', JSON.stringify(accountProfile));
            return;
          }

          const localKwMe = localStorage.getItem('kw_me');
          if (localKwMe) {
            const linked = await claimExistingProfile(localKwMe);
            if (linked) {
              setCurrentProfile(linked);
              localStorage.setItem('kwegatta_current_profile', JSON.stringify(linked));
              showToast('Your existing profile has been linked to your Google/Firebase account!');
            }
          }
        } catch (e) {
          console.warn('[Firebase Auth] Profile sync note:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGlobalSignInSuccess = async (user: FirebaseUser) => {
    setShowSignInModal(false);
    setFirebaseUser(user);
    try {
      const accountProfile = await fetchMyAccountProfile();
      if (accountProfile) {
        setCurrentProfile(accountProfile);
        localStorage.setItem('kw_me', accountProfile.id);
        localStorage.setItem('kwegatta_current_profile', JSON.stringify(accountProfile));
        navigateTo('home');
        showToast(`Welcome back, ${accountProfile.name.split(' ')[0]}!`);
        return;
      }

      const localKwMe = localStorage.getItem('kw_me');
      if (localKwMe) {
        const linked = await claimExistingProfile(localKwMe);
        if (linked) {
          setCurrentProfile(linked);
          localStorage.setItem('kwegatta_current_profile', JSON.stringify(linked));
          navigateTo('home');
          showToast('Profile linked to your account!');
          return;
        }
      }

      navigateTo('onboard');
      showToast(`Signed in as ${user.displayName || user.email}. Complete your profile to get matched!`);
    } catch (err: any) {
      showToast('Notice syncing account: ' + (err.message || 'Please try again'));
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
    } catch (_) {}
    localStorage.removeItem('kw_me');
    localStorage.removeItem('kw_auth_token');
    localStorage.removeItem('kw_firebase_token');
    localStorage.removeItem('kwegatta_current_profile');
    setCurrentProfile(null);
    setFirebaseUser(null);
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
      <React.Suspense fallback={<div className="h-screen grid place-items-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin"></div></div>}>
        <WallView
          onBack={() => navigateTo('home')}
        />
      </React.Suspense>
    );
  }

  const isAdminAuthenticated = Boolean(sessionStorage.getItem('kw_admin_token'));

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] flex flex-col font-sans transition-colors selection:bg-[var(--gold)] selection:text-[#090D16]">
      {/* Pinned Announcement Bar */}
      <PinnedAnnouncementBar />

      {/* Top Application Header */}
      <Header
        currentProfile={currentProfile}
        unreadCount={unreadCount}
        themePreference={themePreference}
        onCycleTheme={cycleTheme}
        searchQuery={searchQuery}
        onSearchChange={q => {
          setSearchQuery(q);
          if (activeTab !== 'people') navigateTo('people');
        }}
        onNavigate={navigateTo}
        onJoin={triggerJoinFlow}
        onOpenSignIn={() => setShowSignInModal(true)}
        onSignOut={handleSignOut}
        activeTab={activeTab}
        isDemoMode={isDemoMode}
      />

      {/* Mobile bottom tab bar for signed-in members */}
      {currentProfile && activeTab !== 'onboard' && (
        <NavTabs
          activeTab={activeTab === 'userProfile' ? 'me' : activeTab}
          unreadCount={unreadCount}
          onTabChange={navigateTo}
        />
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)] shadow-2xl text-[13px] font-medium text-[var(--fg)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3">
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[var(--fg-muted)] hover:text-[var(--fg)] text-[13px] font-bold p-1 cursor-pointer"
            aria-label="Dismiss toast"
          >
            ✕
          </button>
        </div>
      )}

      {/* New Version Ready Notification Bar - small dismissible bar that never covers nav or page title */}
      {showUpdateBar && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--card)] border border-[var(--gold)] shadow-2xl text-[13px] font-medium text-[var(--fg)] max-w-sm w-[calc(100%-2rem)] sm:w-auto animate-in fade-in slide-in-from-bottom-3"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--gold)] animate-pulse" />
            <span>A new version is ready</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="kw-btn kw-btn-primary text-[13px] py-1 px-3 font-semibold cursor-pointer"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowUpdateBar(false)}
              className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] rounded cursor-pointer transition-colors"
              aria-label="Dismiss update notification"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Container with standard 1200px container and vertical rhythm */}
      <main className={`flex-1 kw-container py-6 sm:py-8 space-y-6 md:space-y-10 ${currentProfile && activeTab !== 'onboard' ? 'pb-20 md:pb-8' : ''}`}>
        
        {/* Onboarding & Landing View (when visitor has no profile on home/onboard/me, or member explicitly opened onboard) */}
        {(!currentProfile && (activeTab === 'home' || activeTab === 'onboard' || activeTab === 'me')) || (currentProfile && activeTab === 'onboard') ? (
          <div className="space-y-12 sm:space-y-16">
            {/* b) Hero, two columns */}
            <HeroSection
              profiles={allProfiles}
              matchesCount={matches.length}
              postsCount={posts.length}
              onJoinClick={triggerJoinFlow}
            />

            {/* c) The onboarding chat, directly under the hero */}
            <div id="onboarding-composer">
              <React.Suspense fallback={<div className="p-8 text-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>}>
                <OnboardingChat
                  onCompleted={newProfile => {
                    setCurrentProfile(newProfile);
                    setAllProfiles(prev => [newProfile, ...prev]);
                    navigateTo('home');
                    showToast(`Welcome ${newProfile.name.split(' ')[0]}! Your matches are ready.`);
                  }}
                />
              </React.Suspense>
            </div>

            {/* d) "Built in one day in Kampala": story, the two other photos, four facts, team */}
            <KampalaStorySection onNavigate={navigateTo} />
          </div>
        ) : activeTab === 'events' ? (
          <EventsView
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            initialItemId={selectedEventId}
            onViewProfile={navigateToProfile}
            onJoinClick={triggerJoinFlow}
            onToast={showToast}
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
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            followingIds={followingIds}
            onToggleFollow={handleToggleFollow}
            onViewProfile={navigateToProfile}
            onJoinClick={triggerJoinFlow}
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
            onOpenSignIn={() => setShowSignInModal(true)}
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
          <React.Suspense fallback={<div className="p-12 text-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>}>
            <AdminView
              onBack={() => navigateTo('home')}
              onRefreshGlobalData={refreshData}
              onToast={showToast}
              onOpenSignIn={() => setShowSignInModal(true)}
            />
          </React.Suspense>
        ) : activeTab === 'setup' ? (
          isAdminAuthenticated ? (
            <React.Suspense fallback={<div className="p-12 text-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>}>
              <SetupView
                onSignOut={handleSignOut}
                onRefreshData={refreshData}
                onToast={showToast}
              />
            </React.Suspense>
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
          <React.Suspense fallback={<div className="p-12 text-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>}>
            <AboutView onNavigateHome={() => navigateTo('home')} />
          </React.Suspense>
        ) : activeTab === 'privacy' ? (
          <React.Suspense fallback={<div className="p-12 text-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>}>
            <PrivacyView onBack={() => navigateTo('home')} />
          </React.Suspense>
        ) : activeTab === 'license' ? (
          <React.Suspense fallback={<div className="p-12 text-center"><div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>}>
            <LicenseView onBack={() => navigateTo('home')} />
          </React.Suspense>
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
              localStorage.removeItem('kw_auth_token');
              localStorage.removeItem('kw_firebase_token');
              localStorage.removeItem('kwegatta_current_profile');
              if (auth.currentUser) {
                auth.currentUser.delete().catch(() => logOut());
              }
              setCurrentProfile(null);
              setFirebaseUser(null);
              setAllProfiles(prev => prev.filter(p => p.id !== displayedProfile.id));
              navigateTo('onboard');
              showToast('Your profile and personal data have been completely deleted.');
            }}
            onSignOut={handleSignOut}
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
      <Footer onNavigate={navigateTo} onJoin={triggerJoinFlow} />

      {/* Global Sign In Dialog for Visitors */}
      {showSignInModal && (
        <AuthModal
          isOpen={showSignInModal}
          onClose={() => setShowSignInModal(false)}
          onSuccess={handleGlobalSignInSuccess}
          title="Sign in to Kwegatta"
          subtitle="Sign in with Google in one tap to access your profile, matches, and chats from any device."
          existingProfile={currentProfile}
        />
      )}
    </div>
  );
}
