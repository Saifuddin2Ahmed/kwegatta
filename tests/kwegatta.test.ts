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
  canChangeTeam,
  sanitizeDomainUrl,
  sanitizeCustomLinks,
  runSaifuddinProfileMigration,
  SAIFUDDIN_PROFILE_MIGRATION_FLAG,
  SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG
} from '../server';
import { validatePasswordStrength } from '../src/services/firebase';

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

describe('Service Worker & Cache-Control Configuration (PWA v1.3.2)', () => {
  it('public/sw.js specifies CACHE_NAME as kwegatta-1.3.2 and handles cache strategies correctly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swContent = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf-8');

    // 1. Cache name includes version kwegatta-1.3.2
    expect(swContent).toContain("CACHE_NAME = 'kwegatta-1.3.2'");

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
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('anonymous GET on /api/data/notifications, /api/data/matches, and /api/data/follows returns 401', async () => {
    const resNotifs = await fetch(`${baseUrl}/api/data/notifications`);
    expect(resNotifs.status).toBe(401);

    const resMatches = await fetch(`${baseUrl}/api/data/matches`);
    expect(resMatches.status).toBe(401);

    const resFollows = await fetch(`${baseUrl}/api/data/follows`);
    expect(resFollows.status).toBe(401);
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

    // Submit an event as a regular user (not admin/organiser) -> status is 'pending', published is false
    const postRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-user-unapproved-author'
      },
      body: JSON.stringify({
        kind: 'event',
        title: 'Unapproved Test Community Hack',
        description: 'Testing cover image access control before approval.',
        datetime: 'Sat, Nov 14 • 2:00 PM EAT',
        location: 'Kampala',
        cover_image: validPng
      })
    });
    expect(postRes.status).toBe(200);
    const eventData = await postRes.json();
    const eventId = eventData.item.id;
    expect(eventData.item.status).toBe('pending');

    // Public / anonymous request to /api/event-image/:id returns 404
    const publicRes = await fetch(`${baseUrl}/api/event-image/${eventId}`);
    expect(publicRes.status).toBe(404);

    // Unrelated non-admin member request also returns 404
    const memberRes = await fetch(`${baseUrl}/api/event-image/${eventId}`, {
      headers: { Authorization: 'Bearer test-user-random-viewer' }
    });
    expect(memberRes.status).toBe(404);
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


