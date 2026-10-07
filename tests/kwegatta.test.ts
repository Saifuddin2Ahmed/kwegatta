import { describe, it, expect } from 'vitest';
import {
  validateGemmaModelId,
  sanitizePublicProfile,
  ALLOWED_OPEN_WEIGHT_MODELS,
  DEFAULT_OPEN_WEIGHT_MODEL,
  getAdminEmailsList,
  ALLOWED_GEMMA_TASKS,
  buildGemmaPrompt,
  canApproveEvent,
  canEditEvent,
  filterEventsForCaller
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

