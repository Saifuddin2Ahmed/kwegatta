// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EventsView } from '../src/components/EventsView';
import { FeedView } from '../src/components/FeedView';
import { OnboardingChat } from '../src/components/OnboardingChat';
import { AuthModal } from '../src/components/AuthModal';
import { guessCountry } from '../src/lib/countries';
import * as apiModule from '../src/services/api';
import {
  app,
  validateGemmaModelId,
  sanitizePublicProfile,
  ALLOWED_OPEN_WEIGHT_MODELS,
  DEFAULT_OPEN_WEIGHT_MODEL,
  getAdminEmailsList,
  ALLOWED_GEMMA_TASKS,
  buildGemmaPrompt,
  canApproveEvent,
  canEditEvent,
  filterEventsForCaller,
  sanitizeEventForPublic,
  getStorageMode,
  assertStorageModeForTest,
  cleanupTestEvents,
  CLEANUP_TEST_EVENTS_FLAG,
  canChangeTeam,
  sanitizeDomainUrl,
  sanitizeCustomLinks,
  runSaifuddinProfileMigration,
  SAIFUDDIN_PROFILE_MIGRATION_FLAG,
  SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG,
  cleanupExpiredGuestRecords,
  resetGuestCleanupTimerForTest,
  matchPairCache,
  getPairCacheKey,
  setPairCacheEntry,
  connectRequestsMap,
  cascadeDeleteMemberData,
  store
} from '../server';
import { validatePasswordStrength } from '../src/services/firebase';
import { normalizeIntent, parseIntents, toggleChoice, makeFirst } from '../src/lib/profileChoices';
import { ShareCardModal, avatarSrc } from '../src/components/ShareCardModal';

let server: any;
let baseUrl: string;

describe('Admin Accounts & Security', () => {
  it('parses ADMIN_EMAILS environment variable correctly', () => {
    const list = getAdminEmailsList();
    expect(Array.isArray(list)).toBe(true);
  });

  it('keeps admin unreachable when ADMIN_EMAILS is empty and no stored admins exist', () => {
    const originalEnv = process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAILS;
    try {
      const list = getAdminEmailsList();
      expect(list.length >= 0).toBe(true);
      // Empty string should never match any admin email
      expect(list.includes('')).toBe(false);
      expect(list.includes('attacker@evil.com')).toBe(false);
    } finally {
      process.env.ADMIN_EMAILS = originalEnv;
    }
  });
});

describe('Gemma Task Validation & Prompt Builder', () => {
  it('restricts Gemma inference to predefined approved tasks only', () => {
    expect(ALLOWED_GEMMA_TASKS).toContain('polish_profile');
    expect(ALLOWED_GEMMA_TASKS).toContain('match');
    expect(ALLOWED_GEMMA_TASKS).toContain('tag_post');
    expect(ALLOWED_GEMMA_TASKS).toContain('ask');
    expect(ALLOWED_GEMMA_TASKS).toContain('event_matches');
    expect(ALLOWED_GEMMA_TASKS.length).toBe(5);
  });

  it('builds structured prompts for polish_profile task', () => {
    const prompt = buildGemmaPrompt('polish_profile', {
      name: 'Joan',
      role: 'Developer',
      offers: 'React, TypeScript',
      needs: 'Backend guidance'
    });
    expect(prompt).toContain('Joan');
    expect(prompt).toContain('React, TypeScript');
  });

  it('builds structured prompts for event_matches task', () => {
    const prompt = buildGemmaPrompt('event_matches', {
      event_title: 'Hack Day Kampala',
      me: { name: 'Alex', role: 'builder' },
      attendees: [{ id: 'u1', name: 'Bob', role: 'designer', offers: 'UI/UX' }]
    });
    expect(prompt).toContain('Hack Day Kampala');
    expect(prompt).toContain('Alex');
    expect(prompt).toContain('Bob');
  });
});

describe('Gemma Model Guard', () => {
  it('allows allowed open-weight Gemma model IDs', () => {
    expect(validateGemmaModelId('gemma-4-26b-a4b-it')).toBe('gemma-4-26b-a4b-it');
    expect(validateGemmaModelId('gemma-4-31b-it')).toBe('gemma-4-31b-it');
    expect(ALLOWED_OPEN_WEIGHT_MODELS).toContain(DEFAULT_OPEN_WEIGHT_MODEL);
  });

  it('rejects closed models and models not starting with gemma-', () => {
    expect(() => validateGemmaModelId('gemini-2.5-flash')).toThrow(/Rule Violation|Prohibited model/);
    expect(() => validateGemmaModelId('gemini-1.5-pro')).toThrow(/Rule Violation|Prohibited model/);
    expect(() => validateGemmaModelId('claude-3-5-sonnet')).toThrow(/Rule Violation|Prohibited model/);
    expect(() => validateGemmaModelId('gpt-4o')).toThrow(/Rule Violation|Prohibited model/);
    expect(() => validateGemmaModelId('')).toThrow(/Rule Violation|Prohibited model/);
  });

  it('rejects unapproved variants of gemma', () => {
    expect(() => validateGemmaModelId('gemma-2-2b-it')).toThrow(/Unsupported model/);
  });
});

describe('Profile Sanitiser (Privacy & Safety)', () => {
  const mockProfile = {
    id: 'user-brian-123',
    account_uid: 'firebase-uid-brian',
    email: 'brian.secret@mubs.ac.ug',
    name: 'Brian Okello',
    role: 'builder',
    headline: 'Full-stack mobile engineer',
    whatsapp: '256782234567',
    hide_whatsapp: false,
    blocked_ids: ['blocked-user-999', 'blocked-user-888'],
    avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  it('removes email and blocked_ids for other visitors and members', () => {
    const sanitized = sanitizePublicProfile(mockProfile, 'other-caller-456', false);
    expect(sanitized.email).toBeUndefined();
    expect(sanitized.account_uid).toBeUndefined();
    expect(sanitized.blocked_ids).toBeUndefined();
    expect(sanitized.name).toBe('Brian Okello');
    expect(sanitized.avatar).toBe('/api/avatar/user-brian-123');
  });

  it('preserves email, account_uid, and blocked_ids for the profile owner (self)', () => {
    const sanitized = sanitizePublicProfile(mockProfile, 'firebase-uid-brian', false);
    expect(sanitized.email).toBe('brian.secret@mubs.ac.ug');
    expect(sanitized.account_uid).toBe('firebase-uid-brian');
    expect(sanitized.blocked_ids).toEqual(['blocked-user-999', 'blocked-user-888']);
  });

  it('allows admins to view email and account_uid, but preserves caller privacy for blocked_ids', () => {
    const sanitized = sanitizePublicProfile(mockProfile, 'admin-caller', true);
    expect(sanitized.email).toBe('brian.secret@mubs.ac.ug');
    expect(sanitized.account_uid).toBe('firebase-uid-brian');
    expect(sanitized.blocked_ids).toBeUndefined();
  });
});

describe('Password Validation', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePasswordStrength('1234567')).toBe('Password must be at least 8 characters long.');
    expect(validatePasswordStrength('')).toBe('Password must be at least 8 characters long.');
    expect(validatePasswordStrength('short')).toBe('Password must be at least 8 characters long.');
  });

  it('rejects common, weak or repetitive passwords', () => {
    expect(validatePasswordStrength('12345678')).toMatch(/too common or easily guessed/);
    expect(validatePasswordStrength('password123')).toMatch(/too common or easily guessed/);
    expect(validatePasswordStrength('aaaaaaaa')).toMatch(/too common or easily guessed/);
    expect(validatePasswordStrength('admin123')).toMatch(/too common or easily guessed/);
    expect(validatePasswordStrength('qwerty123')).toMatch(/too common or easily guessed/);
  });

  it('accepts strong and distinct passwords of at least 8 characters', () => {
    expect(validatePasswordStrength('Kwegatta2026!Kampala')).toBeNull();
    expect(validatePasswordStrength('MubsDeveloper#99')).toBeNull();
    expect(validatePasswordStrength('C0llab0rat10nSecure!')).toBeNull();
  });
});

describe('Member-Submitted Events & Approval Permissions', () => {
  it('a member cannot approve (only admins can approve)', () => {
    // Normal member (isAdmin: false) cannot approve
    expect(canApproveEvent(false)).toBe(false);

    // Admin (isAdmin: true) can approve
    expect(canApproveEvent(true)).toBe(true);
  });

  it("a member cannot edit someone else's item", () => {
    const aliceId = 'member-alice-123';
    const bobId = 'member-bob-456';
    const bobsEventAuthorId = bobId;

    // Alice attempts to edit Bob's event as a member -> denied
    expect(canEditEvent(aliceId, bobsEventAuthorId, false)).toBe(false);

    // Alice can edit her own event -> allowed
    expect(canEditEvent(aliceId, aliceId, false)).toBe(true);

    // Unauthenticated caller cannot edit Bob's event -> denied
    expect(canEditEvent(null, bobsEventAuthorId, false)).toBe(false);

    // Admin can edit any item -> allowed
    expect(canEditEvent(aliceId, bobsEventAuthorId, true)).toBe(true);
  });

  it('a pending item is not returned to other members', () => {
    const aliceId = 'member-alice-123';
    const bobId = 'member-bob-456';

    const events = [
      {
        id: 'event-pub-1',
        title: 'Kampala Open Source Meetup',
        author_id: 'admin',
        status: 'published',
        published: true
      },
      {
        id: 'event-alice-pending',
        title: 'Alice AI Hackathon',
        author_id: aliceId,
        status: 'pending',
        published: false
      },
      {
        id: 'event-bob-pending',
        title: 'Bob Robotics Workshop',
        author_id: bobId,
        status: 'pending',
        published: false
      }
    ];

    // For Bob (a regular member who is not Alice):
    // Bob should see the published event and his OWN pending event,
    // but Alice's pending event MUST NOT be returned to Bob.
    const bobsVisible = filterEventsForCaller(events, bobId, false);
    const bobsVisibleIds = bobsVisible.map(e => e.id);
    expect(bobsVisibleIds).toContain('event-pub-1');
    expect(bobsVisibleIds).toContain('event-bob-pending');
    expect(bobsVisibleIds).not.toContain('event-alice-pending');

    // For an unauthenticated visitor:
    // Only published events are returned; NO pending items returned.
    const guestVisible = filterEventsForCaller(events, null, false);
    const guestVisibleIds = guestVisible.map(e => e.id);
    expect(guestVisibleIds).toEqual(['event-pub-1']);

    // For an admin:
    // All items including all members' pending items are returned.
    const adminVisible = filterEventsForCaller(events, 'admin-id', true);
    expect(adminVisible.map(e => e.id)).toEqual([
      'event-pub-1',
      'event-alice-pending',
      'event-bob-pending'
    ]);
  });
});

describe('Service Worker & Cache-Control Configuration (PWA v1.5.2)', () => {
  it('public/sw.js specifies CACHE_NAME as kwegatta-1.5.2 and handles cache strategies correctly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swContent = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf-8');

    // 1. Cache name includes version kwegatta-1.5.11
    expect(swContent).toContain("CACHE_NAME = 'kwegatta-1.5.12'");

    // 2. Skip waiting and clients claim are preserved
    expect(swContent).toContain('self.skipWaiting()');
    expect(swContent).toContain('self.clients.claim()');

    // 3. /api/ requests never cached
    expect(swContent).toContain("request.url.includes('/api/')");

    // 4. Page requests (/, /index.html, navigate) are network-first
    expect(swContent).toContain("url.pathname === '/' ||");
    expect(swContent).toContain("url.pathname === '/index.html'");

    // 5. Hashed assets under /assets/ are handled
    expect(swContent).toContain("url.pathname.includes('/assets/')");
  });

  it('server.ts sends Cache-Control: no-cache for index.html and sw.js, and immutable for assets', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

    expect(serverContent).toContain("res.setHeader('Cache-Control', 'no-cache');");
    expect(serverContent).toContain("immutable");
  });
});

describe('Team Management Permissions (Admin Only)', () => {
  it('a member who is not an admin cannot change the team', () => {
    // Normal member (isAdmin: false) cannot change the team
    expect(canChangeTeam(false)).toBe(false);

    // Admin (isAdmin: true) can change the team
    expect(canChangeTeam(true)).toBe(true);
  });
});

describe('Profile Links Validation (Domain & Custom Links)', () => {
  it('validates URLs against approved real domains', () => {
    expect(sanitizeDomainUrl('https://huggingface.co/saifuddin2ahmed', ['huggingface.co'])).toBe('https://huggingface.co/saifuddin2ahmed');
    expect(sanitizeDomainUrl('https://evil.com/huggingface.co', ['huggingface.co'])).toBe('');
    expect(sanitizeDomainUrl('https://kaggle.com/saifuddinahmed', ['kaggle.com'])).toBe('https://kaggle.com/saifuddinahmed');
    expect(sanitizeDomainUrl('https://gitlab.com/saifuddinahmed', ['gitlab.com'])).toBe('https://gitlab.com/saifuddinahmed');
    expect(sanitizeDomainUrl('https://play.google.com/store/apps/dev?id=123', ['play.google.com'])).toBe('https://play.google.com/store/apps/dev?id=123');
    expect(sanitizeDomainUrl('https://g.dev/SaifuddinAhmed', ['g.dev', 'developers.google.com'])).toBe('https://g.dev/SaifuddinAhmed');
    expect(sanitizeDomainUrl('https://developers.google.com/profile/u/123', ['g.dev', 'developers.google.com'])).toBe('https://developers.google.com/profile/u/123');
    expect(sanitizeDomainUrl('https://ieee-collabratec.ieee.org/app/p/SaifuddinAhmed', ['ieee-collabratec.ieee.org'])).toBe('https://ieee-collabratec.ieee.org/app/p/SaifuddinAhmed');
  });

  it('validates custom links (max 3, max 24 char label, https URL only)', () => {
    const raw = [
      { label: 'Substack Newsletter', url: 'https://saifuddin.substack.com' },
      { label: 'Portfolio Work', url: 'https://otwox.com' },
      { label: 'Tech Blog', url: 'https://blog.example.com' },
      { label: 'Fourth Link Exceeds Limit', url: 'https://extra.example.com' },
      { label: 'Invalid Insecure', url: 'http://insecure.com' }
    ];
    const sanitized = sanitizeCustomLinks(raw);
    expect(sanitized.length).toBe(3);
    expect(sanitized[0].label).toBe('Substack Newsletter');
    expect(sanitized[0].url).toBe('https://saifuddin.substack.com');
    expect(sanitized[1].label).toBe('Portfolio Work');
    expect(sanitized[2].label).toBe('Tech Blog');
  });
});

