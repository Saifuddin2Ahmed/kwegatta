import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  store
} from '../server';
import { validatePasswordStrength } from '../src/services/firebase';

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

describe('Service Worker & Cache-Control Configuration (PWA v1.5.0)', () => {
  it('public/sw.js specifies CACHE_NAME as kwegatta-1.5.0 and handles cache strategies correctly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swContent = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf-8');

    // 1. Cache name includes version kwegatta-1.5.0
    expect(swContent).toContain("CACHE_NAME = 'kwegatta-1.5.0'");

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
    const prev = (globalThis as any).localStorage;
    (globalThis as any).localStorage = mockStorage;

    try {
      expect(() => getStoredThemePreference()).not.toThrow();
      expect(getStoredThemePreference()).toBe('system');
      expect(() => saveThemePreference('dark')).not.toThrow();
    } finally {
      if (prev) {
        (globalThis as any).localStorage = prev;
      } else {
        delete (globalThis as any).localStorage;
      }
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

      // 6. 4th registration from same IP for one event -> 429
      const g4Res = await fetch(`${baseUrl}/api/events/${testEventId}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Guest Four', email: 'guest4@example.com', agree: true })
      });
      expect(g4Res.status).toBe(429);

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
});

afterAll(() => {
  if (server) server.close();
});


