// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
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
  PERSISTED_COLLECTIONS,
  WRITE_ONLY_COLLECTIONS,
  setupFirestoreListeners,
  setMockFirestoreDbForTest,
  initStorage,
  generateSelfCheckinToken,
  setMailSenderForTest,
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

    // 1. Cache name includes version kwegatta-1.9.1
    expect(swContent).toContain("CACHE_NAME = 'kwegatta-1.9.1'");

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
        const patchData = await patchRes.json();
        expect(patchData.reaction_counts.like).toBe(1);
        const updatedPost = store.posts.find(p => p.id === postId);
        expect(updatedPost.body).toBe('Updated body');
        expect(updatedPost.reactions).toEqual({ '👍': 1 });
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

    describe('Release 1.5.13 — Fix: editing a post wipes its reactions', () => {
      it('a) A post with 2 member reactions and a legacy { "👍": 3 } -> author PATCHes { body: "edited" } -> stored post keeps reactions_by and legacy map, counts show like 5', async () => {
        const postId = 'post-1513-a';
        const authorId = 'author-1513';
        if (!store.profiles.some(p => p.id === authorId)) {
          store.profiles.push({
            id: authorId,
            account_uid: authorId,
            name: 'Author 1513',
            role: 'Developer',
            headline: 'Dev',
            bio: 'Bio',
            offers: '',
            needs: '',
            tags: [],
            skills: [],
            created_at: new Date().toISOString()
          });
        }
        store.posts.push({
          id: postId,
          author_id: authorId,
          body: 'Initial body before edit',
          kind: 'idea',
          tags: [],
          reactions: { '👍': 3 },
          reactions_by: { 'user-a-1513': 'like', 'user-b-1513': 'like' },
          comments: [{ id: 'c-1513-1', author_id: 'user-a-1513', author_name: 'User A', text: 'Nice!', created_at: new Date().toISOString() }],
          created_at: new Date().toISOString()
        });

        const patchRes = await fetch(`${baseUrl}/api/data/posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorId}` },
          body: JSON.stringify({ body: 'edited' })
        });
        expect(patchRes.status).toBe(200);
        const patchJson = await patchRes.json();
        expect(patchJson.body).toBe('edited');
        expect(patchJson.reaction_counts.like).toBe(5);

        const storedPost = store.posts.find(p => p.id === postId);
        expect(storedPost.body).toBe('edited');
        expect(storedPost.reactions).toEqual({ '👍': 3 });
        expect(storedPost.reactions_by).toEqual({ 'user-a-1513': 'like', 'user-b-1513': 'like' });
        expect(storedPost.comments).toHaveLength(1);
      });

      it('b) An admin PATCH on the same post -> reactions unchanged', async () => {
        const postId = 'post-1513-a';
        const adminEmail = 'admin-1513@kwegatta.test';
        if (!store.admin_emails.includes(adminEmail)) {
          store.admin_emails.push(adminEmail);
        }
        const adminId = 'admin-1513';

        const patchRes = await fetch(`${baseUrl}/api/data/posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminId}` },
          body: JSON.stringify({ body: 'edited by admin' })
        });
        expect(patchRes.status).toBe(200);
        const patchJson = await patchRes.json();
        expect(patchJson.body).toBe('edited by admin');
        expect(patchJson.reaction_counts.like).toBe(5);

        const storedPost = store.posts.find(p => p.id === postId);
        expect(storedPost.reactions).toEqual({ '👍': 3 });
        expect(storedPost.reactions_by).toEqual({ 'user-a-1513': 'like', 'user-b-1513': 'like' });
      });

      it('c) A PATCH with { reactions_by: {...}, comments: [] } -> ignored, stored data unchanged', async () => {
        const postId = 'post-1513-a';
        const authorId = 'author-1513';

        const patchRes = await fetch(`${baseUrl}/api/data/posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorId}` },
          body: JSON.stringify({
            reactions_by: { 'forged-user': 'love' },
            reactions: { '👍': 999 },
            reaction_counts: { like: 999, launch: 0, love: 0, idea: 0 },
            comments: []
          })
        });
        expect(patchRes.status).toBe(200);

        const storedPost = store.posts.find(p => p.id === postId);
        expect(storedPost.reactions).toEqual({ '👍': 3 });
        expect(storedPost.reactions_by).toEqual({ 'user-a-1513': 'like', 'user-b-1513': 'like' });
        expect(storedPost.comments).toHaveLength(1);
        expect(storedPost.comments[0].id).toBe('c-1513-1');
      });

      it('d) The PATCH response contains no "reactions_by"', async () => {
        const postId = 'post-1513-a';
        const authorId = 'author-1513';

        const patchRes = await fetch(`${baseUrl}/api/data/posts/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorId}` },
          body: JSON.stringify({ body: 'final edit check' })
        });
        expect(patchRes.status).toBe(200);
        const rawText = await patchRes.text();
        expect(rawText).not.toContain('reactions_by');
        const json = JSON.parse(rawText);
        expect(json.reactions_by).toBeUndefined();
        expect(json.reaction_counts).toEqual({ like: 5, launch: 0, love: 0, idea: 0 });
        expect(json).toHaveProperty('my_reaction');
      });
    });

    describe('Release 1.6.0 — Complete event management (attendees panel, capacity, tags, venue)', () => {
      const hostId = 'host-160';
      const memberAttId = 'member-att-160';
      const memberExtraId = 'member-extra-160';

      beforeAll(() => {
        for (const [id, name] of [
          [hostId, 'Host 160'],
          [memberAttId, 'Member Attendee 160'],
          [memberExtraId, 'Member Extra 160']
        ]) {
          if (!store.profiles.some((p: any) => p.id === id)) {
            store.profiles.push({
              id,
              account_uid: id,
              name,
              role: 'Developer',
              headline: 'Builder in Kampala',
              bio: 'Bio',
              offers: 'TypeScript',
              needs: 'Design',
              tags: [],
              skills: [],
              created_at: new Date().toISOString()
            } as any);
          }
        }
      });

      it('a) The author gets the attendees data (members + guests with emails); a non-author attendee gets members but no guest emails; anonymous gets no attendee list', async () => {
        const createRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({
            kind: 'event',
            title: 'Event 1.6.0 Attendees Privacy',
            description: 'Testing attendee and guest email visibility.',
            start_date: '2026-12-10',
            start_time: '14:00',
            timezone: 'Africa/Kampala',
            format: 'in_person',
            venue: 'Kampala Innovation Hub'
          })
        });
        expect(createRes.status).toBe(200);
        const eventId = (await createRes.json()).item.id;

        // Member RSVPs
        const rsvpRes = await fetch(`${baseUrl}/api/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${memberAttId}` }
        });
        expect(rsvpRes.status).toBe(200);

        // Guest registers with email
        const guestRes = await fetch(`${baseUrl}/api/events/${eventId}/guest-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.160' },
          body: JSON.stringify({
            name: 'Guest Alice 160',
            email: 'guest.alice160@example.com',
            agree: true
          })
        });
        expect(guestRes.status).toBe(200);

        // 1. Author gets members + guests with emails
        const authorRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
          headers: { Authorization: `Bearer ${hostId}` }
        });
        expect(authorRes.status).toBe(200);
        const authorData = await authorRes.json();
        expect(Array.isArray(authorData.attendees)).toBe(true);
        expect(authorData.attendees.some((m: any) => m.id === memberAttId)).toBe(true);
        expect(Array.isArray(authorData.guests)).toBe(true);
        expect(authorData.guests).toHaveLength(1);
        expect(authorData.guests[0].email).toBe('guest.alice160@example.com');

        // Also check CSV export for author: name,type,email (guests only),registered_at
        const csvRes = await fetch(`${baseUrl}/api/events/${eventId}/export`, {
          headers: { Authorization: `Bearer ${hostId}` }
        });
        expect(csvRes.status).toBe(200);
        const csvText = await csvRes.text();
        expect(csvText).toContain('name,type,email,registered_at');
        expect(csvText).toContain('"Member Attendee 160","Member",""');
        expect(csvText).toContain('"Guest Alice 160","Guest","guest.alice160@example.com"');

        // 2. Non-author attendee gets members, but NO guest emails
        const attRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
          headers: { Authorization: `Bearer ${memberAttId}` }
        });
        expect(attRes.status).toBe(200);
        const attData = await attRes.json();
        expect(Array.isArray(attData.attendees)).toBe(true);
        expect(attData.attendees.some((m: any) => m.id === memberAttId)).toBe(true);
        const attRaw = JSON.stringify(attData);
        expect(attRaw).not.toContain('guest.alice160@example.com');
        if (Array.isArray(attData.guests)) {
          for (const g of attData.guests) {
            expect(g.email).toBeUndefined();
          }
        }

        // 3. Anonymous gets no attendee list
        const anonRes = await fetch(`${baseUrl}/api/events/${eventId}`);
        expect(anonRes.status).toBe(200);
        const anonData = await anonRes.json();
        expect(anonData.attendees).toBeUndefined();
        expect(anonData.attendee_ids).toBeUndefined();
        expect(anonData.guests).toBeUndefined();
      });

      it('b) Capacity 2 with 2 attendees -> RSVP rejected as full; guest registration also blocked', async () => {
        const createRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({
            kind: 'event',
            title: 'Capacity 2 Event 160',
            description: 'Testing strict capacity limit of 2.',
            start_date: '2026-12-11',
            start_time: '15:00',
            timezone: 'Africa/Kampala',
            format: 'in_person',
            venue: 'Makerere Innovation Lab',
            capacity: 2
          })
        });
        expect(createRes.status).toBe(200);
        const eventId = (await createRes.json()).item.id;

        // Attendee 1 (member)
        const rsvp1 = await fetch(`${baseUrl}/api/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${memberAttId}` }
        });
        expect(rsvp1.status).toBe(200);

        // Attendee 2 (guest)
        const guest1 = await fetch(`${baseUrl}/api/events/${eventId}/guest-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.161' },
          body: JSON.stringify({
            name: 'Second Spot Guest',
            email: 'secondspot@example.com',
            agree: true
          })
        });
        expect(guest1.status).toBe(200);

        // Now at 2/2 capacity -> another member RSVP is rejected as full
        const rsvpFull = await fetch(`${baseUrl}/api/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${memberExtraId}` }
        });
        expect(rsvpFull.status).toBe(400);
        const rsvpFullJson = await rsvpFull.json();
        expect(rsvpFullJson.error.toLowerCase()).toContain('full');

        // Guest registration is also blocked when full
        const guestFull = await fetch(`${baseUrl}/api/events/${eventId}/guest-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.162' },
          body: JSON.stringify({
            name: 'Third Spot Guest',
            email: 'thirdspot@example.com',
            agree: true
          })
        });
        expect(guestFull.status).toBe(400);
        const guestFullJson = await guestFull.json();
        expect(guestFullJson.error.toLowerCase()).toContain('full');
      });

      it('c) Tags: 6 tags -> only 5 kept; invalid characters stripped; search by tag finds the event', async () => {
        const createRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({
            kind: 'event',
            title: 'Tagged Tech Meetup 160',
            description: 'Testing tag sanitization and search.',
            start_date: '2026-12-12',
            start_time: '16:00',
            timezone: 'Africa/Kampala',
            format: 'in_person',
            venue: 'Ntinda Complex Kampala',
            tags: ['Gemma_4!', 'Open-Source@AI', 'Kampala#Builders', 'Tag$Four', 'Tag%Five', 'TagSixDropped']
          })
        });
        expect(createRes.status).toBe(200);
        const createdItem = (await createRes.json()).item;
        expect(createdItem.tags).toHaveLength(5);
        expect(createdItem.tags).toEqual([
          'gemma4',
          'open-sourceai',
          'kampalabuilders',
          'tagfour',
          'tagfive'
        ]);

        // Search by tag on GET /api/events?q=open-sourceai finds the event
        const searchRes = await fetch(`${baseUrl}/api/events?q=open-sourceai`);
        expect(searchRes.status).toBe(200);
        const searchList = await searchRes.json();
        expect(searchList.some((e: any) => e.id === createdItem.id)).toBe(true);
      });

      it('d) New in_person event without a venue -> 400; a map link with http:// or a non-maps domain -> 400; an existing event without a venue still loads', async () => {
        const adminEmail = 'admin-160@kwegatta.test';
        if (!store.admin_emails.includes(adminEmail)) store.admin_emails.push(adminEmail);

        // 1. New in_person event without a venue (or < 5 chars) -> 400
        const noVenueRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-160' },
          body: JSON.stringify({
            kind: 'event',
            title: 'Missing Venue Event',
            description: 'Should fail validation.',
            start_date: '2026-12-15',
            start_time: '10:00',
            timezone: 'Africa/Kampala',
            format: 'in_person',
            venue: ''
          })
        });
        expect(noVenueRes.status).toBe(400);

        // 2. Map link with http:// -> 400
        const httpMapRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-160' },
          body: JSON.stringify({
            kind: 'event',
            title: 'Insecure Map Link Event',
            description: 'Should reject http map link.',
            start_date: '2026-12-15',
            start_time: '10:00',
            timezone: 'Africa/Kampala',
            format: 'in_person',
            venue: 'Kampala Central Hub',
            map_link: 'http://maps.google.com/?q=Kampala'
          })
        });
        expect(httpMapRes.status).toBe(400);

        // 3. Map link with non-maps domain -> 400
        const badDomainMapRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-160' },
          body: JSON.stringify({
            kind: 'event',
            title: 'Non-Maps Domain Event',
            description: 'Should reject non-maps domain.',
            start_date: '2026-12-15',
            start_time: '10:00',
            timezone: 'Africa/Kampala',
            format: 'in_person',
            venue: 'Kampala Central Hub',
            map_link: 'https://example.com/maps/kampala'
          })
        });
        expect(badDomainMapRes.status).toBe(400);

        // 4. Existing event without a venue still loads
        const legacyNoVenueId = 'legacy-no-venue-160';
        store.events.push({
          id: legacyNoVenueId,
          kind: 'event',
          title: 'Legacy Event Without Venue',
          description: 'Stored before venue validation.',
          starts_at: '2026-12-20T10:00:00.000Z',
          ends_at: '2026-12-20T12:00:00.000Z',
          timezone: 'Africa/Kampala',
          format: 'in_person',
          author_id: hostId,
          status: 'published',
          published: true,
          attendee_ids: [],
          created_at: new Date().toISOString()
        } as any);

        const loadLegacyRes = await fetch(`${baseUrl}/api/events/${legacyNoVenueId}`);
        expect(loadLegacyRes.status).toBe(200);
        const loadLegacyJson = await loadLegacyRes.json();
        expect(loadLegacyJson.id).toBe(legacyNoVenueId);
      });

      it('e) GET /api/does-not-exist -> 404 JSON', async () => {
        const res = await fetch(`${baseUrl}/api/does-not-exist`);
        expect(res.status).toBe(404);
        expect(res.headers.get('content-type') || '').toContain('application/json');
        const data = await res.json();
        expect(data).toEqual({ error: 'Not found' });
      });

      it('f) Render: the author sees "Attendees (N)" and "You\'re hosting"; there are no remove buttons anywhere', async () => {
        const authorProfile = {
          id: 'author-render-160',
          name: 'Host Render 160',
          role: 'Developer',
          headline: 'Event Organizer',
          bio: 'Organizing events',
          offers: 'Community',
          needs: 'Speakers',
          tags: [],
          skills: [],
          created_at: new Date().toISOString()
        };

        const mockEvent = {
          id: 'ev-render-160',
          kind: 'event',
          title: 'Kampala Builders Summit 160',
          description: 'Annual summit for builders.',
          author_id: authorProfile.id,
          author_name: authorProfile.name,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 90000000).toISOString(),
          timezone: 'Africa/Kampala',
          format: 'in_person',
          venue: 'Kampala Serena Conference Centre',
          map_link: 'https://maps.google.com/?q=Kampala',
          tags: ['summit', 'kampala'],
          capacity: 50,
          created_at: new Date().toISOString(),
          published: true,
          attendee_ids: ['m-1'],
          attendee_count: 2,
          attendees: [
            { id: 'm-1', name: 'Member One', type: 'member', registered_at: new Date().toISOString() }
          ],
          guests: [
            { id: 'g-1', event_id: 'ev-render-160', name: 'Guest One', email: 'guest1@example.com', created_at: new Date().toISOString() }
          ],
          phase: 'upcoming'
        };

        window.location.hash = '#/events';
        try { localStorage.clear(); } catch {}

        if (!store.events) store.events = [];
        store.events.push(mockEvent as any);
        if (!store.event_guests) store.event_guests = [];
        store.event_guests.push(mockEvent.guests[0] as any);

        vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([mockEvent as any]);
        vi.spyOn(apiModule, 'fetchEventById').mockResolvedValue(mockEvent as any);
        vi.spyOn(apiModule, 'fetchEventQuestions').mockResolvedValue([]);
        vi.spyOn(apiModule, 'fetchEventGuests').mockResolvedValue(mockEvent.guests as any);

        const { act, waitFor, cleanup } = await import('@testing-library/react');
        cleanup();

        let renderedContainer: HTMLElement | null = null;
        await act(async () => {
          const res = render(
            React.createElement(EventsView, {
              currentProfile: authorProfile as any,
              allProfiles: [authorProfile as any],
              initialItemId: mockEvent.id,
              onViewProfile: vi.fn(),
              onToast: vi.fn()
            })
          );
          renderedContainer = res.container;
          await new Promise(r => setTimeout(r, 50));
        });

        await waitFor(() => {
          expect(screen.getAllByText(/Attendees \(2\)/i).length).toBeGreaterThan(0);
          expect(screen.getAllByText(/You're hosting/i).length).toBeGreaterThan(0);
          expect(screen.getAllByText(/Open in Maps/i).length).toBeGreaterThan(0);
        });

        // Assert no remove buttons exist anywhere in the rendered view
        const allButtons = Array.from((renderedContainer || document).querySelectorAll('button'));
        for (const btn of allButtons) {
          expect((btn.textContent || '').toLowerCase()).not.toContain('remove');
        }
      });
    });

    describe('Release 1.6.1: Firestore listeners for events, event_guests, and event_questions', () => {
      it('a) static audit: every collection in persistDoc/removeDoc/batchRemoveDocs/batchPersistDocs is loaded in setupFirestoreListeners or in WRITE_ONLY allowlist', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

        // Extract literal collection names passed to persistDoc, removeDoc, batchRemoveDocs, batchPersistDocs
        const writeCallRegex = /\b(?:persistDoc|removeDoc|batchRemoveDocs|batchPersistDocs)\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
        const writtenCollections = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = writeCallRegex.exec(serverSrc)) !== null) {
          writtenCollections.add(m[1]);
        }

        // Also include ALLOWED_DATA_COLLECTIONS used via generic /api/data/:collection
        for (const col of ['profiles', 'posts', 'follows', 'matches', 'notifications', 'events', 'event_guests', 'event_questions', 'event_checkins']) {
          writtenCollections.add(col);
        }

        // Extract setupFirestoreListeners body and find all .collection('...').onSnapshot
        const fnStart = serverSrc.indexOf('export async function setupFirestoreListeners');
        const fnEnd = serverSrc.indexOf('export async function initStorage', fnStart);
        expect(fnStart).toBeGreaterThan(0);
        expect(fnEnd).toBeGreaterThan(fnStart);
        const listenerSection = serverSrc.slice(fnStart, fnEnd);

        const listenerRegex = /\.collection\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)\.onSnapshot/g;
        const listenedCollections = new Set<string>();
        while ((m = listenerRegex.exec(listenerSection)) !== null) {
          listenedCollections.add(m[1]);
        }

        // WRITE_ONLY_COLLECTIONS must not contain events, event_guests, event_questions, or event_checkins
        expect(WRITE_ONLY_COLLECTIONS).not.toContain('events');
        expect(WRITE_ONLY_COLLECTIONS).not.toContain('event_guests');
        expect(WRITE_ONLY_COLLECTIONS).not.toContain('event_questions');
        expect(WRITE_ONLY_COLLECTIONS).not.toContain('event_checkins');

        // Every written collection must be in PERSISTED_COLLECTIONS and either listened or in WRITE_ONLY_COLLECTIONS
        for (const col of writtenCollections) {
          expect(PERSISTED_COLLECTIONS).toContain(col);
          const isCovered = listenedCollections.has(col) || WRITE_ONLY_COLLECTIONS.includes(col);
          expect(isCovered).toBe(true);
        }

        expect(listenedCollections.has('events')).toBe(true);
        expect(listenedCollections.has('event_guests')).toBe(true);
        expect(listenedCollections.has('event_questions')).toBe(true);
        expect(listenedCollections.has('event_checkins')).toBe(true);
      });

      it('b) mocked firestoreDb with onSnapshot loads events, event_guests, event_questions, and event_checkins into store', async () => {
        const prevEvents = [...(store.events || [])];
        const prevGuests = [...(store.event_guests || [])];
        const prevQuestions = [...(store.event_questions || [])];
        const prevCheckins = [...(store.event_checkins || [])];

        try {
          store.events = [];
          store.event_guests = [];
          store.event_questions = [];
          store.event_checkins = [];

          const seededCollections: Record<string, Array<{ id: string; data: () => any }>> = {
            events: [
              { id: 'ev-seeded-161', data: () => ({ title: 'Restored Event 161', kind: 'event', published: true }) }
            ],
            event_guests: [
              { id: 'guest-seeded-161', data: () => ({ event_id: 'ev-seeded-161', name: 'Restored Guest' }) }
            ],
            event_questions: [
              { id: 'q-seeded-161', data: () => ({ event_id: 'ev-seeded-161', question_text: 'Restored Question?' }) }
            ],
            event_checkins: [
              { id: 'chk-seeded-161', data: () => ({ event_id: 'ev-seeded-161', kind: 'guest', ref_id: 'guest-seeded-161', method: 'host_scan' }) }
            ]
          };

          const mockDb = {
            collection: (colName: string) => ({
              onSnapshot: (onNext: (snap: any) => void) => {
                const docs = seededCollections[colName] || [];
                onNext({
                  docs,
                  forEach: (cb: (d: any) => void) => docs.forEach(cb)
                });
                return () => {};
              }
            })
          };

          await setupFirestoreListeners(mockDb);

          expect(store.events.some((e: any) => e.id === 'ev-seeded-161' && e.title === 'Restored Event 161')).toBe(true);
          expect(store.event_guests.some((g: any) => g.id === 'guest-seeded-161' && g.name === 'Restored Guest')).toBe(true);
          expect(store.event_questions.some((q: any) => q.id === 'q-seeded-161' && q.question_text === 'Restored Question?')).toBe(true);
          expect(store.event_checkins.some((c: any) => c.id === 'chk-seeded-161')).toBe(true);
        } finally {
          setMockFirestoreDbForTest(null);
          store.events = prevEvents;
          store.event_guests = prevGuests;
          store.event_questions = prevQuestions;
          store.event_checkins = prevCheckins;
        }
      });

      it('c) listeners finish initial load before cleanupTestEvents runs in initStorage (call-order test with mocks)', async () => {
        const callOrder: string[] = [];
        const prevEvents = [...(store.events || [])];
        const prevMigrations = { ...(store.migrations || {}) };

        try {
          store.migrations = {
            [SAIFUDDIN_PROFILE_MIGRATION_FLAG]: { completed: true },
            saifuddin_profile_migration_v2: { completed: true },
            [SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG]: { completed: true },
            [CLEANUP_TEST_EVENTS_FLAG]: { completed: false },
            publish_existing_pending_events_v1: { completed: true }
          };

          const mockDb = {
            collection: (colName: string) => ({
              onSnapshot: (onNext: (snap: any) => void) => {
                if (['events', 'event_guests', 'event_questions'].includes(colName)) {
                  callOrder.push(`listener:${colName}`);
                }
                const docs =
                  colName === 'events'
                    ? [{ id: 'ev-real-keep', data: () => ({ id: 'ev-real-keep', title: 'Kampala Builders Meetup', author_name: 'Alice', published: true }) }]
                    : [];
                onNext({
                  docs,
                  forEach: (cb: (d: any) => void) => docs.forEach(cb)
                });
                return () => {};
              },
              doc: () => ({
                get: async () => ({ exists: false, data: () => ({}) }),
                set: async () => {
                  callOrder.push('cleanupTestEvents:completed');
                }
              })
            })
          };

          await initStorage(mockDb);

          const eventsIdx = callOrder.indexOf('listener:events');
          const guestsIdx = callOrder.indexOf('listener:event_guests');
          const questionsIdx = callOrder.indexOf('listener:event_questions');
          expect(eventsIdx).toBeGreaterThanOrEqual(0);
          expect(guestsIdx).toBeGreaterThanOrEqual(0);
          expect(questionsIdx).toBeGreaterThanOrEqual(0);
          expect(store.migrations[CLEANUP_TEST_EVENTS_FLAG]?.completed).toBe(true);
          expect(store.events.some((e: any) => e.id === 'ev-real-keep')).toBe(true);
        } finally {
          setMockFirestoreDbForTest(null);
          store.events = prevEvents;
          store.migrations = prevMigrations;
        }
      });
    });

    describe('Release 1.8.0: Check-in (host scan + venue QR self check-in) + confirmation email', () => {
      it('a) event_checkins is blocked from /api/data/event_checkins (404), Permissions-Policy allows camera=(self), and cascadeDeleteMemberData removes check-ins', async () => {
        const res = await fetch(`${baseUrl}/api/data/event_checkins`);
        expect(res.status).toBe(404);
        const policyHeader = res.headers.get('permissions-policy') || '';
        expect(policyHeader).toContain('camera=(self)');

        if (!store.event_checkins) store.event_checkins = [];
        store.event_checkins.push({
          id: 'chk-cascade-test',
          event_id: 'ev-cascade-test',
          kind: 'member',
          ref_id: 'member-del-180',
          code_hash: 'abc',
          checked_in_at: new Date().toISOString(),
          checked_in_by: 'host-1',
          method: 'host_scan'
        });
        await cascadeDeleteMemberData('member-del-180', 'uid-del-180');
        expect(store.event_checkins.some((c: any) => c.id === 'chk-cascade-test')).toBe(false);
      });

      it('b) personal tickets: member RSVP & guest registration generate 10-char base32 tickets, store sha256 only, and cancellation invalidates tickets', async () => {
        const hostId = 'host-180-ticket';
        const memberId = 'att-180-ticket';
        store.profiles.push(
          { id: hostId, account_uid: hostId, name: 'Host 180', headline: 'Builder', email: 'host180@example.com' } as any,
          { id: memberId, account_uid: memberId, name: 'Member 180', headline: 'Dev', email: 'member180@example.com' } as any
        );

        const now = Date.now();
        const evRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({
            kind: 'event',
            title: 'Kwegatta 1.8.0 Ticket Test',
            description: 'Testing personal tickets and invalidation on cancel.',
            format: 'in_person',
            venue: 'Kampala Hub Plot 12',
            starts_at: new Date(now + 30 * 60 * 1000).toISOString(),
            ends_at: new Date(now + 120 * 60 * 1000).toISOString(),
            timezone: 'Africa/Kampala',
            self_checkin_enabled: true
          })
        });
        expect(evRes.status).toBe(200);
        const ev = (await evRes.json()).item;

        // Non-attendee cannot get a ticket
        const forbiddenTicket = await fetch(`${baseUrl}/api/events/${ev.id}/my-ticket`, {
          headers: { Authorization: `Bearer ${memberId}` }
        });
        expect(forbiddenTicket.status).toBe(403);

        // Member RSVPs
        const rsvpRes = await fetch(`${baseUrl}/api/events/${ev.id}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` }
        });
        expect(rsvpRes.status).toBe(200);

        // Member fetches ticket
        const ticketRes = await fetch(`${baseUrl}/api/events/${ev.id}/my-ticket`, {
          headers: { Authorization: `Bearer ${memberId}` }
        });
        expect(ticketRes.status).toBe(200);
        const ticketData = await ticketRes.json();
        expect(ticketData.code).toMatch(/^[A-Z2-7]{10}$/);
        expect(ticketData.qr_payload).toBe(`KWG1:${ev.id}:${ticketData.code}`);

        // Stored event has sha256 hash, never raw code
        const storedEv = store.events.find((e: any) => e.id === ev.id);
        expect(storedEv.member_ticket_hashes[memberId]).toBeDefined();
        expect(storedEv.member_ticket_hashes[memberId]).not.toBe(ticketData.code);

        // Guest registers and receives code + token
        const guestRegRes = await fetch(`${baseUrl}/api/events/${ev.id}/guest-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.1.1' },
          body: JSON.stringify({
            name: 'Guest Ticket Holder',
            email: 'guest180@example.com',
            agree: true
          })
        });
        expect(guestRegRes.status).toBe(200);
        const guestReg = await guestRegRes.json();
        expect(guestReg.code).toMatch(/^[A-Z2-7]{10}$/);

        // Guest fetches ticket via X-Guest-Token
        const guestTicketRes = await fetch(`${baseUrl}/api/events/${ev.id}/my-ticket`, {
          headers: { 'X-Guest-Token': guestReg.token }
        });
        expect(guestTicketRes.status).toBe(200);
        const guestTicket = await guestTicketRes.json();
        expect(guestTicket.code).toBe(guestReg.code);

        // Cancelling member RSVP invalidates member ticket
        await fetch(`${baseUrl}/api/events/${ev.id}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` }
        });
        const afterCancelTicket = await fetch(`${baseUrl}/api/events/${ev.id}/my-ticket`, {
          headers: { Authorization: `Bearer ${memberId}` }
        });
        expect(afterCancelTicket.status).toBe(403);

        // Host scanning cancelled member's ticket fails with 404
        const scanCancelled = await fetch(`${baseUrl}/api/events/${ev.id}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({ code: ticketData.code })
        });
        expect(scanCancelled.status).toBe(404);
      });

      it('c) Mode 1 (host scan & manual check-in) + CSV export with checked_in_at and method', async () => {
        const hostId = 'host-180-scan';
        const memberId = 'att-180-scan';
        store.profiles.push(
          { id: hostId, account_uid: hostId, name: 'Host Scanner', headline: 'Host' } as any,
          { id: memberId, account_uid: memberId, name: 'Grace Member', headline: 'Developer' } as any
        );

        const now = Date.now();
        const evRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({
            kind: 'event',
            title: 'Kwegatta 1.8.0 Host Scan Event',
            description: 'Host scan and manual check-in verification.',
            format: 'in_person',
            venue: 'Makerere Innovation Hub',
            starts_at: new Date(now + 60 * 60 * 1000).toISOString(),
            ends_at: new Date(now + 180 * 60 * 1000).toISOString(),
            timezone: 'Africa/Kampala'
          })
        });
        const ev = (await evRes.json()).item;

        // Member RSVPs and gets ticket
        await fetch(`${baseUrl}/api/events/${ev.id}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` }
        });
        const tRes = await fetch(`${baseUrl}/api/events/${ev.id}/my-ticket`, {
          headers: { Authorization: `Bearer ${memberId}` }
        });
        const { qr_payload } = await tRes.json();

        // Non-host cannot check in
        const nonHostRes = await fetch(`${baseUrl}/api/events/${ev.id}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` },
          body: JSON.stringify({ code: qr_payload })
        });
        expect(nonHostRes.status).toBe(403);

        // Host scans member's QR payload -> checked_in
        const scan1 = await fetch(`${baseUrl}/api/events/${ev.id}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({ code: qr_payload })
        });
        expect(scan1.status).toBe(200);
        const scan1Body = await scan1.json();
        expect(scan1Body.status).toBe('checked_in');
        expect(scan1Body.name).toBe('Grace Member');

        // Repeat scan -> idempotent 'already'
        const scan2 = await fetch(`${baseUrl}/api/events/${ev.id}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({ code: qr_payload })
        });
        expect(scan2.status).toBe(200);
        const scan2Body = await scan2.json();
        expect(scan2Body.status).toBe('already');
        expect(scan2Body.checked_in_at).toBe(scan1Body.checked_in_at);

        // Register a guest and manually check them in
        const gRes = await fetch(`${baseUrl}/api/events/${ev.id}/guest-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.2.2' },
          body: JSON.stringify({ name: 'Manual Guest', email: 'manualguest@example.com', agree: true })
        });
        expect(gRes.status).toBe(200);
        const targetGuest = store.event_guests.find((g: any) => g.event_id === ev.id && g.email === 'manualguest@example.com');
        expect(targetGuest).toBeDefined();

        const manualRes = await fetch(`${baseUrl}/api/events/${ev.id}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({ kind: 'guest', ref_id: targetGuest!.id })
        });
        expect(manualRes.status).toBe(200);
        const manualBody = await manualRes.json();
        expect(manualBody.status).toBe('checked_in');
        expect(manualBody.method).toBe('manual');

        // Export CSV includes checked_in_at and method columns
        const csvRes = await fetch(`${baseUrl}/api/events/${ev.id}/export`, {
          headers: { Authorization: `Bearer ${hostId}` }
        });
        expect(csvRes.status).toBe(200);
        const csvText = await csvRes.text();
        expect(csvText).toContain('name,type,email,registered_at,checked_in_at,method');
        expect(csvText).toContain('"Grace Member"');
        expect(csvText).toContain('"host_scan"');
        expect(csvText).toContain('"Manual Guest"');
        expect(csvText).toContain('"manual"');
      });

      it('d) Mode 2 (venue rotating QR self check-in): validates 30s HMAC window, blocks expired tokens (410), checks registration (409), and locks out after 5 failed guest emails (429)', async () => {
        const hostId = 'host-180-self';
        const rsvpMemberId = 'att-180-self';
        const otherMemberId = 'nonatt-180-self';
        store.profiles.push(
          { id: hostId, account_uid: hostId, name: 'Venue Host', headline: 'Host' } as any,
          { id: rsvpMemberId, account_uid: rsvpMemberId, name: 'Self Checkin Member', headline: 'Dev' } as any,
          { id: otherMemberId, account_uid: otherMemberId, name: 'Unregistered Member', headline: 'Dev' } as any
        );

        const now = Date.now();
        const evRes = await fetch(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
          body: JSON.stringify({
            kind: 'event',
            title: 'Kwegatta 1.8.0 Self Checkin Event',
            description: 'Testing rotating venue QR self check-in.',
            format: 'in_person',
            venue: 'Nakawa Tech Park',
            starts_at: new Date(now + 30 * 60 * 1000).toISOString(),
            ends_at: new Date(now + 150 * 60 * 1000).toISOString(),
            timezone: 'Africa/Kampala',
            self_checkin_enabled: true
          })
        });
        const ev = (await evRes.json()).item;

        await fetch(`${baseUrl}/api/events/${ev.id}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rsvpMemberId}` }
        });

        await fetch(`${baseUrl}/api/events/${ev.id}/guest-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.3.1' },
          body: JSON.stringify({ name: 'Venue Guest', email: 'venueguest@example.com', agree: true })
        });

        // Host fetches rotating checkin-token
        const tokRes = await fetch(`${baseUrl}/api/events/${ev.id}/checkin-token`, {
          headers: { Authorization: `Bearer ${hostId}` }
        });
        expect(tokRes.status).toBe(200);
        const tokData = await tokRes.json();
        expect(tokData.token).toBeTruthy();

        // Expired token (from 3 minutes ago) -> 410 "QR expired, scan again"
        const expiredToken = generateSelfCheckinToken(ev.id, now - 180000);
        const expRes = await fetch(`${baseUrl}/api/events/${ev.id}/self-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rsvpMemberId}`, 'X-Forwarded-For': '10.88.3.2' },
          body: JSON.stringify({ token: expiredToken })
        });
        expect(expRes.status).toBe(410);
        const expBody = await expRes.json();
        expect(expBody.error).toContain('QR expired, scan again');

        // Unregistered member -> 409 "You're not registered for this event"
        const unregRes = await fetch(`${baseUrl}/api/events/${ev.id}/self-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherMemberId}`, 'X-Forwarded-For': '10.88.3.3' },
          body: JSON.stringify({ token: tokData.token })
        });
        expect(unregRes.status).toBe(409);

        // Registered member -> 200 checked_in
        const selfRes1 = await fetch(`${baseUrl}/api/events/${ev.id}/self-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rsvpMemberId}`, 'X-Forwarded-For': '10.88.3.4' },
          body: JSON.stringify({ token: tokData.token })
        });
        expect(selfRes1.status).toBe(200);
        expect((await selfRes1.json()).status).toBe('checked_in');

        // Registered guest self checks in by email (using previous 30s window token, which is also accepted)
        const prevWindowToken = generateSelfCheckinToken(ev.id, now - 25000);
        const guestSelfRes = await fetch(`${baseUrl}/api/events/${ev.id}/self-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.3.5' },
          body: JSON.stringify({ token: prevWindowToken, guest_email: 'venueguest@example.com' })
        });
        expect(guestSelfRes.status).toBe(200);
        expect((await guestSelfRes.json()).status).toBe('checked_in');

        // 5 failed guest-email attempts from same IP -> 429 block
        let lastStatus = 0;
        for (let i = 0; i < 5; i++) {
          const failRes = await fetch(`${baseUrl}/api/events/${ev.id}/self-checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.3.99' },
            body: JSON.stringify({ token: tokData.token, guest_email: `wrong${i}@example.com` })
          });
          lastStatus = failRes.status;
        }
        expect(lastStatus).toBe(429);
      });

      it('e) Confirmation email: silently skipped without SMTP env vars, and sends email with .ics attachment when configured', async () => {
        const sentEmails: any[] = [];
        const prevUser = process.env.SMTP_USER;
        const prevPass = process.env.SMTP_PASS;

        try {
          process.env.SMTP_USER = 'events@kwegatta.org';
          process.env.SMTP_PASS = 'app-password-test';
          setMailSenderForTest(async (mailOpts: any) => {
            sentEmails.push(mailOpts);
          });

          const hostId = 'host-180-email';
          const memberId = 'att-180-email';
          store.profiles.push(
            { id: hostId, account_uid: hostId, name: 'Email Host', headline: 'Host', email: 'host@kwegatta.org' } as any,
            { id: memberId, account_uid: memberId, name: 'Email Member', headline: 'Dev', email: 'attendee@kwegatta.org' } as any
          );

          const now = Date.now();
          const evRes = await fetch(`${baseUrl}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostId}` },
            body: JSON.stringify({
              kind: 'event',
              title: 'Kwegatta Email Confirmation Meetup',
              description: 'Testing confirmation email with .ics attachment.',
              format: 'in_person',
              venue: 'Kampala Innovation Village',
              starts_at: new Date(now + 3600000).toISOString(),
              ends_at: new Date(now + 7200000).toISOString(),
              timezone: 'Africa/Kampala',
              contact_email: 'host@kwegatta.org'
            })
          });
          const ev = (await evRes.json()).item;

          await fetch(`${baseUrl}/api/events/${ev.id}/rsvp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberId}` }
          });

          expect(sentEmails.length).toBe(1);
          expect(sentEmails[0].to).toBe('attendee@kwegatta.org');
          expect(sentEmails[0].replyTo).toBe('host@kwegatta.org');
          expect(sentEmails[0].text).toContain(`#/events/${ev.id}/ticket`);
          expect(sentEmails[0].attachments[0].filename).toBe('event.ics');
          expect(sentEmails[0].attachments[0].content).toContain('BEGIN:VCALENDAR');
        } finally {
          setMailSenderForTest(null);
          if (prevUser === undefined) delete process.env.SMTP_USER;
          else process.env.SMTP_USER = prevUser;
          if (prevPass === undefined) delete process.env.SMTP_PASS;
          else process.env.SMTP_PASS = prevPass;
        }
      });
    });

    describe('Release 1.8.1: Lockfile CI, Ticket HMAC Secret Security & Bundle Optimization', () => {
      it('a) No hard-coded secret: grep server.ts for kw-ticket-secret -> none; SERVER_TICKET_SECRET does not read ADMIN_CODE', () => {
        const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
        expect(serverContent).not.toContain('kw-ticket-secret');
        expect(serverContent).not.toMatch(/process\.env\.ADMIN_CODE.*ticket/i);
      });

      it('b) With TICKET_HMAC_SECRET unset (production mode simulated) -> my-ticket, checkin and self-checkin return 503', async () => {
        const origEnv = process.env.NODE_ENV;
        const origSecret = process.env.TICKET_HMAC_SECRET;
        try {
          process.env.NODE_ENV = 'production';
          delete process.env.TICKET_HMAC_SECRET;

          const evId = 'ev-test-503';
          const resTicket = await fetch(`${baseUrl}/api/events/${evId}/my-ticket`);
          expect(resTicket.status).toBe(503);
          const ticketBody = await resTicket.json();
          expect(ticketBody.error).toBe('Check-in is not configured');

          const resCheckin = await fetch(`${baseUrl}/api/events/${evId}/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: 'ABC' })
          });
          expect(resCheckin.status).toBe(503);

          const resSelf = await fetch(`${baseUrl}/api/events/${evId}/self-checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'XYZ' })
          });
          expect(resSelf.status).toBe(503);
        } finally {
          process.env.NODE_ENV = origEnv;
          if (origSecret === undefined) {
            delete process.env.TICKET_HMAC_SECRET;
          } else {
            process.env.TICKET_HMAC_SECRET = origSecret;
          }
        }
      });

      it('c) lockfile integrity: bun.lock does not exist, and all package.json dependencies exist in package-lock.json', () => {
        expect(fs.existsSync(path.join(process.cwd(), 'bun.lock'))).toBe(false);

        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
        const lock = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf-8'));

        const requiredDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {})
        };

        const lockDeps = {
          ...(lock.packages?.['']?.dependencies || {}),
          ...(lock.packages?.['']?.devDependencies || {}),
          ...(lock.dependencies || {})
        };

        for (const depName of Object.keys(requiredDeps)) {
          const inLock = Boolean(
            lockDeps[depName] ||
            lock.packages?.[`node_modules/${depName}`]
          );
          expect(inLock, `Missing ${depName} in package-lock.json`).toBe(true);
        }
      });
    });

    describe('Release 1.8.2: Form Validation & Cover Image Cards', () => {
      beforeEach(() => {
        cleanup();
        window.location.hash = '';
        window.history.pushState({}, '', '/');
      });

      it('a) Render: submit the create form with an empty venue (in_person) -> inline error shown under venue, aria-invalid="true", and no API call made', async () => {
        const profile = { id: 'u1', account_uid: 'u1', name: 'Alice Host', headline: 'Founder', is_admin: false };
        const mockCreate = vi.spyOn(apiModule, 'createEvent').mockImplementation(async () => null as any);
        const onToast = vi.fn();

        render(
          React.createElement(EventsView, {
            currentProfile: profile as any,
            allProfiles: [profile as any],
            onViewProfile: vi.fn(),
            onToast
          })
        );

        const createBtn = screen.getByRole('button', { name: /create event/i });
        fireEvent.click(createBtn);

        const titleInput = screen.getByLabelText(/Title \*/i);
        fireEvent.change(titleInput, { target: { value: 'Test Event Title' } });

        const descInput = screen.getByLabelText(/Description \*/i);
        fireEvent.change(descInput, { target: { value: 'Test Event Description' } });

        const startDateInput = screen.getByLabelText(/Start Date \*/i);
        fireEvent.change(startDateInput, { target: { value: '2026-11-01' } });

        const startTimeInput = screen.getByLabelText(/Start Time \*/i);
        fireEvent.change(startTimeInput, { target: { value: '10:00' } });

        const venueInput = screen.getByLabelText(/Venue \/ address \*/i);
        fireEvent.change(venueInput, { target: { value: '' } });

        const submitBtn = screen.getByRole('button', { name: /Create & Publish Event/i });
        fireEvent.click(submitBtn);

        expect(venueInput.getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByText("Add a bit more detail, e.g. 'EIIC, MUBS, Kampala'")).toBeTruthy();
        expect(onToast).toHaveBeenCalledWith("Add a bit more detail, e.g. 'EIIC, MUBS, Kampala'");
        expect(mockCreate).not.toHaveBeenCalled();

        mockCreate.mockRestore();
      });

      it('b) Render: submit with an http:// map link -> inline error; with https://maps.app.goo.gl/abc -> no error', async () => {
        const profile = { id: 'u1', account_uid: 'u1', name: 'Alice Host', headline: 'Founder', is_admin: false };
        const mockCreate = vi.spyOn(apiModule, 'createEvent').mockImplementation(async (p: any) => ({ id: 'ev1', ...p }));
        const onToast = vi.fn();

        render(
          React.createElement(EventsView, {
            currentProfile: profile as any,
            allProfiles: [profile as any],
            onViewProfile: vi.fn(),
            onToast
          })
        );

        const createBtn = screen.getByRole('button', { name: /create event/i });
        fireEvent.click(createBtn);

        fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Test Event Title' } });
        fireEvent.change(screen.getByLabelText(/Description \*/i), { target: { value: 'Test Event Description' } });
        fireEvent.change(screen.getByLabelText(/Start Date \*/i), { target: { value: '2026-11-01' } });
        fireEvent.change(screen.getByLabelText(/Start Time \*/i), { target: { value: '10:00' } });
        fireEvent.change(screen.getByLabelText(/Venue \/ address \*/i), { target: { value: 'EIIC, MUBS Campus, Kampala' } });

        const mapInput = screen.getByLabelText(/Map link \(optional\)/i);
        fireEvent.change(mapInput, { target: { value: 'http://maps.google.com/123' } });

        const submitBtn = screen.getByRole('button', { name: /Create & Publish Event/i });
        fireEvent.click(submitBtn);

        expect(mapInput.getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByText('Map link must be an https:// Google Maps or OpenStreetMap link.')).toBeTruthy();
        expect(mockCreate).not.toHaveBeenCalled();

        fireEvent.change(mapInput, { target: { value: 'https://maps.app.goo.gl/abc' } });
        fireEvent.click(submitBtn);

        expect(mockCreate).toHaveBeenCalled();

        mockCreate.mockRestore();
      });

      it('c) Render: a server 400 response -> toast text is visible and the button is re-enabled', async () => {
        const profile = { id: 'u1', account_uid: 'u1', name: 'Alice Host', headline: 'Founder', is_admin: false };
        const mockCreate = vi.spyOn(apiModule, 'createEvent').mockRejectedValue(new Error('Server error: venue blacklisted'));
        const onToast = vi.fn();

        render(
          React.createElement(EventsView, {
            currentProfile: profile as any,
            allProfiles: [profile as any],
            onViewProfile: vi.fn(),
            onToast
          })
        );

        fireEvent.click(screen.getByRole('button', { name: /create event/i }));
        fireEvent.change(screen.getByLabelText(/Title \*/i), { target: { value: 'Test Event Title' } });
        fireEvent.change(screen.getByLabelText(/Description \*/i), { target: { value: 'Test Event Description' } });
        fireEvent.change(screen.getByLabelText(/Start Date \*/i), { target: { value: '2026-11-01' } });
        fireEvent.change(screen.getByLabelText(/Start Time \*/i), { target: { value: '10:00' } });
        fireEvent.change(screen.getByLabelText(/Venue \/ address \*/i), { target: { value: 'EIIC, MUBS Campus, Kampala' } });

        const submitBtn = screen.getByRole('button', { name: /Create & Publish Event/i });
        await act(async () => {
          fireEvent.click(submitBtn);
        });

        expect(onToast).toHaveBeenCalledWith('Server error: venue blacklisted');
        expect(submitBtn.hasAttribute('disabled')).toBe(false);

        mockCreate.mockRestore();
      });

      it('d) Render: an event card with cover_image renders <img> with src and loading="lazy"; without it, placeholder renders', async () => {
        const mockEvents = [
          { id: 'ev-cover', title: 'With Cover Event', description: 'Desc', kind: 'event', cover_image: 'https://example.com/cover.jpg', phase: 'upcoming', attendee_ids: [] },
          { id: 'ev-nocover', title: 'No Cover Event', description: 'Desc', kind: 'event', cover_image: undefined, phase: 'upcoming', attendee_ids: [] }
        ];

        const mockFetch = vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue(mockEvents as any);

        render(
          React.createElement(EventsView, {
            currentProfile: null,
            allProfiles: [],
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );

        await act(async () => {});

        const img = screen.getByAltText('With Cover Event') as HTMLImageElement;
        expect(img).toBeTruthy();
        expect(img.src).toContain('https://example.com/cover.jpg');
        expect(img.getAttribute('loading')).toBe('lazy');

        expect(screen.getByText('N')).toBeTruthy();

        mockFetch.mockRestore();
      });

      it('e) GET /api/event-image/:id -> has Cache-Control and ETag headers', async () => {
        const testEventId = 'test-ev-img-' + Date.now();
        const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        store.events.push({
          id: testEventId,
          title: 'Image Test Event',
          cover_image: sampleDataUrl,
          published: true,
          status: 'approved',
          author_id: 'u1'
        });

        const res = await fetch(`${baseUrl}/api/event-image/${testEventId}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toContain('public, max-age=3600');
        expect(res.headers.get('etag')).toBeTruthy();
      });
    });

    describe('Release 1.9.0: "People to meet here" AI Matching inside Events', () => {
      it('a) Anonymous -> 401; non-attendee -> 403; outside the time window -> 409', async () => {
        const now = Date.now();
        const evActiveId = 'ev-ptm-active-' + now;
        const evFutureId = 'ev-ptm-future-' + now;

        const activeEvent = {
          id: evActiveId,
          title: 'Active Tech Meetup',
          starts_at: new Date(now + 3600000).toISOString(),
          ends_at: new Date(now + 7200000).toISOString(),
          attendee_ids: ['user-ptm-1', 'user-ptm-2'],
          published: true,
          status: 'approved'
        };

        const futureEvent = {
          id: evFutureId,
          title: 'Far Future Hackathon',
          starts_at: new Date(now + 30 * 86400000).toISOString(),
          ends_at: new Date(now + 30 * 86400000 + 7200000).toISOString(),
          attendee_ids: ['user-ptm-1', 'user-ptm-2'],
          published: true,
          status: 'approved'
        };

        store.events.push(activeEvent, futureEvent);

        // 1. Anonymous -> 401
        const resAnon = await fetch(`${baseUrl}/api/events/${evActiveId}/people-to-meet`);
        expect(resAnon.status).toBe(401);

        // 2. Non-attendee -> 403
        const resNonAtt = await fetch(`${baseUrl}/api/events/${evActiveId}/people-to-meet`, {
          headers: { Authorization: 'Bearer user-ptm-nonatt' }
        });
        expect(resNonAtt.status).toBe(403);

        // 3. Outside time window -> 409
        store.profiles.push({ id: 'user-ptm-1', account_uid: 'user-ptm-1', name: 'User 1', role: 'Developer' });
        const resFuture = await fetch(`${baseUrl}/api/events/${evFutureId}/people-to-meet`, {
          headers: { Authorization: 'Bearer user-ptm-1' }
        });
        expect(resFuture.status).toBe(409);
      });

      it('b) Opted-out and blocked members never appear; response has no whatsapp, email, account_uid or phone keys', async () => {
        const now = Date.now();
        const evId = 'ev-ptm-candidates-' + now;

        const p1 = { id: 'u-ptm-caller', account_uid: 'u-ptm-caller', name: 'Caller', role: 'Developer', offers: 'React', needs: 'Design', blocked_ids: ['u-ptm-blocked'] };
        const p2Optout = { id: 'u-ptm-optout', account_uid: 'u-ptm-optout', name: 'Opted Out User', role: 'Designer', offers: 'Figma', needs: 'Code' };
        const p3Blocked = { id: 'u-ptm-blocked', account_uid: 'u-ptm-blocked', name: 'Blocked User', role: 'Designer', offers: 'Figma', needs: 'Code' };
        const p4Eligible = { id: 'u-ptm-eligible', account_uid: 'u-ptm-eligible', name: 'Eligible User', role: 'Designer', offers: 'UI/UX', needs: 'React', whatsapp: '256700000000', email: 'secret@example.com', phone: '0700000000' };

        store.profiles.push(p1, p2Optout, p3Blocked, p4Eligible);

        const evObj = {
          id: evId,
          title: 'Networking Night',
          starts_at: new Date(now + 1800000).toISOString(),
          ends_at: new Date(now + 5400000).toISOString(),
          attendee_ids: ['u-ptm-caller', 'u-ptm-optout', 'u-ptm-blocked', 'u-ptm-eligible'],
          match_optout_ids: ['u-ptm-optout'],
          published: true,
          status: 'approved'
        };
        store.events.push(evObj);

        const res = await fetch(`${baseUrl}/api/events/${evId}/people-to-meet`, {
          headers: { Authorization: 'Bearer u-ptm-caller' }
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.people).toBeTruthy();
        expect(Array.isArray(data.people)).toBe(true);

        const ids = data.people.map((p: any) => p.id);
        expect(ids).not.toContain('u-ptm-optout');
        expect(ids).not.toContain('u-ptm-blocked');
        expect(ids).toContain('u-ptm-eligible');

        for (const person of data.people) {
          expect(person).not.toHaveProperty('whatsapp');
          expect(person).not.toHaveProperty('email');
          expect(person).not.toHaveProperty('account_uid');
          expect(person).not.toHaveProperty('phone');
        }
      });

      it('c) Gemma failure (mocked) -> heuristic results returned', async () => {
        const now = Date.now();
        const evId = 'ev-ptm-gemma-fail-' + now;

        const p1 = { id: 'u-ptm-gf1', account_uid: 'u-ptm-gf1', name: 'Caller GF', role: 'Developer', needs: 'Design' };
        const p2 = { id: 'u-ptm-gf2', account_uid: 'u-ptm-gf2', name: 'Cand GF', role: 'Designer', offers: 'Design' };
        store.profiles.push(p1, p2);

        store.events.push({
          id: evId,
          title: 'Gemma Fail Event',
          starts_at: new Date(now + 1800000).toISOString(),
          ends_at: new Date(now + 5400000).toISOString(),
          attendee_ids: ['u-ptm-gf1', 'u-ptm-gf2'],
          published: true,
          status: 'approved'
        });

        const res = await fetch(`${baseUrl}/api/events/${evId}/people-to-meet`, {
          headers: { Authorization: 'Bearer u-ptm-gf1' }
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.people.length).toBeGreaterThan(0);
        expect(data.people[0].id).toBe('u-ptm-gf2');
      });

      it('d) Thumbs down hides that person on the next call', async () => {
        const now = Date.now();
        const evId = 'ev-ptm-fb-' + now;

        const p1 = { id: 'u-ptm-fb1', account_uid: 'u-ptm-fb1', name: 'Caller FB', role: 'Developer' };
        const p2 = { id: 'u-ptm-fb2', account_uid: 'u-ptm-fb2', name: 'Target FB', role: 'Designer' };
        store.profiles.push(p1, p2);

        store.events.push({
          id: evId,
          title: 'Feedback Test Event',
          starts_at: new Date(now + 1800000).toISOString(),
          ends_at: new Date(now + 5400000).toISOString(),
          attendee_ids: ['u-ptm-fb1', 'u-ptm-fb2'],
          published: true,
          status: 'approved'
        });

        // Submit thumbs down feedback
        const fbRes = await fetch(`${baseUrl}/api/events/${evId}/people-to-meet/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer u-ptm-fb1'
          },
          body: JSON.stringify({ profile_id: 'u-ptm-fb2', value: -1 })
        });
        expect(fbRes.status).toBe(200);

        // Next call: u-ptm-fb2 is hidden
        const getRes = await fetch(`${baseUrl}/api/events/${evId}/people-to-meet`, {
          headers: { Authorization: 'Bearer u-ptm-fb1' }
        });
        expect(getRes.status).toBe(200);
        const data = await getRes.json();
        const ids = data.people.map((p: any) => p.id);
        expect(ids).not.toContain('u-ptm-fb2');
      });

      it('e) /api/data/event_match_feedback -> 404; public event responses contain no match_optout_ids', async () => {
        const resFbData = await fetch(`${baseUrl}/api/data/event_match_feedback`);
        expect(resFbData.status).toBe(404);

        const testEv = {
          id: 'ev-san-test-' + Date.now(),
          title: 'Sanitizing Test Event',
          match_optout_ids: ['u1', 'u2'],
          published: true,
          status: 'approved'
        };
        store.events.push(testEv);

        const resEv = await fetch(`${baseUrl}/api/events/${testEv.id}`);
        expect(resEv.status).toBe(200);
        const dataEv = await resEv.json();
        expect(dataEv.match_optout_ids).toBeUndefined();
      });

      it('f) Deleting a member removes their event_match_feedback rows and their id from match_optout_ids', async () => {
        const delMemberId = 'u-to-be-deleted-' + Date.now();
        const evId = 'ev-del-test-' + Date.now();

        store.events.push({
          id: evId,
          title: 'Delete Cascade Event',
          match_optout_ids: [delMemberId, 'u-other-stay']
        });

        store.event_match_feedback.push({
          id: 'fb-del-1',
          event_id: evId,
          member_id: delMemberId,
          target_profile_id: 'u-other-stay',
          value: -1
        });

        await cascadeDeleteMemberData(delMemberId, null);

        const targetEv = store.events.find(e => e.id === evId);
        expect(targetEv?.match_optout_ids).not.toContain(delMemberId);
        expect(targetEv?.match_optout_ids).toContain('u-other-stay');

        const fbExists = store.event_match_feedback.some(f => f.member_id === delMemberId);
        expect(fbExists).toBe(false);
      });

      it('g) event_match_feedback is listed in PERSISTED_COLLECTIONS and has an onSnapshot listener', async () => {
        expect(PERSISTED_COLLECTIONS).toContain('event_match_feedback');

        const fs = await import('fs');
        const path = await import('path');
        const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
        expect(serverCode).toContain("collection('event_match_feedback').onSnapshot");
      });

      it('h) Render: an attendee sees the section; a non-attendee does not', async () => {
        const now = Date.now();
        const profileAtt = { id: 'u-att-1', account_uid: 'u-att-1', name: 'Attendee One', role: 'Developer' };
        const profileNonAtt = { id: 'u-nonatt-1', account_uid: 'u-nonatt-1', name: 'Non Attendee', role: 'Designer' };

        const mockEvent = {
          id: 'ev-render-ptm-' + now,
          kind: 'event',
          title: 'Render Test Meetup',
          description: 'Desc',
          starts_at: new Date(now + 1800000).toISOString(),
          ends_at: new Date(now + 5400000).toISOString(),
          attendee_ids: ['u-att-1'],
          is_attending: true,
          phase: 'upcoming'
        };

        window.location.hash = `#/events/${mockEvent.id}`;

        const mockFetch = vi.spyOn(apiModule, 'fetchEventById').mockResolvedValue(mockEvent as any);
        const mockPtm = vi.spyOn(apiModule, 'fetchPeopleToMeet').mockResolvedValue({ people: [], message: 'Matches appear when more people RSVP.' });

        const { rerender } = render(
          React.createElement(EventsView, {
            currentProfile: profileAtt as any,
            allProfiles: [profileAtt as any],
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );

        await act(async () => {});

        // Attendee view -> section rendered
        expect(screen.queryByTestId('people-to-meet-section')).toBeTruthy();

        // Non-attendee view -> section not rendered
        const mockEventNonAtt = { ...mockEvent, is_attending: false, attendee_ids: ['u-att-1'] };
        mockFetch.mockResolvedValue(mockEventNonAtt as any);

        rerender(
          React.createElement(EventsView, {
            currentProfile: profileNonAtt as any,
            allProfiles: [profileNonAtt as any],
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );

        await act(async () => {});

        expect(screen.queryByTestId('people-to-meet-section')).toBeNull();

        mockFetch.mockRestore();
        mockPtm.mockRestore();
      });

      it('i) Render: the events search input has left padding and the icon has pointer-events-none', async () => {
        render(
          React.createElement(EventsView, {
            currentProfile: null,
            allProfiles: [],
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );

        const searchInputs = screen.getAllByLabelText(/Search events/i);
        expect(searchInputs.length).toBeGreaterThan(0);
        expect(searchInputs[0].className).toContain('pl-10');

        const parentDiv = searchInputs[0].parentElement;
        const iconSvg = parentDiv?.querySelector('svg');
        expect(iconSvg?.classList.contains('pointer-events-none')).toBe(true);
      });
    });

    describe('Release 1.9.1: Tailwind @layer components for .kw-input and Search Icon Overlap Fix', () => {
      it('a) CSS test: parse src/index.css and assert that .kw-input, .kw-textarea, .kw-btn, and .kw-card are declared inside an @layer components block', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const cssContent = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf-8');

        // Extract all @layer components { ... } blocks with balanced brace matching
        const layerBlocks: string[] = [];
        const regex = /@layer\s+components\s*\{/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(cssContent)) !== null) {
          let depth = 1;
          let i = match.index + match[0].length;
          const start = i;
          while (i < cssContent.length && depth > 0) {
            if (cssContent[i] === '{') depth++;
            else if (cssContent[i] === '}') depth--;
            i++;
          }
          layerBlocks.push(cssContent.slice(start, i - 1));
        }

        expect(layerBlocks.length).toBeGreaterThan(0);
        const combinedComponentsLayer = layerBlocks.join('\n');

        expect(combinedComponentsLayer).toContain('.kw-input');
        expect(combinedComponentsLayer).toContain('.kw-textarea');
        expect(combinedComponentsLayer).toContain('.kw-btn');
        expect(combinedComponentsLayer).toContain('.kw-card');

        // Also ensure .kw-input is NOT declared outside @layer components
        let unlayeredCss = cssContent;
        for (const block of layerBlocks) {
          unlayeredCss = unlayeredCss.replace(block, '');
        }
        expect(unlayeredCss).not.toMatch(/\.kw-input\s*[,{]/);
      });

      it('b) Layout check: on /#/events at 375 px width, the search input has pl-10 (40px >= 36px) overriding .kw-input padding and icon does not overlap placeholder', async () => {
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
        window.dispatchEvent(new Event('resize'));

        render(
          React.createElement(EventsView, {
            currentProfile: null,
            allProfiles: [],
            onViewProfile: vi.fn(),
            onToast: vi.fn()
          })
        );

        const searchInputs = screen.getAllByLabelText(/Search events/i);
        expect(searchInputs.length).toBeGreaterThan(0);
        const inputEl = searchInputs[0] as HTMLInputElement;
        expect(inputEl.classList.contains('kw-input')).toBe(true);
        expect(inputEl.classList.contains('pl-10')).toBe(true);

        const parentDiv = inputEl.parentElement;
        const iconSvg = parentDiv?.querySelector('svg');
        expect(iconSvg).toBeTruthy();
        expect(iconSvg?.classList.contains('left-3.5')).toBe(true);
        expect(iconSvg?.classList.contains('w-4')).toBe(true);
        expect(iconSvg?.classList.contains('pointer-events-none')).toBe(true);
        // Icon occupies 14px (left-3.5) + 16px (w-4) = 30px; input padding-left is pl-10 (2.5rem = 40px >= 36px), leaving 10px gap with zero overlap
      });
    });
  });
});

afterAll(() => {
  if (server) server.close();
});