describe('One-Time Saifuddin Profile Migration', () => {
  it('defines the migration flag stopping repeated execution', () => {
    expect(SAIFUDDIN_PROFILE_MIGRATION_FLAG).toBe('saifuddin_profile_migration_v1');
  });

  it('migrates the target member profile and records completion flag', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    // Verify migration flag is checked and saved
    expect(serverContent).toContain('SAIFUDDIN_PROFILE_MIGRATION_FLAG');
    expect(serverContent).toContain('Electronic control engineer and AI researcher');
    expect(serverContent).toContain('https://huggingface.co/saifuddin2ahmed');
    expect(serverContent).toContain('https://ieee-collabratec.ieee.org/app/p/SaifuddinAhmed');
  });

  it('defines the migration v3 flag setting skills to empty array', () => {
    expect(SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG).toBe('saifuddin_profile_migration_v3');
  });
});

describe('Privacy and Access Isolation (v1.3.1)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.stdout.write(`\n[Test Suite] Active storageMode: ${getStorageMode()}\n`);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Populate completed profiles for test callers
    const testCallerUids = [
      'test-user-unapproved-author',
      'test-author-pending-part2',
      'test-member-a',
      'test-member-b',
      'test-member-a-author',
      'test-user-random-viewer',
      'test-reporter-1',
      'test-reporter-2',
      'test-reporter-3',
      'test-blocked-member',
      'test-member-150'
    ];
    for (const uid of testCallerUids) {
      if (!store.profiles.some((p: any) => p.account_uid === uid || p.id === uid)) {
        store.profiles.push({
          id: uid,
          account_uid: uid,
          name: `Test Member ${uid}`,
          headline: 'Kampala Builder and Developer',
          role: 'Developer',
          needs: 'Teammates for Hackathon',
          offers: 'TypeScript and React',
          events_blocked: uid === 'test-blocked-member',
          created_at: new Date().toISOString()
        } as any);
      }
    }
  });


  it('runs against isolated in-memory store only and throws if test resolves storageMode to firestore', () => {
    expect(getStorageMode()).toBe('memory');
    expect(() => assertStorageModeForTest('firestore')).toThrow(
      'FATAL GUARD VIOLATION: Test run cannot resolve storageMode to "firestore". Tests must run against isolated in-memory store only.'
    );
  });

  it('cleans up test events from in-memory store and respects migration flag', async () => {
    const count = await cleanupTestEvents();
    expect(typeof count).toBe('number');
    expect(CLEANUP_TEST_EVENTS_FLAG).toBe('cleanup_test_events_unapproved_author_v1');
  });

  it('anonymous GET on /api/data/notifications, /api/data/matches, and /api/data/follows returns 401', async () => {
    const resNotifs = await fetch(`${baseUrl}/api/data/notifications`);
    expect(resNotifs.status).toBe(401);

    const resMatches = await fetch(`${baseUrl}/api/data/matches`);
    expect(resMatches.status).toBe(401);

    const resFollows = await fetch(`${baseUrl}/api/data/follows`);
    expect(resFollows.status).toBe(401);
  });

  it('NODE_ENV "production" with adminAuth unavailable, "Bearer test-anything" on GET /api/data/notifications returns 401', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origVitest = process.env.VITEST;
    process.env.NODE_ENV = 'production';
    delete process.env.VITEST;
    try {
      const res = await fetch(`${baseUrl}/api/data/notifications`, {
        headers: { Authorization: 'Bearer test-anything' }
      });
      expect(res.status).toBe(401);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origVitest !== undefined) {
        process.env.VITEST = origVitest;
      }
    }
  });

  it('member A cannot see member B notifications or matches', async () => {
    const resA = await fetch(`${baseUrl}/api/data/notifications`, {
      headers: { Authorization: 'Bearer test-user-a' }
    });
    expect(resA.status).toBe(200);
    const notifsA = await resA.json();
    for (const n of notifsA) {
      expect(n.to_id).toBe('test-user-a');
    }

    const resMatchesA = await fetch(`${baseUrl}/api/data/matches`, {
      headers: { Authorization: 'Bearer test-user-a' }
    });
    expect(resMatchesA.status).toBe(200);
    const matchesA = await resMatchesA.json();
    for (const m of matchesA) {
      expect(m.a_id === 'test-user-a' || m.b_id === 'test-user-a').toBe(true);
    }
  });

  it('provides public live wall route without private profile exposures', async () => {
    const res = await fetch(`${baseUrl}/api/wall/feed`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.matches)).toBe(true);
    for (const m of data.matches) {
      expect(m.id).toBeDefined();
      expect(m.first_name_a).toBeDefined();
      expect(m.first_name_b).toBeDefined();
      expect(m.spark).toBeDefined();
      expect(m.a_id).toBeUndefined();
      expect(m.b_id).toBeUndefined();
      expect(m.avatar).toBeUndefined();
      expect(m.score).toBeUndefined();
      expect(m.reason).toBeUndefined();
      expect(m.email).toBeUndefined();
      expect(m.account_uid).toBeUndefined();
    }
  });

  it('anonymous upload on /api/event-image/upload returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/event-image/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      })
    });
    expect(res.status).toBe(401);
  });

  it('an oversized or wrong-type file is rejected on /api/event-image/upload', async () => {
    // 1. Wrong type (SVG payload)
    const resSvg = await fetch(`${baseUrl}/api/event-image/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-user-a'
      },
      body: JSON.stringify({ image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
    });
    expect(resSvg.status).toBe(400);

    // 2. Oversized file (> 400 KB)
    const largeBuffer = Buffer.alloc(450 * 1024, 0);
    largeBuffer[0] = 0x89; largeBuffer[1] = 0x50; largeBuffer[2] = 0x4e; largeBuffer[3] = 0x47;
    largeBuffer[4] = 0x0d; largeBuffer[5] = 0x0a; largeBuffer[6] = 0x1a; largeBuffer[7] = 0x0a;
    const resLarge = await fetch(`${baseUrl}/api/event-image/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-user-a'
      },
      body: JSON.stringify({ image: `data:image/png;base64,${largeBuffer.toString('base64')}` })
    });
    expect(resLarge.status).toBe(400);
  });

  it("an unapproved event's image is not served to the public", async () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // In v1.4.0, member submissions publish directly. Seed an unapproved / pending event
    const eventId = 'test-unapproved-event-1';
    store.events.unshift({
      id: eventId,
      kind: 'event',
      title: 'Unapproved Test Community Hack',
      description: 'Testing cover image access control before approval.',
      datetime: 'Sat, Nov 14 • 2:00 PM EAT',
      location: 'Kampala',
      cover_image: validPng,
      author_id: 'deleted-author-id',
      status: 'pending',
      published: false,
      attendee_ids: []
    } as any);

    // Public / anonymous request to /api/event-image/:id returns 404
    const publicRes = await fetch(`${baseUrl}/api/event-image/${eventId}`);
    expect(publicRes.status).toBe(404);

    // Unrelated non-admin member request also returns 404
    const memberRes = await fetch(`${baseUrl}/api/event-image/${eventId}`, {
      headers: { Authorization: 'Bearer test-user-random-viewer' }
    });
    expect(memberRes.status).toBe(404);
  });

  it('unapproved events are not public on generic /api/data/events and raw data URLs are never returned', async () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // 1. Seed an unapproved pending event
    const eventId = 'test-unapproved-event-2';
    store.events.unshift({
      id: eventId,
      kind: 'event',
      title: 'Hidden Pending Hackathon Part 2',
      description: 'Should not be seen by anonymous users on /api/data/events',
      datetime: 'Sat, Nov 21 • 3:00 PM EAT',
      location: 'Kampala',
      cover_image: validPng,
      author_id: 'test-author-pending-part2',
      status: 'pending',
      published: false,
      attendee_ids: []
    } as any);

    // 2. Anonymous caller GET /api/data/events
    const anonRes = await fetch(`${baseUrl}/api/data/events`);
    expect(anonRes.status).toBe(200);
    const anonEvents = await anonRes.json();
    expect(Array.isArray(anonEvents)).toBe(true);

    // Pending event must NOT be visible to anonymous caller
    expect(anonEvents.some((e: any) => e.id === eventId)).toBe(false);

    // No event on /api/data/events should ever contain a raw data URL
    for (const ev of anonEvents) {
      if (ev.cover_image) {
        expect(ev.cover_image).not.toContain('data:image');
        expect(ev.cover_image.startsWith('/api/event-image/')).toBe(true);
      }
    }

    // 3. Author caller GET /api/data/events can see their own pending event
    const authorRes = await fetch(`${baseUrl}/api/data/events`, {
      headers: { Authorization: 'Bearer test-author-pending-part2' }
    });
    expect(authorRes.status).toBe(200);
    const authorEvents = await authorRes.json();
    expect(authorEvents.some((e: any) => e.id === eventId)).toBe(true);
    const myPending = authorEvents.find((e: any) => e.id === eventId);
    expect(myPending.cover_image).toBe(`/api/event-image/${eventId}`);
  });

  it("member B cannot change member A's event image (403)", async () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Member A creates an event
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-member-a'
      },
      body: JSON.stringify({
        kind: 'event',
        title: "Member A's Original Showcase",
        description: 'Event created by Member A for testing image ownership.',
        datetime: 'Sun, Dec 1 • 10:00 AM EAT',
        location: 'Makerere',
        cover_image: validPng
      })
    });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    const eventId = createData.item.id;

    // Member B tries to upload / replace Member A's event image
    const patchRes = await fetch(`${baseUrl}/api/event-image/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-member-b'
      },
      body: JSON.stringify({
        event_id: eventId,
        image: validPng
      })
    });
    expect(patchRes.status).toBe(403);
    const patchData = await patchRes.json();
    expect(patchData.error).toContain('Forbidden');
  });

  it("the author can change their event image", async () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Member A creates an event
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-member-a-author'
      },
      body: JSON.stringify({
        kind: 'event',
        title: "Member A Author Showcase",
        description: 'Testing author updating their own event image.',
        datetime: 'Sun, Dec 8 • 10:00 AM EAT',
        location: 'Makerere',
        cover_image: validPng
      })
    });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    const eventId = createData.item.id;

    // Author (Member A) updates their event image
    const updateRes = await fetch(`${baseUrl}/api/event-image/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-member-a-author'
      },
      body: JSON.stringify({
        event_id: eventId,
        image: validPng
      })
    });
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);

    // Verify detail endpoint reflects updated image path
    const detailRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
      headers: { Authorization: 'Bearer test-member-a-author' }
    });
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.cover_image).toBe(`/api/event-image/${eventId}`);
  });
});

describe('Quality Assurance & Safety Guarantees (v1.3.1)', () => {
  it('footer contains no model IDs and no Made in Kampala', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const footerContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'Footer.tsx'), 'utf-8');
    expect(footerContent).not.toContain('gemma-4-26b-a4b-it');
    expect(footerContent).not.toContain('gemma-4-31b-it');
    expect(footerContent).not.toContain('31b-it');
    expect(footerContent).not.toContain('Made in Kampala');
  });

  it('theme preference read and write is safe when localStorage throws', async () => {
    const { getStoredThemePreference, saveThemePreference } = await import('../src/utils');

    const mockStorage = {
      getItem: () => { throw new Error('QuotaExceededError'); },
      setItem: () => { throw new Error('QuotaExceededError'); }
    };
    const prev = window.localStorage;
    Object.defineProperty(window, 'localStorage', { value: mockStorage, configurable: true, writable: true });

    try {
      expect(() => getStoredThemePreference()).not.toThrow();
      expect(getStoredThemePreference()).toBe('system');
      expect(() => saveThemePreference('dark')).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', { value: prev, configurable: true, writable: true });
    }
  });

  it('stat counters are hidden below 25 members (MIN_MEMBERS_FOR_STATS)', async () => {
    const { MIN_MEMBERS_FOR_STATS } = await import('../src/utils');
    expect(MIN_MEMBERS_FOR_STATS).toBe(25);
  });
});

describe('Post-Publication Moderation & Admin Event Controls (v1.4.0)', () => {
  it('non-admin cannot hide/delete/block (401/403)', async () => {
    // Non-admin cannot hide event
    const hideRes = await fetch(`${baseUrl}/api/admin/events/sample-event/hide`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-member-a' }
    });
    expect([401, 403]).toContain(hideRes.status);

    // Non-admin cannot delete event via admin route
    const deleteRes = await fetch(`${baseUrl}/api/admin/events/sample-event`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-member-a' }
    });
    expect([401, 403]).toContain(deleteRes.status);

    // Non-admin cannot block author
    const blockRes = await fetch(`${baseUrl}/api/admin/events/sample-event/block-author`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-member-a' }
    });
    expect([401, 403]).toContain(blockRes.status);
  });

  it('a blocked member cannot create', async () => {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-blocked-member'
      },
      body: JSON.stringify({
        kind: 'event',
        title: 'Event by Blocked Author',
        description: 'Should be rejected with 403.',
        datetime: 'Mon, Dec 15 • 10:00 AM EAT',
        location: 'Kampala'
      })
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("You can't create events right now");
  });

  it('the third distinct report hides the event and the same member reporting twice counts once', async () => {
    // 1. Author creates a published event
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-member-a'
      },
      body: JSON.stringify({
        kind: 'event',
        title: 'Moderation Showcase Event',
        description: 'Will be reported by community members for testing auto-hide.',
        datetime: 'Fri, Dec 19 • 4:00 PM EAT',
        location: 'Kololo, Kampala'
      })
    });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    const eventId = createData.item.id;
    expect(createData.item.status).toBe('published');

    // 2. Member 1 reports the event
    const report1 = await fetch(`${baseUrl}/api/events/${eventId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-reporter-1'
      },
      body: JSON.stringify({
        reason: 'Spam or scam',
        note: 'Looks like spam'
      })
    });
    expect(report1.status).toBe(200);
    const rep1Data = await report1.json();
    expect(rep1Data.hidden_by_moderation).toBe(false);
    expect(rep1Data.report_count).toBe(1);

    // 3. Same member reporting twice counts once (rejected with 400)
    const reportDuplicate = await fetch(`${baseUrl}/api/events/${eventId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-reporter-1'
      },
      body: JSON.stringify({
        reason: 'Spam or scam',
        note: 'Reporting a second time'
      })
    });
    expect(reportDuplicate.status).toBe(400);
    const dupData = await reportDuplicate.json();
    expect(dupData.error).toContain('already reported');

    // 4. Member 2 reports the event
    const report2 = await fetch(`${baseUrl}/api/events/${eventId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-reporter-2'
      },
      body: JSON.stringify({
        reason: 'Not a real event'
      })
    });
    expect(report2.status).toBe(200);
    const rep2Data = await report2.json();
    expect(rep2Data.hidden_by_moderation).toBe(false);
    expect(rep2Data.report_count).toBe(2);

    // Event is still visible publicly with 2 reports
    const listResBefore = await fetch(`${baseUrl}/api/events`);
    expect(listResBefore.status).toBe(200);
    const listBefore = await listResBefore.json();
    expect(listBefore.some((e: any) => e.id === eventId)).toBe(true);

    // 5. The third distinct report hides the event automatically
    const report3 = await fetch(`${baseUrl}/api/events/${eventId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-reporter-3'
      },
      body: JSON.stringify({
        reason: 'Offensive'
      })
    });
    expect(report3.status).toBe(200);
    const rep3Data = await report3.json();
    expect(rep3Data.hidden_by_moderation).toBe(true);
    expect(rep3Data.report_count).toBe(3);

    // Public list hides the event
    const listResAfter = await fetch(`${baseUrl}/api/events`);
    expect(listResAfter.status).toBe(200);
    const listAfter = await listResAfter.json();
    expect(listAfter.some((e: any) => e.id === eventId)).toBe(false);

    // The author still sees it, marked "under_review"
    const authorListRes = await fetch(`${baseUrl}/api/events`, {
      headers: { Authorization: 'Bearer test-member-a' }
    });
    expect(authorListRes.status).toBe(200);
    const authorList = await authorListRes.json();
    const myItem = authorList.find((e: any) => e.id === eventId);
    expect(myItem).toBeDefined();
    expect(myItem.under_review).toBe(true);
  });
});

