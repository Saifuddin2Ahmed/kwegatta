import { describe, it, expect } from 'vitest';
import { validateGemmaModelId, sanitizePublicProfile, ALLOWED_OPEN_WEIGHT_MODELS, DEFAULT_OPEN_WEIGHT_MODEL } from '../server';
import { validatePasswordStrength } from '../src/services/firebase';

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