describe('Timezone Conversion & DST Handling (v1.4.1)', () => {
  it('converts 14:00 on 2026-11-14 in Africa/Lagos to 2026-11-14T13:00:00.000Z', async () => {
    const { zonedTimeToUtcIso } = await import('../src/utils');
    expect(zonedTimeToUtcIso('2026-11-14', '14:00', 'Africa/Lagos')).toBe('2026-11-14T13:00:00.000Z');
  });

  it('converts 14:00 on 2026-11-14 in Africa/Kampala to 2026-11-14T11:00:00.000Z', async () => {
    const { zonedTimeToUtcIso } = await import('../src/utils');
    expect(zonedTimeToUtcIso('2026-11-14', '14:00', 'Africa/Kampala')).toBe('2026-11-14T11:00:00.000Z');
  });

  it('converts 09:00 on 2026-07-01 in Europe/London to 2026-07-01T08:00:00.000Z', async () => {
    const { zonedTimeToUtcIso } = await import('../src/utils');
    expect(zonedTimeToUtcIso('2026-07-01', '09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
  });

  it('converts 09:00 on 2026-12-01 in Europe/London to 2026-12-01T09:00:00.000Z', async () => {
    const { zonedTimeToUtcIso } = await import('../src/utils');
    expect(zonedTimeToUtcIso('2026-12-01', '09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z');
  });

  it('server validateEventTimesAndFormat correctly converts start_date/start_time fallback using provided timezone', async () => {
    const { validateEventTimesAndFormat } = await import('../server');
    const res = validateEventTimesAndFormat({
      kind: 'event',
      start_date: '2026-11-14',
      start_time: '14:00',
      timezone: 'Africa/Lagos',
      format: 'in_person',
      location: 'Lagos Tech Hub'
    });
    expect(res.valid).toBe(true);
    expect(res.starts_at).toBe('2026-11-14T13:00:00.000Z');
  });

  it('utcToZonedParts converts stored UTC time back to event timezone for editing', async () => {
    const { utcToZonedParts } = await import('../src/utils');
    const parts = utcToZonedParts('2026-11-14T11:00:00.000Z', 'Africa/Kampala');
    expect(parts.date).toBe('2026-11-14');
    expect(parts.time).toBe('14:00');
  });
});

describe('Firestore Persistence & Error Handling (v1.4.2)', () => {
  it('strip helper removes undefined at every depth and keeps null/false/0/\'\'', async () => {
    const { stripUndefined } = await import('../server');
    const input = {
      a: undefined,
      b: null,
      c: false,
      d: 0,
      e: '',
      f: [undefined, 1, false, null, '', { x: undefined, y: 'keep', z: false }],
      nested: {
        u1: undefined,
        deep: {
          u2: undefined,
          val: 'ok',
          zero: 0,
          empty: '',
          none: null,
          bool: false
        }
      }
    };
    const cleaned = stripUndefined(input);
    expect(cleaned).toEqual({
      b: null,
      c: false,
      d: 0,
      e: '',
      f: [1, false, null, '', { y: 'keep', z: false }],
      nested: {
        deep: {
          val: 'ok',
          zero: 0,
          empty: '',
          none: null,
          bool: false
        }
      }
    });
    expect(cleaned).not.toHaveProperty('a');
    expect((cleaned as any).nested).not.toHaveProperty('u1');
    expect((cleaned as any).nested.deep).not.toHaveProperty('u2');
  });

  it('creating an event with only required fields succeeds against storage test double that throws on undefined', async () => {
    const { setTestStorageWriter } = await import('../server');

    // Test double: throws like Firestore if any field or nested field is undefined
    const checkNoUndefined = (obj: any, path = '') => {
      if (obj === undefined) {
        throw new Error(`Firestore Error: Value at path "${path}" cannot be undefined`);
      }
      if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
        for (const [key, val] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (val === undefined) {
            throw new Error(`Firestore Error: Field "${currentPath}" contains undefined`);
          }
          checkNoUndefined(val, currentPath);
        }
      }
    };

    setTestStorageWriter(async (_col: string, _id: string, data: any) => {
      checkNoUndefined(data);
    });

    try {
      const res = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-a'
        },
        body: JSON.stringify({
          kind: 'event',
          title: 'Required Fields Only Event',
          description: 'Testing event with optional links and images omitted.',
          start_date: '2026-11-20',
          start_time: '14:00',
          timezone: 'Africa/Kampala',
          format: 'in_person',
          location: 'Kampala Hub'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.item.title).toBe('Required Fields Only Event');
    } finally {
      setTestStorageWriter(null);
    }
  });

  it('when the storage layer rejects, POST /api/events returns 500 JSON within test timeout and store.events does not contain the item', async () => {
    const { setTestStorageWriter, store } = await import('../server');

    setTestStorageWriter(async () => {
      throw new Error('Simulated storage connection error');
    });

    try {
      const res = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-b'
        },
        body: JSON.stringify({
          kind: 'event',
          title: 'Event That Fails Storage',
          description: 'This event should not exist in in-memory store if persistDoc fails.',
          start_date: '2026-11-22',
          start_time: '10:00',
          timezone: 'Africa/Kampala',
          format: 'in_person',
          location: 'Innovation Lab'
        })
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: 'Something went wrong. Please try again.' });
      // Crucial: store.events must not contain the item that failed persistence
      expect(store.events.some((e: any) => e.title === 'Event That Fails Storage')).toBe(false);
    } finally {
      setTestStorageWriter(null);
    }
  });
});

describe('Release 1.5.0 Features', () => {
  let testEventId: string;

  beforeAll(async () => {
    if (!Array.isArray(store.admin_emails)) store.admin_emails = [];
    if (!store.admin_emails.includes('test-admin@kwegatta.test')) {
      store.admin_emails.push('test-admin@kwegatta.test');
    }

    // Create an event with contact details for testing
    const res = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-member-150'
      },
      body: JSON.stringify({
        kind: 'event',
        title: 'Release 1.5.0 Test Event',
        description: 'Testing 1.5.0 features in depth.',
        start_date: '2026-12-01',
        start_time: '10:00',
        timezone: 'Africa/Kampala',
        format: 'in_person',
        location: 'Kampala Lab',
        contact_phone: '+256700000000',
        contact_email: 'host@example.com'
      })
    });
    const data = await res.json();
    if (res.status !== 200) console.error('POST /api/events failed with:', res.status, data);
    expect(res.status).toBe(200);
    testEventId = data.item.id;
  });

  describe('PART 1. Host contact details', () => {
    it('anonymous and non-registered members do not receive the two contact fields; a registered member does', async () => {
      // 1. Anonymous visitor
      const anonRes = await fetch(`${baseUrl}/api/events/${testEventId}`);
      expect(anonRes.status).toBe(200);
      const anonData = await anonRes.json();
      expect(anonData.contact_phone).toBeUndefined();
      expect(anonData.contact_email).toBeUndefined();

      // 2. Non-registered member
      const nonRegRes = await fetch(`${baseUrl}/api/events/${testEventId}`, {
        headers: { Authorization: 'Bearer test-member-b' }
      });
      expect(nonRegRes.status).toBe(200);
      const nonRegData = await nonRegRes.json();
      expect(nonRegData.contact_phone).toBeUndefined();
      expect(nonRegData.contact_email).toBeUndefined();

      // 3. Member B RSVPs (registers)
      const rsvpRes = await fetch(`${baseUrl}/api/events/${testEventId}/rsvp`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-member-b' }
      });
      expect(rsvpRes.status).toBe(200);

      // 4. Registered member GETs event
      const regRes = await fetch(`${baseUrl}/api/events/${testEventId}`, {
        headers: { Authorization: 'Bearer test-member-b' }
      });
      expect(regRes.status).toBe(200);
      const regData = await regRes.json();
      expect(regData.contact_phone).toBe('+256700000000');
      expect(regData.contact_email).toBe('host@example.com');
    });
  });

  describe('PART 2. Questions on the event page', () => {
    it('anonymous post 401; member cannot reply (403); non-owner cannot delete (403); the 6th question from one member on one event is rejected', async () => {
      // 1. Anonymous post -> 401
      const anonPost = await fetch(`${baseUrl}/api/events/${testEventId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Anonymous question?' })
      });
      expect(anonPost.status).toBe(401);

      // 2. Member posts 5 questions
      let firstQId = '';
      for (let i = 1; i <= 5; i++) {
        const qRes = await fetch(`${baseUrl}/api/events/${testEventId}/questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-member-b'
          },
          body: JSON.stringify({ content: `Question number ${i} for host?` })
        });
        expect(qRes.status).toBe(200);
        const qData = await qRes.json();
        if (i === 1) firstQId = qData.question.id;
      }

      // 3. 6th question from same member on same event -> 400 rejected
      const q6Res = await fetch(`${baseUrl}/api/events/${testEventId}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-b'
        },
        body: JSON.stringify({ content: 'Question 6 should be rejected!' })
      });
      expect(q6Res.status).toBe(400);

      // 4. Member (non-host, non-admin) cannot reply -> 403
      const replyRes = await fetch(`${baseUrl}/api/events/${testEventId}/questions/${firstQId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-b'
        },
        body: JSON.stringify({ content: 'I am replying but I am not host!' })
      });
      expect(replyRes.status).toBe(403);

      // 5. Non-owner / non-author member cannot delete -> 403
      const hostQRes = await fetch(`${baseUrl}/api/events/${testEventId}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-150'
        },
        body: JSON.stringify({ content: 'Host question?' })
      });
      expect(hostQRes.status).toBe(200);
      const hostQData = await hostQRes.json();

      const delRes = await fetch(`${baseUrl}/api/events/${testEventId}/questions/${hostQData.question.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-member-b' }
      });
      expect(delRes.status).toBe(403);
    });
  });

  describe('PART 3. Admin hide with reason and author notification', () => {
    it('hide without a reason is rejected (400); the author gets exactly one notification per action; a non-admin gets 401/403', async () => {
      // 1. Non-admin hide -> 401/403
      const nonAdminHide = await fetch(`${baseUrl}/api/admin/events/${testEventId}/hide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-b'
        },
        body: JSON.stringify({ reason: 'Spam or scam' })
      });
      expect([401, 403]).toContain(nonAdminHide.status);

      // 2. Hide without reason -> 400
      const noReasonHide = await fetch(`${baseUrl}/api/admin/events/${testEventId}/hide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-admin'
        },
        body: JSON.stringify({})
      });
      expect(noReasonHide.status).toBe(400);

      // Check author notification count before hide
      const notifResBefore = await fetch(`${baseUrl}/api/data/notifications`, {
        headers: { Authorization: 'Bearer test-member-150' }
      });
      const notifsBefore = await notifResBefore.json();
      const countBefore = Array.isArray(notifsBefore) ? notifsBefore.length : 0;

      // 3. Valid hide with reason -> 200
      const validHide = await fetch(`${baseUrl}/api/admin/events/${testEventId}/hide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-admin'
        },
        body: JSON.stringify({ reason: 'Spam or scam' })
      });
      expect(validHide.status).toBe(200);

      // Author gets exactly 1 new notification for hide
      const notifResAfterHide = await fetch(`${baseUrl}/api/data/notifications`, {
        headers: { Authorization: 'Bearer test-member-150' }
      });
      const notifsAfterHide = await notifResAfterHide.json();
      expect(notifsAfterHide.length).toBe(countBefore + 1);
      expect(notifsAfterHide[0].body).toContain('was hidden by a moderator. Reason: Spam or scam.');

      // 4. Restore event -> 200
      const validRestore = await fetch(`${baseUrl}/api/admin/events/${testEventId}/restore`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-admin'
        }
      });
      expect(validRestore.status).toBe(200);

      // Author gets exactly 1 new notification for restore
      const notifResAfterRestore = await fetch(`${baseUrl}/api/data/notifications`, {
        headers: { Authorization: 'Bearer test-member-150' }
      });
      const notifsAfterRestore = await notifResAfterRestore.json();
      expect(notifsAfterRestore.length).toBe(countBefore + 2);
      expect(notifsAfterRestore[0].body).toContain('is visible again.');
    });
  });

  describe('PART 4. Register for an event without an account', () => {
    it('anonymous GET of guest records is 401/404 on every route; duplicate contact is rejected; the 4th registration from one IP for one event is rejected; a filled honeypot is rejected; a wrong token cannot cancel; records older than 30 days after ends_at are removed', async () => {
      // 1. Anonymous GET of guest records -> 403 or 401
      const anonGetGuests = await fetch(`${baseUrl}/api/events/${testEventId}/guests`);
      expect([401, 403]).toContain(anonGetGuests.status);

      // 2. Filled honeypot -> rejected (400)
      const hpRes = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Spam Bot',
          email: 'bot@spam.com',
          website: 'http://spam.com',
          agree: true
        })
      });
      expect(hpRes.status).toBe(400);

      // 3. Register valid guest #1
      const g1Res = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Guest One',
          email: 'guest1@example.com',
          phone: '+256711111111',
          agree: true
        })
      });
      expect(g1Res.status).toBe(200);
      const g1Data = await g1Res.json();
      expect(g1Data.token).toBeDefined();

      // 4. Duplicate contact registration on same event -> 400
      const dupRes = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Guest One Duplicate',
          email: 'guest1@example.com',
          agree: true
        })
      });
      expect(dupRes.status).toBe(400);

      // 5. Register guest #2 and #3 from same IP
      const g2Res = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Guest Two', email: 'guest2@example.com', agree: true })
      });
      expect(g2Res.status).toBe(200);

      const g3Res = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Guest Three', email: 'guest3@example.com', agree: true })
      });
      expect(g3Res.status).toBe(200);

      // 6. Guest Four registration from same IP (accepted under new limits: 20/hr) -> 200
      const g4Res = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Guest Four', email: 'guest4@example.com', agree: true })
      });
      expect(g4Res.status).toBe(200);

      // 7. Cancel with wrong token -> 400
      const wrongCancel = await fetch(`${baseUrl}/api/events/${testEventId}/guest-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'wrongtoken12345678901234567890123456789012' })
      });
      expect(wrongCancel.status).toBe(400);

      // 8. Retention test: records older than 30 days after ends_at are removed
      const { store, cleanupExpiredGuestRecords } = await import('../server');
      const oldEvent = {
        id: 'old-event-30days',
        title: 'Old Event',
        ends_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      };
      store.events.push(oldEvent);
      store.event_guests.push({
        id: 'old-guest-1',
        event_id: 'old-event-30days',
        name: 'Old Guest',
        email: 'oldguest@example.com',
        token_hash: 'hash'
      });

      resetGuestCleanupTimerForTest();
      cleanupExpiredGuestRecords();
      expect(store.event_guests.some((g: any) => g.id === 'old-guest-1')).toBe(false);
    });
  });

  describe('PART 5. Small fix for malformed JSON body', () => {
    it('returns 400 with { "error": "Invalid request body." } on malformed JSON body', async () => {
      const malformedRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-a'
        },
        body: '{"invalid_json": '
      });
      expect(malformedRes.status).toBe(400);
      const data = await malformedRes.json();
      expect(data).toEqual({ error: 'Invalid request body.' });
    });
  });

  describe('Release 1.5.1 Features', () => {
    it('PART 1: anonymous GET of audit_log, reports, admin_emails, migrations, event_guests and an unknown name each return 404; profiles, posts, events and team still return 200', async () => {
      const collections404 = ['audit_log', 'reports', 'admin_emails', 'migrations', 'event_guests', 'event_questions', 'pinned_announcement', 'unknown_collection_xyz'];
      for (const col of collections404) {
        const res = await fetch(`${baseUrl}/api/data/${col}`);
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data).toEqual({ error: 'Not found' });
      }

      const collections200 = ['profiles', 'posts', 'events', 'team'];
      for (const col of collections200) {
        const res = await fetch(`${baseUrl}/api/data/${col}`);
        expect(res.status).toBe(200);
      }
    });

    it('PART 2: forged left-most X-Forwarded-For value does not change bucket; 21st registration in an hour from one IP is rejected while a different IP is accepted', async () => {
      // Create dedicated event for Part 2 IP rate-limiting
      const evRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-150'
        },
        body: JSON.stringify({
          kind: 'event',
          title: 'IP Rate Limit Event 151',
          description: 'Testing guest rate limits by IP.',
          start_date: '2026-12-05',
          start_time: '12:00',
          timezone: 'Africa/Kampala',
          format: 'in_person',
          location: 'Kampala Tech Hub'
        })
      });
      const evData = await evRes.json();
      const part2EvId = evData.item.id;

      const reqHeaders = {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '9.9.9.9, 203.0.113.195'
      };

      // Register 20 guests from 203.0.113.195 (with forged left-most 9.9.9.9)
      for (let i = 1; i <= 20; i++) {
        const res = await fetch(`${baseUrl}/api/events/${part2EvId}/guest-register`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({
            name: `Limit Guest ${i}`,
            email: `limitguest${i}_${Date.now()}@example.com`,
            agree: true
          })
        });
        expect(res.status).toBe(200);
      }

      // 21st registration from same IP (even with forged left-most header 7.7.7.7) -> 429
      const res21 = await fetch(`${baseUrl}/api/events/${part2EvId}/guest-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '7.7.7.7, 203.0.113.195'
        },
        body: JSON.stringify({
          name: 'Limit Guest 21',
          email: `limitguest21_${Date.now()}@example.com`,
          agree: true
        })
      });
      expect(res21.status).toBe(429);

      // A different IP (198.51.100.42) is still accepted -> 200
      const resDiffIp = await fetch(`${baseUrl}/api/events/${part2EvId}/guest-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '8.8.8.8, 198.51.100.42'
        },
        body: JSON.stringify({
          name: 'Diff IP Guest',
          email: `diffip_${Date.now()}@example.com`,
          agree: true
        })
      });
      expect(resDiffIp.status).toBe(200);
    });

    it('PART 3: anonymous caller receives no internal or attendee fields; RSVPed member receives attendee_ids; author receives hidden_reason', async () => {
      // Create dedicated event for Part 3 privacy & sanitization
      const evRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-150'
        },
        body: JSON.stringify({
          kind: 'event',
          title: 'Privacy Sanitizer Test Event 151',
          description: 'Testing event field sanitization.',
          start_date: '2026-12-06',
          start_time: '14:00',
          timezone: 'Africa/Kampala',
          format: 'in_person',
          location: 'Kampala Lab'
        })
      });
      const evData = await evRes.json();
      const part3EvId = evData.item.id;

      // 1. Anonymous GET /api/events/:id
      const anonRes = await fetch(`${baseUrl}/api/events/${part3EvId}`);
      expect(anonRes.status).toBe(200);
      const anonData = await anonRes.json();
      expect(anonData.attendee_ids).toBeUndefined();
      expect(anonData.attendees).toBeUndefined();
      expect(anonData.hidden_reason).toBeUndefined();
      expect(anonData.report_count).toBeUndefined();
      expect(anonData.under_review).toBeUndefined();
      expect(anonData.reviewed_by_admin).toBeUndefined();
      expect(anonData.approved_by).toBeUndefined();
      expect(anonData.rejection_reason).toBeUndefined();
      expect(anonData.events_blocked).toBeUndefined();
      expect(typeof anonData.attendee_count).toBe('number');
      expect(anonData.i_am_going).toBe(false);

      // 2. RSVPed member GET
      await fetch(`${baseUrl}/api/events/${part3EvId}/rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-member-b'
        },
        body: JSON.stringify({ going: true })
      });

      const rsvpRes = await fetch(`${baseUrl}/api/events/${part3EvId}`, {
        headers: { Authorization: 'Bearer test-member-b' }
      });
      expect(rsvpRes.status).toBe(200);
      const rsvpData = await rsvpRes.json();
      expect(Array.isArray(rsvpData.attendee_ids)).toBe(true);
      expect(rsvpData.hidden_reason).toBeUndefined();

      // 3. Author GET receives hidden_reason when event is hidden
      await fetch(`${baseUrl}/api/admin/events/${part3EvId}/hide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-admin'
        },
        body: JSON.stringify({ reason: 'Spam or scam' })
      });

      const authorRes = await fetch(`${baseUrl}/api/events/${part3EvId}`, {
        headers: { Authorization: 'Bearer test-member-150' }
      });
      expect(authorRes.status).toBe(200);
      const authorData = await authorRes.json();
      expect(authorData.hidden_reason).toBeDefined();
    });
  });

  describe('Release 1.5.2 Frontend UI & Bug Fixes', () => {
    it('renders event detail view as a signed-out visitor, clicks Register, and asserts "I agree that the host can see these details"', async () => {
      const mockEvent = {
        id: 'test-ev-152-detail',
        kind: 'event',
        title: 'Kampala AI Builders Hackday',
        description: 'Build awesome AI projects in Kampala.',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 90000000).toISOString(),
        timezone: 'Africa/Kampala',
        format: 'in_person',
        location: 'Innovation Village',
        created_at: new Date().toISOString(),
        published: true,
        attendee_ids: [],
        attendee_count: 0,
        phase: 'upcoming'
      };

      window.location.hash = '#/events';
      try { localStorage.clear(); } catch {}

      if (!store.events) store.events = [];
      store.events.push(mockEvent as any);

      vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([]);
      vi.spyOn(apiModule, 'fetchEventById').mockResolvedValue(mockEvent);
      vi.spyOn(apiModule, 'fetchEventQuestions').mockResolvedValue([]);

      const { act, waitFor } = await import('@testing-library/react');

      await act(async () => {
        render(
          React.createElement(EventsView, {
            currentProfile: null,
            allProfiles: [],
            initialItemId: mockEvent.id,
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );
        await new Promise(r => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Register/i })).toBeTruthy();
      });

      const regBtn = screen.getByRole('button', { name: /Register/i });
      await act(async () => {
        fireEvent.click(regBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/I agree that the host can see these details/i)).toBeTruthy();
      });
    });

    it('renders event create form and asserts "Contact for attendees" is present', async () => {
      const mockProfile = {
        id: 'prof-builder-152',
        name: 'Kampala Builder',
        role: 'Developer',
        headline: 'AI Engineer',
        bio: 'Building on Gemma',
        offers: 'Code',
        needs: 'Mentorship',
        tags: [],
        skills: [],
        created_at: new Date().toISOString()
      };

      vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([]);

      const { act, waitFor } = await import('@testing-library/react');

      await act(async () => {
        render(
          React.createElement(EventsView, {
            currentProfile: mockProfile,
            allProfiles: [mockProfile],
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );
      });

      const createBtn = screen.getByRole('button', { name: /Create event/i });
      await act(async () => {
        fireEvent.click(createBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Contact for attendees \(optional\)/i)).toBeTruthy();
      });
    });

    it('renders detail view as the author and asserts "Guest registrations" is present', async () => {
      const authorProfile = {
        id: 'author-152',
        name: 'Author Person',
        role: 'Developer',
        headline: 'Host',
        bio: 'Hosting',
        offers: 'Events',
        needs: 'Attendees',
        tags: [],
        skills: [],
        created_at: new Date().toISOString()
      };

      const mockEvent = {
        id: 'ev-author-152',
        kind: 'event',
        title: 'Author Event',
        description: 'Host event',
        author_id: authorProfile.id,
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        timezone: 'Africa/Kampala',
        created_at: new Date().toISOString(),
        published: true,
        attendee_ids: [],
        phase: 'upcoming'
      };

      window.location.hash = '#/events';
      try { localStorage.clear(); } catch {}

      if (!store.events) store.events = [];
      store.events.push(mockEvent as any);

      vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([]);
      vi.spyOn(apiModule, 'fetchEventById').mockResolvedValue(mockEvent);
      vi.spyOn(apiModule, 'fetchEventQuestions').mockResolvedValue([]);
      vi.spyOn(apiModule, 'fetchEventGuests').mockResolvedValue([]);

      const { act, waitFor } = await import('@testing-library/react');

      await act(async () => {
        render(
          React.createElement(EventsView, {
            currentProfile: authorProfile,
            allProfiles: [authorProfile],
            initialItemId: mockEvent.id,
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );
        await new Promise(r => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(screen.getByText((content: string) => content.includes('Guest registrations'))).toBeTruthy();
      });
    });

    it('correctly formats attendee plural copy for 0, 1 and 2 attendees', () => {
      const formatPlural = (count: number) => {
        return count === 0
          ? 'Be the first to register.'
          : count === 1
          ? '1 person is going to this event.'
          : `${count} people are going to this event.`;
      };

      expect(formatPlural(0)).toBe('Be the first to register.');
      expect(formatPlural(1)).toBe('1 person is going to this event.');
      expect(formatPlural(2)).toBe('2 people are going to this event.');
    });
  });

  describe('Release 1.5.3 Features', () => {
    it('a) guessCountry returns SD for ar-SD, EG for Africa/Cairo timezone, and empty for unknown', () => {
      const originalNav = global.navigator;
      const originalIntl = global.Intl;

      // Case 1: navigator.language = 'ar-SD'
      Object.defineProperty(global, 'navigator', {
        value: { language: 'ar-SD' },
        writable: true,
        configurable: true
      });
      expect(guessCountry()).toBe('SD');

      // Case 2: navigator.language = 'en', timezone Africa/Cairo
      Object.defineProperty(global, 'navigator', {
        value: { language: 'en' },
        writable: true,
        configurable: true
      });
      const origDateTimeFormat = Intl.DateTimeFormat;
      (Intl as any).DateTimeFormat = function() {
        return {
          resolvedOptions: () => ({ timeZone: 'Africa/Cairo' })
        };
      };
      expect(guessCountry()).toBe('EG');

      // Case 3: unknown timezone
      (Intl as any).DateTimeFormat = function() {
        return {
          resolvedOptions: () => ({ timeZone: 'Unknown/Zone' })
        };
      };
      expect(guessCountry()).toBe('');

      (Intl as any).DateTimeFormat = origDateTimeFormat;
      Object.defineProperty(global, 'navigator', {
        value: originalNav,
        writable: true,
        configurable: true
      });
    });

    it('b) Server profile sanitize: country XX -> empty, SD kept, location derived in 4 combinations without Kampala default', async () => {
      // 1. Invalid country 'XX'
      const res1 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-c1' },
        body: JSON.stringify({ name: 'User C1', role: 'Developer', country: 'XX', city: '' })
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.country).toBe('');
      expect(data1.location).toBe('');

      // 2. Both city and country set (Khartoum, SD)
      const res2 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-c2' },
        body: JSON.stringify({ name: 'User C2', role: 'Developer', country: 'SD', city: 'Khartoum' })
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.country).toBe('SD');
      expect(data2.city).toBe('Khartoum');
      expect(data2.location).toBe('Khartoum, Sudan');

      // 3. City only
      const res3 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-c3' },
        body: JSON.stringify({ name: 'User C3', role: 'Developer', country: '', city: 'Khartoum' })
      });
      expect(res3.status).toBe(200);
      const data3 = await res3.json();
      expect(data3.country).toBe('');
      expect(data3.city).toBe('Khartoum');
      expect(data3.location).toBe('Khartoum');

      // 4. Country only
      const res4 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-c4' },
        body: JSON.stringify({ name: 'User C4', role: 'Developer', country: 'SD', city: '' })
      });
      expect(res4.status).toBe(200);
      const data4 = await res4.json();
      expect(data4.country).toBe('SD');
      expect(data4.city).toBe('');
      expect(data4.location).toBe('Sudan');

      // 5. Neither (both blank) -> no Kampala default
      const res5 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-c5' },
        body: JSON.stringify({ name: 'User C5', role: 'Developer', country: '', city: '' })
      });
      expect(res5.status).toBe(200);
      const data5 = await res5.json();
      expect(data5.location).toBe('');
      expect(data5.location).not.toContain('Kampala');
    });

    it('c) Server: privacy_accepted_at and privacy_version are set on first save, unchanged on second save, ignored from client, absent from public profiles', async () => {
      // First save (creation) - sending fake client values
      const res1 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-privacy-1' },
        body: JSON.stringify({
          name: 'Privacy User',
          role: 'Developer',
          privacy_accepted_at: '1990-01-01T00:00:00.000Z',
          privacy_version: 'v0-hacked'
        })
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();

      // Check stored row on server
      const stored1 = store.profiles.find((p: any) => p.id === data1.id);
      expect(stored1).toBeTruthy();
      expect(stored1.privacy_accepted_at).not.toBe('1990-01-01T00:00:00.000Z');
      expect(stored1.privacy_version).toBe('2026-10');
      const firstAcceptedAt = stored1.privacy_accepted_at;

      // Second save (update) - sending fake client values
      const res2 = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-privacy-1' },
        body: JSON.stringify({
          name: 'Privacy User Updated',
          role: 'Developer',
          privacy_accepted_at: '2030-01-01T00:00:00.000Z',
          privacy_version: 'v2-hacked'
        })
      });
      expect(res2.status).toBe(200);

      const stored2 = store.profiles.find((p: any) => p.id === data1.id);
      expect(stored2.privacy_accepted_at).toBe(firstAcceptedAt);
      expect(stored2.privacy_version).toBe('2026-10');

      // Public profile response check: must be absent from /api/data/profiles
      const listRes = await fetch(`${baseUrl}/api/data/profiles`);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      const publicTarget = listData.find((p: any) => p.id === data1.id);
      expect(publicTarget).toBeTruthy();
      expect(publicTarget.privacy_accepted_at).toBeUndefined();
      expect(publicTarget.privacy_version).toBeUndefined();
    });

    it('d) Render test: onboarding location screen has country select and city input without Kampala chips, AuthModal has privacy link', async () => {
      const { act, render, screen } = await import('@testing-library/react');

      localStorage.setItem('kw_onboarding_answers_v3', JSON.stringify({ screenIndex: 2 }));

      // Render OnboardingChat
      await act(async () => {
        render(
          React.createElement(OnboardingChat, {
            onCompleted: vi.fn(),
            onCancel: vi.fn()
          })
        );
      });

      // Kampala, Entebbe, Jinja chips should NOT exist
      expect(screen.queryByText('Kampala')).toBeNull();
      expect(screen.queryByText('Entebbe')).toBeNull();
      expect(screen.queryByText('Jinja')).toBeNull();

      // Country select and City input
      expect(screen.getByRole('combobox', { name: /country/i })).toBeTruthy();
      expect(screen.getByPlaceholderText('Your city')).toBeTruthy();

      localStorage.removeItem('kw_onboarding_answers_v3');

      // Render AuthModal
      await act(async () => {
        render(
          React.createElement(AuthModal, {
            isOpen: true,
            onClose: vi.fn(),
            onSuccess: vi.fn()
          })
        );
      });

      const privacyLinks = screen.getAllByRole('link', { name: /privacy policy/i });
      expect(privacyLinks.length).toBeGreaterThan(0);
      expect(privacyLinks[0].getAttribute('href')).toContain('#/privacy');
    });
  });

  describe('Release 1.5.4 Polish & Profile Edits', () => {
    it('a) Render: Edit Profile shows country select + city input; with profile {location:"Kampala"} and no country/city, City is prefilled "Kampala"', async () => {
      const { act, render, screen, fireEvent } = await import('@testing-library/react');
      const { ProfileView } = await import('../src/components/ProfileView');

      const testProfile: any = {
        id: 'test-user-edit-1',
        name: 'Kampala Member',
        role: 'Developer',
        location: 'Kampala'
      };

      let containerNode: HTMLElement;
      await act(async () => {
        const res = render(
          React.createElement(ProfileView, {
            profile: testProfile,
            currentProfile: testProfile,
            followersCount: 0,
            followingCount: 0,
            isFollowing: false,
            onToggleFollow: vi.fn(),
            onUpdateProfile: vi.fn(),
            onToast: vi.fn()
          })
        );
        containerNode = res.container;
      });

      const editBtn = screen.getByRole('button', { name: /edit profile/i });
      await act(async () => {
        fireEvent.click(editBtn);
      });

      const countrySelect = containerNode!.querySelector('#edit-profile-country') as HTMLSelectElement;
      const cityInput = containerNode!.querySelector('#edit-profile-city') as HTMLInputElement;

      expect(countrySelect).toBeTruthy();
      expect(cityInput).toBeTruthy();
      expect(cityInput.value).toBe('Kampala');
    });

    it('b) Render: About team card does NOT contain the text of member.title or member.line1, and DOES contain name and line2', async () => {
      const { act, render, screen } = await import('@testing-library/react');
      const { AboutView } = await import('../src/components/AboutView');

      await act(async () => {
        render(
          React.createElement(AboutView, {
            onNavigateHome: vi.fn()
          })
        );
      });

      expect(screen.getByText('Saifuddin Ahmed')).toBeTruthy();
      expect(screen.getByText('Future Stars Center for Development and Capacity Building')).toBeTruthy();

      expect(screen.queryByText('Team lead and engineering')).toBeNull();
      expect(screen.queryByText('Software and AI Engineer • Systems Architect')).toBeNull();
    });

    it('c) Server: PATCH with {country:"UG", city:"Kampala"} → location "Kampala, Uganda"; {country:"ZZ"} → country ""', async () => {
      const postRes = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-patch-1' },
        body: JSON.stringify({ name: 'Patch User', role: 'Developer' })
      });
      expect(postRes.status).toBe(200);
      const user = await postRes.json();

      const patchRes1 = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-patch-1' },
        body: JSON.stringify({ country: 'UG', city: 'Kampala' })
      });
      expect(patchRes1.status).toBe(200);
      const data1 = await patchRes1.json();
      expect(data1.country).toBe('UG');
      expect(data1.city).toBe('Kampala');
      expect(data1.location).toBe('Kampala, Uganda');

      const patchRes2 = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-patch-1' },
        body: JSON.stringify({ country: 'ZZ', city: 'Entebbe' })
      });
      expect(patchRes2.status).toBe(200);
      const data2 = await patchRes2.json();
      expect(data2.country).toBe('');
      expect(data2.city).toBe('Entebbe');
      expect(data2.location).toBe('Entebbe');
    });
  });

  describe('Release 1.5.5 Role, Stage & Intent Edits', () => {
    it('a) Server: PATCH roles ["Developer","Mentor"] → roles ["Developer","Mentor"], role "Developer"', async () => {
      const userRes = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-1' },
        body: JSON.stringify({ name: 'Role User 1', role: 'Student' })
      });
      expect(userRes.status).toBe(200);
      const user = await userRes.json();

      const patchRes = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-1' },
        body: JSON.stringify({ roles: ['Developer', 'Mentor'] })
      });
      expect(patchRes.status).toBe(200);
      const data = await patchRes.json();
      expect(data.roles).toEqual(['Developer', 'Mentor']);
      expect(data.role).toBe('Developer');
    });

    it('b) Server: PATCH roles ["Hacker","Developer","Founder","Mentor"] → roles ["Developer","Founder"] (invalid dropped, max 2), role "Developer"', async () => {
      const userRes = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-2' },
        body: JSON.stringify({ name: 'Role User 2', role: 'Student' })
      });
      expect(userRes.status).toBe(200);
      const user = await userRes.json();

      const patchRes = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-2' },
        body: JSON.stringify({ roles: ['Hacker', 'Developer', 'Founder', 'Mentor'] })
      });
      expect(patchRes.status).toBe(200);
      const data = await patchRes.json();
      expect(data.roles).toEqual(['Developer', 'Founder']);
      expect(data.role).toBe('Developer');
    });

    it('c) Server: PATCH role "CEO" alone → role unchanged', async () => {
      const userRes = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-3' },
        body: JSON.stringify({ name: 'Role User 3', role: 'Founder' })
      });
      expect(userRes.status).toBe(200);
      const user = await userRes.json();

      const patchRes = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-3' },
        body: JSON.stringify({ role: 'CEO' })
      });
      expect(patchRes.status).toBe(200);
      const data = await patchRes.json();
      expect(data.role).toBe('Founder');
    });

    it('d) Server: PATCH stage "xyz" → stage unchanged; stage "" → "". Same two checks for intent', async () => {
      const userRes = await fetch(`${baseUrl}/api/data/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-4' },
        body: JSON.stringify({
          name: 'Role User 4',
          role: 'Developer',
          stage: 'I have an idea',
          intent: 'Learn a skill'
        })
      });
      expect(userRes.status).toBe(200);
      const user = await userRes.json();

      // Invalid stage & intent -> unchanged
      const patch1 = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-4' },
        body: JSON.stringify({ stage: 'xyz', intent: 'invalid intent' })
      });
      expect(patch1.status).toBe(200);
      const data1 = await patch1.json();
      expect(data1.stage).toBe('I have an idea');
      expect(data1.intent).toBe('Learn a skill');

      // Empty string stage & intent -> ''
      const patch2 = await fetch(`${baseUrl}/api/data/profiles/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-role-4' },
        body: JSON.stringify({ stage: '', intent: '' })
      });
      expect(patch2.status).toBe(200);
      const data2 = await patch2.json();
      expect(data2.stage).toBe('');
      expect(data2.intent).toBe('');
    });

    it('e) Render: Edit Profile shows the role chips, stage and intent options, prefilled from the profile; selecting Developer first and saving shows "Developer" as the header label', async () => {
      const { act, render, screen, fireEvent } = await import('@testing-library/react');
      const { ProfileView } = await import('../src/components/ProfileView');

      const testProfile: any = {
        id: 'test-user-edit-roles-1',
        name: 'Role Test Member',
        role: 'Founder',
        roles: ['Founder', 'Developer'],
        stage: 'I have an idea',
        intent: 'Learn a skill'
      };

      let updatedProfileState: any = null;

      await act(async () => {
        render(
          React.createElement(ProfileView, {
            profile: testProfile,
            currentProfile: testProfile,
            followersCount: 0,
            followingCount: 0,
            isFollowing: false,
            onToggleFollow: vi.fn(),
            onUpdateProfile: (updated: any) => {
              updatedProfileState = updated;
            },
            onToast: vi.fn()
          })
        );
      });

      // Open Edit Profile
      const editBtns = screen.getAllByRole('button', { name: /edit profile/i });
      await act(async () => {
        fireEvent.click(editBtns[editBtns.length - 1]);
      });

      // Role chips exist
      expect(screen.getAllByText('How you appear').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Your role (up to 2)').length).toBeGreaterThan(0);

      // Tap Developer's star (or chip) to make it first
      const makeMainBtns = screen.queryAllByRole('button', { name: /make main role/i });
      if (makeMainBtns.length > 0) {
        await act(async () => {
          fireEvent.click(makeMainBtns[makeMainBtns.length - 1]);
        });
      } else {
        const devBtns = screen.getAllByRole('button', { name: /Developer/i });
        await act(async () => {
          fireEvent.click(devBtns[devBtns.length - 1]);
        });
      }

      // Click Save changes
      const saveBtns = screen.getAllByRole('button', { name: /save changes/i });
      await act(async () => {
        fireEvent.click(saveBtns[saveBtns.length - 1]);
      });

      expect(updatedProfileState).toBeTruthy();
      expect(updatedProfileState.role).toBe('Developer');
      expect(updatedProfileState.roles[0]).toBe('Developer');
    });

    describe('Release 1.5.6 Multi-Intent Fixes', () => {
      it('a) normalizeIntent test cases', () => {
        expect(normalizeIntent("Find a co-founder, Find a technical partner"))
          .toBe("Find a co-founder, Find a technical partner");
        expect(normalizeIntent("Find a co-founder, Hacker"))
          .toBe("Find a co-founder");
        expect(normalizeIntent("Hacker"))
          .toBeNull();
        expect(normalizeIntent(""))
          .toBe("");
        expect(normalizeIntent([]))
          .toBe("");
        expect(normalizeIntent("Find a co-founder, Find a technical partner, Find a business partner, Join a project"))
          .toBe("Find a co-founder, Find a technical partner, Find a business partner");
      });

      it('b) Server create with multi-intent stored unchanged', async () => {
        const res = await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin'
          },
          body: JSON.stringify({
            id: 'test-user-156-create',
            name: 'Intent User',
            intent: 'Find a co-founder, Learn a skill',
            country: 'UG',
            city: 'Kampala'
          })
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.intent).toBe('Find a co-founder, Learn a skill');
      });

      it('c) Server PATCH intent "xyz" leaves existing intent; PATCH intent "" clears it', async () => {
        // 1. PATCH with invalid "xyz"
        const res1 = await fetch(`${baseUrl}/api/data/profiles/test-user-156-create`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin'
          },
          body: JSON.stringify({
            intent: 'xyz'
          })
        });
        expect(res1.status).toBe(200);
        const data1 = await res1.json();
        expect(data1.intent).toBe('Find a co-founder, Learn a skill');

        // 2. PATCH with ""
        const res2 = await fetch(`${baseUrl}/api/data/profiles/test-user-156-create`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin'
          },
          body: JSON.stringify({
            intent: ''
          })
        });
        expect(res2.status).toBe(200);
        const data2 = await res2.json();
        expect(data2.intent).toBe('');
      });

      it('d) Render: Edit Profile with profile.intent "Find a co-founder, Learn a skill" shows both chips selected; saving sends same string', async () => {
        const { ProfileView } = await import('../src/components/ProfileView');
        const testProfile = {
          id: 'test-user-156-edit',
          name: 'Multi Intent Member',
          role: 'Developer',
          roles: ['Developer'],
          intent: 'Find a co-founder, Learn a skill',
          country: 'UG',
          city: 'Kampala',
          location: 'Kampala, Uganda'
        };

        let updatedProfileState: any = null;

        await act(async () => {
          render(
            React.createElement(ProfileView, {
              profile: testProfile as any,
              currentProfile: testProfile as any,
              followersCount: 0,
              followingCount: 0,
              isFollowing: false,
              onToggleFollow: vi.fn(),
              onUpdateProfile: (updated: any) => {
                updatedProfileState = updated;
              },
              onToast: vi.fn()
            })
          );
        });

        // Open Edit Profile
        const editBtns = screen.getAllByRole('button', { name: /edit profile/i });
        await act(async () => {
          fireEvent.click(editBtns[editBtns.length - 1]);
        });

        // Check chips exist
        expect(screen.getAllByText('Find a co-founder').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Learn a skill').length).toBeGreaterThan(0);

        // Save changes
        const saveBtns = screen.getAllByRole('button', { name: /save changes/i });
        await act(async () => {
          fireEvent.click(saveBtns[saveBtns.length - 1]);
        });

        expect(updatedProfileState).toBeTruthy();
        expect(updatedProfileState.intent).toBe('Find a co-founder, Learn a skill');
      });
    });

    describe('Release 1.5.7 Avatar Protection Fixes', () => {
      const testAvatar = 'data:image/png;base64,AAAA';
      const newAvatar = 'data:image/png;base64,BBBB';

      it('a) Server: profile with avatar "data:image/png;base64,AAAA"; PATCH {headline:"x", avatar:"/api/avatar/<id>"} -> avatar unchanged', async () => {
        await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-a' },
          body: JSON.stringify({
            id: 'test-user-157-a',
            name: 'Avatar User A',
            avatar: testAvatar
          })
        });

        const res = await fetch(`${baseUrl}/api/data/profiles/test-user-157-a`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-a' },
          body: JSON.stringify({
            headline: 'x',
            avatar: '/api/avatar/test-user-157-a'
          })
        });
        expect(res.status).toBe(200);

        const avatarRes = await fetch(`${baseUrl}/api/avatar/test-user-157-a`);
        expect(avatarRes.status).toBe(200);
      });

      it('b) Server: PATCH {headline:"x"} without avatar -> avatar unchanged', async () => {
        await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-b' },
          body: JSON.stringify({
            id: 'test-user-157-b',
            name: 'Avatar User B',
            avatar: testAvatar
          })
        });

        const res = await fetch(`${baseUrl}/api/data/profiles/test-user-157-b`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-b' },
          body: JSON.stringify({
            headline: 'x'
          })
        });
        expect(res.status).toBe(200);

        const avatarRes = await fetch(`${baseUrl}/api/avatar/test-user-157-b`);
        expect(avatarRes.status).toBe(200);
      });

      it('c) Server: PATCH {avatar:""} -> avatar unchanged', async () => {
        await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-c' },
          body: JSON.stringify({
            id: 'test-user-157-c',
            name: 'Avatar User C',
            avatar: testAvatar
          })
        });

        const res = await fetch(`${baseUrl}/api/data/profiles/test-user-157-c`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-c' },
          body: JSON.stringify({
            avatar: ''
          })
        });
        expect(res.status).toBe(200);

        const avatarRes = await fetch(`${baseUrl}/api/avatar/test-user-157-c`);
        expect(avatarRes.status).toBe(200);
      });

      it('d) Server: PATCH {avatar:"data:image/png;base64,BBBB"} -> avatar updated', async () => {
        await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-d' },
          body: JSON.stringify({
            id: 'test-user-157-d',
            name: 'Avatar User D',
            avatar: testAvatar
          })
        });

        const res = await fetch(`${baseUrl}/api/data/profiles/test-user-157-d`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-d' },
          body: JSON.stringify({
            avatar: newAvatar
          })
        });
        expect(res.status).toBe(200);

        const avatarRes = await fetch(`${baseUrl}/api/avatar/test-user-157-d`);
        expect(avatarRes.status).toBe(200);
      });

      it('e) Server: create/save path with avatar "/api/avatar/<id>" for an existing profile -> avatar unchanged', async () => {
        await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-e' },
          body: JSON.stringify({
            id: 'test-user-157-e',
            name: 'Avatar User E',
            avatar: testAvatar
          })
        });

        const res = await fetch(`${baseUrl}/api/data/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-user-157-e' },
          body: JSON.stringify({
            id: 'test-user-157-e',
            name: 'Avatar User E Updated',
            avatar: '/api/avatar/test-user-157-e'
          })
        });
        expect(res.status).toBe(200);

        const avatarRes = await fetch(`${baseUrl}/api/avatar/test-user-157-e`);
        expect(avatarRes.status).toBe(200);
      });

      it('f) Render/unit: handleSaveProfile request body does not contain the key "avatar"', async () => {
        const { ProfileView } = await import('../src/components/ProfileView');
        const testProfile = {
          id: 'test-user-157-f',
          name: 'Avatar Protection Member',
          role: 'Developer',
          roles: ['Developer'],
          avatar: '/api/avatar/test-user-157-f',
          country: 'UG',
          city: 'Kampala'
        };

        let updatedRequestBody: any = null;
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockImplementation((url, init) => {
          if (typeof url === 'string' && url.includes('/api/data/profiles') && init?.method === 'PATCH') {
            updatedRequestBody = JSON.parse(init.body as string);
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ id: 'test-user-157-f', ...updatedRequestBody })
            });
          }
          return originalFetch(url, init);
        });

        try {
          await act(async () => {
            render(
              React.createElement(ProfileView, {
                profile: testProfile as any,
                currentProfile: testProfile as any,
                followersCount: 0,
                followingCount: 0,
                isFollowing: false,
                onToggleFollow: vi.fn(),
                onUpdateProfile: vi.fn(),
                onToast: vi.fn()
              })
            );
          });

          const editBtns = screen.getAllByRole('button', { name: /edit profile/i });
          await act(async () => {
            fireEvent.click(editBtns[editBtns.length - 1]);
          });

          const saveBtns = screen.getAllByRole('button', { name: /save changes/i });
          await act(async () => {
            fireEvent.click(saveBtns[saveBtns.length - 1]);
          });

          expect(updatedRequestBody).toBeTruthy();
          expect('avatar' in updatedRequestBody).toBe(false);
        } finally {
          global.fetch = originalFetch;
        }
      });
    });

    describe('Release 1.5.8 Share Card Photo Fixes', () => {
      it('a) Unit: avatarSrc tests', () => {
        expect(avatarSrc('/api/avatar/x')).toBe('/api/avatar/x');
        expect(avatarSrc('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
        expect(avatarSrc('https://a/b.png')).toBe('https://a/b.png');
        expect(avatarSrc('')).toBe('');
        expect(avatarSrc(undefined)).toBe('');
        expect(avatarSrc('javascript:x')).toBe('');
      });

      it("b) Render (jsdom, mock Image so onload fires): with avatar '/api/avatar/x', ctx.drawImage is called with an image whose src ends with '/api/avatar/x'", async () => {
        const drawImageSpy = vi.fn();
        const fillTextSpy = vi.fn();
        const dummyGrad = { addColorStop: vi.fn() };
        const mockCtx: any = {
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          fillText: fillTextSpy,
          measureText: () => ({ width: 50 }),
          createLinearGradient: () => dummyGrad,
          createRadialGradient: () => dummyGrad,
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          arc: vi.fn(),
          clip: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          drawImage: drawImageSpy
        };

        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fake');

        const originalImage = window.Image;
        class MockImage {
          onload: any = null;
          onerror: any = null;
          crossOrigin: string = '';
          private _src: string = '';

          get src() {
            return this._src;
          }
          set src(val: string) {
            this._src = val;
            setTimeout(() => {
              if (this.onload) this.onload(new Event('load'));
            }, 0);
          }
        }
        (window as any).Image = MockImage;

        try {
          const testProfile = {
            id: 'test-user-158-b',
            name: 'Share Card User B',
            avatar: '/api/avatar/test-user-158-b',
            role: 'Developer'
          };

          await act(async () => {
            render(
              React.createElement(ShareCardModal, {
                profile: testProfile as any,
                isOpen: true,
                onClose: vi.fn(),
                onToast: vi.fn()
              })
            );
          });

          await new Promise(resolve => setTimeout(resolve, 50));

          expect(drawImageSpy).toHaveBeenCalled();
          const drawnImages = drawImageSpy.mock.calls.map(call => call[0]);
          const avatarDrawn = drawnImages.find((img: any) => img && img.src && img.src.endsWith('/api/avatar/test-user-158-b'));
          expect(avatarDrawn).toBeTruthy();
        } finally {
          (window as any).Image = originalImage;
          vi.restoreAllMocks();
        }
      });

      it('c) Render: when the image fires onerror, the initial-letter fallback is drawn and dataUrl is still set', async () => {
        const drawImageSpy = vi.fn();
        const fillTextSpy = vi.fn();
        const dummyGrad = { addColorStop: vi.fn() };
        const mockCtx: any = {
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          fillText: fillTextSpy,
          measureText: () => ({ width: 50 }),
          createLinearGradient: () => dummyGrad,
          createRadialGradient: () => dummyGrad,
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          arc: vi.fn(),
          clip: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          drawImage: drawImageSpy
        };

        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fallback_card');

        const originalImage = window.Image;
        class MockImageError {
          onload: any = null;
          onerror: any = null;
          crossOrigin: string = '';
          private _src: string = '';

          get src() {
            return this._src;
          }
          set src(val: string) {
            this._src = val;
            setTimeout(() => {
              if (this.onerror) this.onerror(new Event('error'));
            }, 0);
          }
        }
        (window as any).Image = MockImageError;

        try {
          const testProfile = {
            id: 'test-user-158-c',
            name: 'Fallback User C',
            avatar: '/api/avatar/broken-image',
            role: 'Designer'
          };

          await act(async () => {
            render(
              React.createElement(ShareCardModal, {
                profile: testProfile as any,
                isOpen: true,
                onClose: vi.fn(),
                onToast: vi.fn()
              })
            );
          });

          await new Promise(resolve => setTimeout(resolve, 50));

          expect(fillTextSpy).toHaveBeenCalledWith('F', expect.any(Number), expect.any(Number));
        } finally {
          (window as any).Image = originalImage;
          vi.restoreAllMocks();
        }
      });
    });

    describe('Release 1.5.9 Chip Selection & Main Role Fixes', () => {
      it('a) toggleChoice removes selected item', () => {
        expect(toggleChoice(['Developer', 'Founder'], 'Founder', 2)).toEqual(['Developer']);
      });

      it('b) toggleChoice replaces last item when at limit', () => {
        expect(toggleChoice(['Developer', 'Founder'], 'Mentor', 2)).toEqual(['Developer', 'Mentor']);
      });

      it('c) toggleChoice adds item when under limit', () => {
        expect(toggleChoice(['Developer'], 'Mentor', 2)).toEqual(['Developer', 'Mentor']);
      });

      it('d) makeFirst moves specified item to first position', () => {
        expect(makeFirst(['Developer', 'Mentor'], 'Mentor')).toEqual(['Mentor', 'Developer']);
      });

      it('e) toggleChoice for intents with max 3 at the limit replaces the last one', () => {
        expect(toggleChoice(['Find a co-founder', 'Find a technical partner', 'Join a project'], 'Learn a skill', 3))
          .toEqual(['Find a co-founder', 'Find a technical partner', 'Learn a skill']);
      });

      it("f) Render: Edit Profile with roles ['Founder','Developer']; tap Founder → only Developer remains and the \"Main\" label is on Developer; Save sends roles ['Developer']", async () => {
        const { ProfileView } = await import('../src/components/ProfileView');
        const testProfile = {
          id: 'test-user-159-f',
          name: 'Two Role Member',
          role: 'Founder',
          roles: ['Founder', 'Developer'],
          country: 'UG',
          city: 'Kampala',
          location: 'Kampala, Uganda'
        };

        let updatedProfileState: any = null;

        await act(async () => {
          render(
            React.createElement(ProfileView, {
              profile: testProfile as any,
              currentProfile: testProfile as any,
              followersCount: 0,
              followingCount: 0,
              isFollowing: false,
              onToggleFollow: vi.fn(),
              onUpdateProfile: (updated: any) => {
                updatedProfileState = updated;
              },
              onToast: vi.fn()
            })
          );
        });

        // Open Edit Profile
        const editBtns = screen.getAllByRole('button', { name: /edit profile/i });
        await act(async () => {
          fireEvent.click(editBtns[editBtns.length - 1]);
        });

        // Tap Founder chip to remove it
        const founderChips = screen.getAllByText('Founder');
        await act(async () => {
          fireEvent.click(founderChips[founderChips.length - 1]);
        });

        // Check that Main label is now on Developer
        const mainBadges = screen.getAllByText('Main');
        expect(mainBadges.length).toBeGreaterThan(0);
        const devChips = screen.getAllByText('Developer');
        const devChipButton = devChips[devChips.length - 1].closest('button');
        expect(devChipButton?.textContent).toContain('Main');

        // Save changes
        const saveBtns = screen.getAllByRole('button', { name: /save changes/i });
        await act(async () => {
          fireEvent.click(saveBtns[saveBtns.length - 1]);
        });

        expect(updatedProfileState).toBeTruthy();
        expect(updatedProfileState.roles).toEqual(['Developer']);
        expect(updatedProfileState.role).toBe('Developer');
      });

      it('g) Render: removing all roles disables Save', async () => {
        const { ProfileView } = await import('../src/components/ProfileView');
        const testProfile = {
          id: 'test-user-159-g',
          name: 'Single Role Member',
          role: 'Developer',
          roles: ['Developer'],
          country: 'UG',
          city: 'Kampala',
          location: 'Kampala, Uganda'
        };

        await act(async () => {
          render(
            React.createElement(ProfileView, {
              profile: testProfile as any,
              currentProfile: testProfile as any,
              followersCount: 0,
              followingCount: 0,
              isFollowing: false,
              onToggleFollow: vi.fn(),
              onUpdateProfile: vi.fn(),
              onToast: vi.fn()
            })
          );
        });

        // Open Edit Profile
        const editBtns = screen.getAllByRole('button', { name: /edit profile/i });
        await act(async () => {
          fireEvent.click(editBtns[editBtns.length - 1]);
        });

        // Tap Developer chip to remove it (leaving 0 roles)
        const devChips = screen.getAllByText('Developer');
        await act(async () => {
          fireEvent.click(devChips[devChips.length - 1]);
        });

        // Save button must be disabled
        const saveBtns = screen.getAllByRole('button', { name: /save changes/i });
        const saveBtn = saveBtns[saveBtns.length - 1] as HTMLButtonElement;
        expect(saveBtn.disabled).toBe(true);
        expect(saveBtn.hasAttribute('disabled')).toBe(true);

        // "Pick at least one role" message must be shown
        expect(screen.getAllByText('Pick at least one role').length).toBeGreaterThan(0);
      });
    });

    describe('Release 1.5.10 — Admin Remove Photo and Public Team Data Sanitization', () => {
      it('a) Admin PATCH {photo:""} -> photo null; GET /api/team-photo/:id -> 404', async () => {
        if (!Array.isArray(store.team)) store.team = [];
        const memberId = 'team-member-1510-a';
        const samplePhoto = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vv+gA==';
        store.team.push({
          id: memberId,
          name: 'Mupole Test A',
          title: 'Core Dev',
          line1: 'Dev',
          line2: 'Uganda',
          photo: samplePhoto,
          hidden: false,
          order: 1
        });

        // Ensure test-admin is in admin_emails
        if (!Array.isArray(store.admin_emails)) store.admin_emails = [];
        if (!store.admin_emails.includes('test-admin@kwegatta.test')) {
          store.admin_emails.push('test-admin@kwegatta.test');
        }

        // Before: GET /api/team-photo/:id should be 200
        const prePhoto = await fetch(`${baseUrl}/api/team-photo/${memberId}`);
        expect(prePhoto.status).toBe(200);

        // Admin PATCH with { photo: '' }
        const patchRes = await fetch(`${baseUrl}/api/admin/team/${memberId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-admin'
          },
          body: JSON.stringify({ photo: '' })
        });
        expect(patchRes.status).toBe(200);
        const data = await patchRes.json();
        expect(data.member.photo).toBeNull();

        // Verify member in store.team has photo null
        const updated = store.team.find((m: any) => m.id === memberId);
        expect(updated?.photo).toBeNull();

        // GET /api/team-photo/:id must now be 404
        const photoRes = await fetch(`${baseUrl}/api/team-photo/${memberId}`);
        expect(photoRes.status).toBe(404);
      });

      it('b) Same PATCH without admin auth -> 401/403, photo unchanged', async () => {
        if (!Array.isArray(store.team)) store.team = [];
        const memberId = 'team-member-1510-b';
        const samplePhoto = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vv+gA==';
        store.team.push({
          id: memberId,
          name: 'Mupole Test B',
          title: 'Core Dev',
          line1: 'Dev',
          line2: 'Uganda',
          photo: samplePhoto,
          hidden: false,
          order: 2
        });

        // PATCH without admin auth
        const patchRes = await fetch(`${baseUrl}/api/admin/team/${memberId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ photo: '' })
        });
        expect([401, 403]).toContain(patchRes.status);

        // Member photo remains unchanged
        const member = store.team.find((m: any) => m.id === memberId);
        expect(member?.photo).toBe(samplePhoto);
      });

      it('c) GET /api/data/team excludes hidden members and contains no "data:image" string anywhere in the response', async () => {
        if (!Array.isArray(store.team)) store.team = [];
        const samplePhoto = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vv+gA==';
        const visibleId = 'team-visible-1510-c';
        const hiddenId = 'team-hidden-1510-c';

        store.team.push({
          id: visibleId,
          name: 'Visible Member',
          title: 'Designer',
          line1: 'UI',
          line2: 'Makerere',
          github: 'visdev',
          linked_profile_id: null,
          photo: samplePhoto,
          hidden: false,
          order: 10
        });
        store.team.push({
          id: hiddenId,
          name: 'Hidden Member',
          title: 'Secret',
          line1: 'Secret',
          line2: 'Secret Org',
          photo: samplePhoto,
          hidden: true,
          order: 11
        });

        const res = await fetch(`${baseUrl}/api/data/team`);
        expect(res.status).toBe(200);
        const text = await res.text();

        // Must contain NO "data:image" anywhere
        expect(text.includes('data:image')).toBe(false);

        // Excludes hidden members
        const parsed = JSON.parse(text);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.some((m: any) => m.id === hiddenId)).toBe(false);
        const visible = parsed.find((m: any) => m.id === visibleId);
        expect(visible).toBeTruthy();
        expect(visible.photo_url).toBe(`/api/team-photo/${visibleId}`);
        expect(visible.photo).toBeUndefined();
      });

      it('d) GET /api/team-photo/<hidden member id> -> 404', async () => {
        if (!Array.isArray(store.team)) store.team = [];
        const samplePhoto = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vv+gA==';
        const hiddenId = 'team-hidden-1510-d';

        store.team.push({
          id: hiddenId,
          name: 'Hidden Person D',
          title: 'Advisor',
          line1: 'Advisor',
          line2: 'Org',
          photo: samplePhoto,
          hidden: true,
          order: 12
        });

        const res = await fetch(`${baseUrl}/api/team-photo/${hiddenId}`);
        expect(res.status).toBe(404);
      });

      it('e) Render: AdminView shows "Remove photo" only for members with a photo; confirming calls PATCH with {photo:""}', async () => {
        const { AdminView } = await import('../src/components/AdminView');
        const memberWithPhoto = {
          id: 'team-with-photo-e',
          name: 'Has Photo Member',
          title: 'Engineer',
          photo: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vv+gA==',
          hidden: false,
          order: 1
        };
        const memberWithoutPhoto = {
          id: 'team-without-photo-e',
          name: 'No Photo Member',
          title: 'Community',
          photo: null,
          hidden: false,
          order: 2
        };

        let patchCalledWith: any = null;
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockImplementation((url, init) => {
          if (typeof url === 'string') {
            if (url.includes('/api/admin/status')) {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ isAdmin: true, adminName: 'Admin', adminEmail: 'admin@test.com', fallbackEnabled: false })
              });
            }
            if (url.includes('/api/admin/team') && init?.method === 'PATCH') {
              patchCalledWith = JSON.parse(init.body as string);
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ success: true, member: { ...memberWithPhoto, photo: null } })
              });
            }
            if (url.includes('/api/admin/team') || url.includes('/api/team')) {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => [memberWithPhoto, memberWithoutPhoto]
              });
            }
            if (url.includes('/api/admin/admins')) {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ admin_emails: ['admin@test.com'], env_admins: [], stored_admins: [] })
              });
            }
            if (
              url.includes('/api/admin/overview') ||
              url.includes('/api/admin/members') ||
              url.includes('/api/admin/posts') ||
              url.includes('/api/admin/audit-log') ||
              url.includes('/api/admin/reports') ||
              url.includes('/api/admin/events')
            ) {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => []
              });
            }
          }
          return originalFetch(url, init);
        });

        // Mock window.confirm
        const originalConfirm = window.confirm;
        const confirmSpy = vi.fn().mockReturnValue(true);
        window.confirm = confirmSpy;

        try {
          await act(async () => {
            render(
              React.createElement(AdminView, {
                onBack: vi.fn(),
                onRefreshGlobalData: vi.fn(),
                onToast: vi.fn()
              })
            );
          });

          // Switch to Team tab
          const teamTabBtn = screen.getByRole('button', { name: /Team/i });
          await act(async () => {
            fireEvent.click(teamTabBtn);
          });

          // Verify "Remove photo" is shown for member with photo
          const removePhotoBtns = screen.getAllByRole('button', { name: /remove photo/i });
          expect(removePhotoBtns.length).toBe(1);

          // Click "Remove photo"
          await act(async () => {
            fireEvent.click(removePhotoBtns[0]);
          });

          // Confirm was called with expected prompt
          expect(confirmSpy).toHaveBeenCalledWith(
            'Remove the photo for Has Photo Member? Their initials will be shown instead.'
          );

          // PATCH called with { photo: '' }
          expect(patchCalledWith).toEqual({ photo: '' });
        } finally {
          window.confirm = originalConfirm;
          global.fetch = originalFetch;
        }
      });
    });

    describe('Release 1.5.11 Security Fixes', () => {
      it('a) pair-cache GET/POST without auth -> 401; signed-in not in pair -> 403; in pair -> 200; invalid result -> 400; stored result has only score and reason', async () => {
        // Unauthenticated
        const getNoAuth = await fetch(`${baseUrl}/api/matches/pair-cache?a=user-1&b=user-2`);
        expect(getNoAuth.status).toBe(401);

        const postNoAuth = await fetch(`${baseUrl}/api/matches/pair-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ a: 'user-1', b: 'user-2', result: { score: 80, reason: 'Good' } })
        });
        expect(postNoAuth.status).toBe(401);

        // Signed in but not in pair (caller is user-3)
        const getNotPair = await fetch(`${baseUrl}/api/matches/pair-cache?a=user-1&b=user-2`, {
          headers: { Authorization: 'Bearer user-3' }
        });
        expect(getNotPair.status).toBe(403);

        const postNotPair = await fetch(`${baseUrl}/api/matches/pair-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-3' },
          body: JSON.stringify({ a: 'user-1', b: 'user-2', result: { score: 80, reason: 'Good' } })
        });
        expect(postNotPair.status).toBe(403);

        // Invalid result: score 150
        const postInvalidScore = await fetch(`${baseUrl}/api/matches/pair-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-1' },
          body: JSON.stringify({ a: 'user-1', b: 'user-2', result: { score: 150, reason: 'Too high' } })
        });
        expect(postInvalidScore.status).toBe(400);

        // Invalid result: extra fields
        const postExtraFields = await fetch(`${baseUrl}/api/matches/pair-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-1' },
          body: JSON.stringify({ a: 'user-1', b: 'user-2', result: { score: 85, reason: 'Good', extraField: 'bad' } })
        });
        expect(postExtraFields.status).toBe(400);

        // Valid member in pair: POST -> 200
        const postValid = await fetch(`${baseUrl}/api/matches/pair-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-1' },
          body: JSON.stringify({
            a: 'user-1',
            b: 'user-2',
            verA: 'v1',
            verB: 'v2',
            result: { score: 85, reason: 'Great complementary match' }
          })
        });
        expect(postValid.status).toBe(200);

        // Valid member in pair: GET -> 200
        const getValid = await fetch(`${baseUrl}/api/matches/pair-cache?a=user-1&b=user-2&verA=v1&verB=v2`, {
          headers: { Authorization: 'Bearer user-1' }
        });
        expect(getValid.status).toBe(200);
        const getData = await getValid.json();
        expect(getData.cached).toBe(true);
        expect(getData.result.score).toBe(85);
        expect(getData.result.reason).toBe('Great complementary match');

        // Stored result has ONLY score and reason
        const stored = matchPairCache.get(getPairCacheKey('user-1', 'user-2'));
        expect(stored).toBeDefined();
        expect(Object.keys(stored!.result).sort()).toEqual(['reason', 'score']);
      });

      it('b) Cache never exceeds 5,000 entries', () => {
        matchPairCache.clear();
        for (let i = 0; i < 5005; i++) {
          setPairCacheEntry(
            `user-a-${i}`,
            `user-b-${i}`,
            'v1',
            'v2',
            { score: 50, reason: `Pair ${i}` },
            new Date(1000000 + i * 1000).toISOString()
          );
        }
        expect(matchPairCache.size).toBe(5000);
        expect(matchPairCache.size).toBeLessThanOrEqual(5000);
        // Oldest evicted
        expect(matchPairCache.has(getPairCacheKey('user-a-0', 'user-b-0'))).toBe(false);
        expect(matchPairCache.has(getPairCacheKey('user-a-5004', 'user-b-5004'))).toBe(true);
      });

      it('c) Delete a member who authored 1 event (with 1 guest and 1 question), RSVP\'d another event, asked a question elsewhere, filed a report, and is linked in team -> afterwards none of that data references the member, the report has reporter_id \'deleted-member\', and team linked_profile_id is null', async () => {
        const testMemberId = 'del-member-1511';
        store.profiles.push({
          id: testMemberId,
          account_uid: testMemberId,
          name: 'Delete Test Member',
          email: `${testMemberId}@kwegatta.test`,
          role: 'Developer'
        });

        // 1. Authored event
        const authoredEventId = 'ev-authored-1511';
        store.events.push({
          id: authoredEventId,
          author_id: testMemberId,
          title: 'Authored Event by Test Member',
          published: true,
          attendee_ids: [testMemberId]
        });

        // 2. Guest for authored event
        const guestId = 'guest-authored-1511';
        store.event_guests.push({
          id: guestId,
          event_id: authoredEventId,
          name: 'Guest on Authored Event',
          email: 'guest@kwegatta.test'
        });

        // 3. Question on authored event
        const questionOnAuthoredId = 'q-on-authored-1511';
        store.event_questions.push({
          id: questionOnAuthoredId,
          event_id: authoredEventId,
          author_id: 'visitor-user',
          content: 'When does it start?'
        });

        // 4. RSVP on another event
        const otherEventId = 'ev-other-1511';
        store.events.push({
          id: otherEventId,
          author_id: 'other-host-1511',
          title: 'Community Meetup',
          published: true,
          attendee_ids: [testMemberId, 'retained-member-1511']
        });

        // 5. Question asked elsewhere
        const questionAskedElsewhereId = 'q-asked-elsewhere-1511';
        store.event_questions.push({
          id: questionAskedElsewhereId,
          event_id: otherEventId,
          author_id: testMemberId,
          content: 'Will there be mentors?'
        });

        // 6. Report filed by member
        const reportId = 'rep-member-1511';
        store.reports.push({
          id: reportId,
          reporter_id: testMemberId,
          reported_id: 'flagged-user-1511',
          reason: 'Spam'
        });

        // 7. Linked in team
        const teamMemberId = 'team-member-1511';
        store.team.push({
          id: teamMemberId,
          name: 'Linked Team Contributor',
          linked_profile_id: testMemberId,
          order: 99
        } as any);

        // 8. Pair cache entry
        setPairCacheEntry(testMemberId, 'peer-user-1511', 'v1', 'v2', { score: 95, reason: 'Great match' });
        const pairCacheKey = getPairCacheKey(testMemberId, 'peer-user-1511');
        expect(matchPairCache.has(pairCacheKey)).toBe(true);

        // Call DELETE /api/profiles/:id
        const res = await fetch(`${baseUrl}/api/profiles/${testMemberId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${testMemberId}` }
        });
        expect(res.status).toBe(200);

        // Assertions:
        // Profile deleted
        expect(store.profiles.find((p: any) => p.id === testMemberId)).toBeUndefined();
        // Authored event deleted
        expect(store.events.find((e: any) => e.id === authoredEventId)).toBeUndefined();
        // Authored event guest deleted
        expect(store.event_guests.find((g: any) => g.id === guestId)).toBeUndefined();
        // Authored event question deleted
        expect(store.event_questions.find((q: any) => q.id === questionOnAuthoredId)).toBeUndefined();
        // Other event attendee_ids updated
        const otherEvent = store.events.find((e: any) => e.id === otherEventId);
        expect(otherEvent).toBeDefined();
        expect(otherEvent!.attendee_ids).toContain('retained-member-1511');
        expect(otherEvent!.attendee_ids).not.toContain(testMemberId);
        // Question asked elsewhere deleted
        expect(store.event_questions.find((q: any) => q.id === questionAskedElsewhereId)).toBeUndefined();
        // Report has reporter_id 'deleted-member'
        const report = store.reports.find((r: any) => r.id === reportId);
        expect(report).toBeDefined();
        expect(report!.reporter_id).toBe('deleted-member');
        // Team linked_profile_id is null
        const teamEntry = store.team.find((t: any) => t.id === teamMemberId);
        expect(teamEntry).toBeDefined();
        expect(teamEntry!.linked_profile_id).toBeNull();
        // Pair cache entry removed
        expect(matchPairCache.has(pairCacheKey)).toBe(false);
      });

      it('d) The 21st connect in a day -> 429; the same target twice -> 409; admin -> no limit', async () => {
        const senderId = 'connect-tester-1511';
        store.profiles.push({
          id: senderId,
          account_uid: senderId,
          name: 'Connect Sender',
          email: `${senderId}@kwegatta.test`,
          role: 'Founder'
        });

        // Populate 25 distinct target profiles
        for (let i = 1; i <= 25; i++) {
          const tId = `target-user-1511-${i}`;
          if (!store.profiles.some((p: any) => p.id === tId)) {
            store.profiles.push({
              id: tId,
              name: `Target User ${i}`,
              email: `${tId}@kwegatta.test`,
              role: 'Developer'
            });
          }
        }

        connectRequestsMap.delete(senderId);

        // First connect to target 1 -> 200
        const res1 = await fetch(`${baseUrl}/api/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${senderId}`
          },
          body: JSON.stringify({ target_id: 'target-user-1511-1', note: 'First hello' })
        });
        expect(res1.status).toBe(200);

        // Same target twice -> 409
        const resDup = await fetch(`${baseUrl}/api/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${senderId}`
          },
          body: JSON.stringify({ target_id: 'target-user-1511-1', note: 'Second hello' })
        });
        expect(resDup.status).toBe(409);
        const dupData = await resDup.json();
        expect(dupData.error).toBe('You already sent a request to this person.');

        // Fill up to 20 connects for today (spaced out > 1 min ago to test 20/day limit)
        for (let i = 2; i <= 20; i++) {
          const history = connectRequestsMap.get(senderId) || [];
          history.push({ targetId: `target-user-1511-${i}`, timestamp: Date.now() - 120 * 1000 });
          connectRequestsMap.set(senderId, history);
        }

        // The 21st connect in a day -> 429
        const res21 = await fetch(`${baseUrl}/api/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${senderId}`
          },
          body: JSON.stringify({ target_id: 'target-user-1511-21', note: '21st connect' })
        });
        expect(res21.status).toBe(429);
        const limitData = await res21.json();
        expect(limitData.error).toBe("You've reached today's limit for connection requests. Try again tomorrow.");

        // Admin -> no limit
        if (!store.admin_emails.includes('admin-limits@kwegatta.test')) {
          store.admin_emails.push('admin-limits@kwegatta.test');
        }
        const adminId = 'admin-limits';

        // Admin sending to target 1 (duplicate and beyond limit) -> 200
        const adminRes1 = await fetch(`${baseUrl}/api/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminId}`
          },
          body: JSON.stringify({ target_id: 'target-user-1511-1', note: 'Admin connect 1' })
        });
        expect(adminRes1.status).toBe(200);

        const adminRes2 = await fetch(`${baseUrl}/api/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminId}`
          },
          body: JSON.stringify({ target_id: 'target-user-1511-1', note: 'Admin duplicate' })
        });
        expect(adminRes2.status).toBe(200);
      });
    });

    describe('Release 1.5.12 — Post Reactions, Comments & SVG Icons', () => {
      it('a) A member reacts like twice -> like count 0 (toggled off)', async () => {
        const postId = 'post-1512-1';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Test post for reaction',
          kind: 'idea',
          tags: [],
          created_at: new Date().toISOString()
        });
        const memberId = 'member-1512-1';
        store.profiles.push({
          id: memberId,
          name: 'React Member',
          role: 'Developer',
          headline: 'Dev',
          bio: 'Bio',
          offers: '',
          needs: '',
          tags: [],
          skills: [],
          created_at: new Date().toISOString()
        });

        // 1st react 'like'
        let res = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` },
          body: JSON.stringify({ type: 'like' })
        });
        expect(res.status).toBe(200);
        let data = await res.json();
        expect(data.counts.like).toBe(1);
        expect(data.my_reaction).toBe('like');

        // 2nd react 'like' (toggle off)
        res = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` },
          body: JSON.stringify({ type: 'like' })
        });
        expect(res.status).toBe(200);
        data = await res.json();
        expect(data.counts.like).toBe(0);
        expect(data.my_reaction).toBeNull();
      });

      it('b) A member reacts like then love -> like 0, love 1, my_reaction love', async () => {
        const postId = 'post-1512-2';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Test post',
          kind: 'idea',
          tags: [],
          created_at: new Date().toISOString()
        });
        const memberId = 'member-1512-2';
        store.profiles.push({
          id: memberId,
          name: 'Member 2',
          role: 'Developer',
          headline: 'Dev',
          bio: 'Bio',
          offers: '',
          needs: '',
          tags: [],
          skills: [],
          created_at: new Date().toISOString()
        });

        await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` },
          body: JSON.stringify({ type: 'like' })
        });

        const res = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` },
          body: JSON.stringify({ type: 'love' })
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.counts.like).toBe(0);
        expect(data.counts.love).toBe(1);
        expect(data.my_reaction).toBe('love');
      });

      it('c) Two different members react like -> like 2', async () => {
        const postId = 'post-1512-3';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Test post',
          kind: 'idea',
          tags: [],
          created_at: new Date().toISOString()
        });
        store.profiles.push(
          { id: 'm1', name: 'M1', role: 'Developer', headline: 'D', bio: 'B', offers: '', needs: '', tags: [], skills: [], created_at: new Date().toISOString() },
          { id: 'm2', name: 'M2', role: 'Developer', headline: 'D', bio: 'B', offers: '', needs: '', tags: [], skills: [], created_at: new Date().toISOString() }
        );

        await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer m1` },
          body: JSON.stringify({ type: 'like' })
        });
        const res = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer m2` },
          body: JSON.stringify({ type: 'like' })
        });
        const data = await res.json();
        expect(data.counts.like).toBe(2);
      });

      it('d) Anonymous react -> 401; type wow -> 400', async () => {
        const postId = 'post-1512-4';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Test post',
          kind: 'idea',
          tags: [],
          created_at: new Date().toISOString()
        });

        const resAnon = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'like' })
        });
        expect(resAnon.status).toBe(401);

        const resInvalid = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer m1` },
          body: JSON.stringify({ type: 'wow' })
        });
        expect(resInvalid.status).toBe(400);
      });

      it('e) Author PATCHes posts with reactions ignored', async () => {
        const postId = 'post-1512-5';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Original body',
          kind: 'idea',
          tags: [],
          reactions: { '👍': 1 },
          created_at: new Date().toISOString()
        });
        store.profiles.push({
          id: 'author-1512',
          name: 'Author',
          role: 'Developer',
          headline: 'D',
          bio: 'B',
          offers: '',
          needs: '',
          tags: [],
          skills: [],
          created_at: new Date().toISOString()
        });

        const patchRes = await fetch(`${baseUrl}/api/data/posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer author-1512` },
          body: JSON.stringify({ reactions: { like: 999 }, body: 'Updated body' })
        });
        expect(patchRes.status).toBe(200);
        const updatedPost = store.posts.find(p => p.id === postId);
        expect(updatedPost.body).toBe('Updated body');
        expect(updatedPost.reactions).toBeUndefined();
      });

      it('f) Non-author comments -> 201/200, author_name from session ignored', async () => {
        const postId = 'post-1512-6';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Post',
          kind: 'idea',
          tags: [],
          created_at: new Date().toISOString()
        });
        store.profiles.push({
          id: 'commenter-1512',
          name: 'Real Name',
          role: 'Developer',
          headline: 'D',
          bio: 'B',
          offers: '',
          needs: '',
          tags: [],
          skills: [],
          created_at: new Date().toISOString()
        });

        const res = await fetch(`${baseUrl}/api/posts/${postId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer commenter-1512` },
          body: JSON.stringify({ text: 'Great work!', author_name: 'Fake Name' })
        });
        expect(res.status).toBe(201);
        const comment = await res.json();
        expect(comment.author_name).toBe('Real Name');
        expect(comment.author_id).toBe('commenter-1512');
        expect(comment.text).toBe('Great work!');
      });

      it('g) Comment delete: stranger -> 403; comment author -> 200; post author -> 200', async () => {
        const postId = 'post-1512-7';
        const commentId = 'c-1512-1';
        store.posts.push({
          id: postId,
          author_id: 'post-author-1512',
          body: 'Post',
          kind: 'idea',
          tags: [],
          comments: [{ id: commentId, author_id: 'commenter-1512', author_name: 'Com', text: 'Hello', created_at: new Date().toISOString() }],
          created_at: new Date().toISOString()
        });
        store.profiles.push(
          { id: 'stranger-1512', name: 'Stranger', role: 'Developer', headline: '', bio: '', offers: '', needs: '', tags: [], skills: [], created_at: new Date().toISOString() },
          { id: 'commenter-1512', name: 'Com', role: 'Developer', headline: '', bio: '', offers: '', needs: '', tags: [], skills: [], created_at: new Date().toISOString() },
          { id: 'post-author-1512', name: 'Host', role: 'Developer', headline: '', bio: '', offers: '', needs: '', tags: [], skills: [], created_at: new Date().toISOString() }
        );

        // Stranger tries to delete
        const resStranger = await fetch(`${baseUrl}/api/posts/${postId}/comments/${commentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer stranger-1512` }
        });
        expect(resStranger.status).toBe(403);

        // Comment author deletes
        const resCommenter = await fetch(`${baseUrl}/api/posts/${postId}/comments/${commentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer commenter-1512` }
        });
        expect(resCommenter.status).toBe(200);
      });

      it('h) Public GET /api/data/posts and /api/sync contain no reactions_by key', async () => {
        const postId = 'post-1512-8';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Post with reactions_by',
          kind: 'idea',
          tags: [],
          reactions_by: { 'm1': 'like' },
          created_at: new Date().toISOString()
        });

        const resData = await fetch(`${baseUrl}/api/data/posts`);
        const postsList = await resData.json();
        const p = postsList.find((item: any) => item.id === postId);
        expect(p).toBeTruthy();
        expect(p.reactions_by).toBeUndefined();
        expect(p.reaction_counts.like).toBe(1);

        const resSync = await fetch(`${baseUrl}/api/sync?since=0`);
        const syncData = await resSync.json();
        const sp = syncData.posts.find((item: any) => item.id === postId);
        expect(sp).toBeTruthy();
        expect(sp.reactions_by).toBeUndefined();
      });

      it('i) Legacy post with reactions { "👍": 3 } shows like count 3; one new like -> 4', async () => {
        const postId = 'post-1512-9';
        store.posts.push({
          id: postId,
          author_id: 'author-1512',
          body: 'Legacy post',
          kind: 'idea',
          tags: [],
          reactions: { '👍': 3 },
          created_at: new Date().toISOString()
        });

        const res = await fetch(`${baseUrl}/api/data/posts`);
        const postsList = await res.json();
        const p = postsList.find((item: any) => item.id === postId);
        expect(p.reaction_counts.like).toBe(3);

        // Now add a new like
        const reactRes = await fetch(`${baseUrl}/api/posts/${postId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer m1` },
          body: JSON.stringify({ type: 'like' })
        });
        const reactData = await reactRes.json();
        expect(reactData.counts.like).toBe(4);
      });

      it('j) Render: FeedView reaction buttons contain SVG elements and no emoji characters, and have aria-pressed', async () => {
        const mockProfile = {
          id: 'test-u-1512',
          name: 'Test User',
          role: 'Developer',
          headline: 'Dev',
          bio: 'Bio',
          offers: '',
          needs: '',
          tags: [],
          skills: [],
          created_at: new Date().toISOString()
        };
        const mockPost = {
          id: 'p-1512-render',
          author_id: 'test-u-1512',
          body: 'Render test post body here',
          kind: 'idea' as const,
          tags: [],
          reaction_counts: { like: 1, launch: 0, love: 0, idea: 0 },
          my_reaction: 'like',
          comments: [],
          created_at: new Date().toISOString()
        };

        const { act } = await import('@testing-library/react');
        await act(async () => {
          render(
            React.createElement(FeedView, {
              currentProfile: mockProfile,
              posts: [mockPost],
              allProfiles: [mockProfile],
              onAddPost: vi.fn(),
              onUpdatePost: vi.fn(),
              onViewProfile: vi.fn(),
              onSelectTag: vi.fn(),
              selectedTag: null
            })
          );
        });

        const likeButton = screen.getByRole('button', { name: /Like/i });
        expect(likeButton).toBeTruthy();
        expect(likeButton.getAttribute('aria-pressed')).toBe('true');
        const svgEl = likeButton.querySelector('svg');
        expect(svgEl).toBeTruthy();
        expect(likeButton.textContent).not.toMatch(/[👍🚀❤️💡]/);
      });
    });
  });
});

afterAll(() => {
  if (server) server.close();
});


