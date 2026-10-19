// Shared rules for team cards, used by the server routes and the Admin form.

export const TEAM_LIMITS = {
  name: 100,
  title: 80,
  line1: 120,
  line2: 200,
  bio: 300
} as const;

export const TEAM_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const TEAM_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type FieldResult = { ok: true; value: string | null } | { ok: false; error: string };

const ok = (value: string | null): FieldResult => ({ ok: true, value });
const fail = (error: string): FieldResult => ({ ok: false, error });

function blank(val: unknown): boolean {
  return val === undefined || val === null || String(val).trim() === '';
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

function hostIs(u: URL, ...hosts: string[]): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
  return hosts.includes(h);
}

/** Plain text with a length limit. Control characters are stripped. */
export function checkText(val: unknown, max: number, label: string, required = false): FieldResult {
  if (blank(val)) return required ? fail(`${label} is required`) : ok(null);
  if (typeof val !== 'string') return fail(`${label} must be text`);
  const clean = val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (clean.length > max) return fail(`${label} must be ${max} characters or fewer`);
  return ok(clean);
}

/** GitHub username, or a github.com profile URL (stored as the username). */
export function checkGithub(val: unknown): FieldResult {
  if (blank(val)) return ok(null);
  let s = String(val).trim();
  if (/^https?:\/\//i.test(s)) {
    const u = parseHttpUrl(s);
    if (!u || !hostIs(u, 'github.com')) return fail('GitHub must be a username or a github.com link');
    s = u.pathname.split('/').filter(Boolean)[0] || '';
  }
  s = s.replace(/^@/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(s)) return fail('GitHub username is not valid');
  return ok(s);
}

/** LinkedIn profile or company link (https). */
export function checkLinkedin(val: unknown): FieldResult {
  if (blank(val)) return ok(null);
  const s = String(val).trim();
  const u = parseHttpUrl(s.startsWith('http') ? s : `https://${s}`);
  if (!u || !hostIs(u, 'linkedin.com') || u.pathname.length < 2) {
    return fail('LinkedIn must be a linkedin.com link, e.g. https://www.linkedin.com/in/name');
  }
  u.protocol = 'https:';
  return ok(u.toString().slice(0, 300));
}

/** X (Twitter) handle or link, stored as https://x.com/<handle>. */
export function checkX(val: unknown): FieldResult {
  if (blank(val)) return ok(null);
  let s = String(val).trim();
  if (/^https?:\/\//i.test(s) || /^(www\.)?(x|twitter)\.com\//i.test(s)) {
    const u = parseHttpUrl(s.startsWith('http') ? s : `https://${s}`);
    if (!u || !hostIs(u, 'x.com', 'twitter.com')) return fail('X must be a handle or an x.com link');
    s = u.pathname.split('/').filter(Boolean)[0] || '';
  }
  s = s.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(s)) return fail('X handle is not valid');
  return ok(`https://x.com/${s}`);
}

/** Personal or project website (http or https). */
export function checkWebsite(val: unknown): FieldResult {
  if (blank(val)) return ok(null);
  const s = String(val).trim();
  if (s.length > 300) return fail('Website link is too long');
  const u = parseHttpUrl(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  if (!u) return fail('Website must be a valid link, e.g. https://example.com');
  return ok(u.toString());
}

/** WhatsApp number in international format, stored as +<digits>. */
export function checkWhatsapp(val: unknown): FieldResult {
  if (blank(val)) return ok(null);
  const s = String(val).trim();
  if (!/^\+?[\d\s().-]+$/.test(s)) return fail('WhatsApp number may only contain digits, spaces and +');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return fail('WhatsApp number must include the country code, e.g. +256 700 000000');
  }
  return ok(`+${digits}`);
}

export function whatsappLink(num: string | null | undefined): string | null {
  if (!num) return null;
  const digits = String(num).replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

/** Checks a data URL for an uploaded team photo: allowed image type and size. */
export function checkPhotoDataUrl(val: unknown): { ok: true; mime: string; bytes: number } | { ok: false; error: string } {
  if (typeof val !== 'string' || !val) return { ok: false, error: 'Photo data is required' };
  const m = val.match(/^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return { ok: false, error: 'Photo must be an uploaded image file' };
  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  if (!(TEAM_PHOTO_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: 'Photo must be a JPEG, PNG, WebP or GIF image' };
  }
  const b64 = m[2].replace(/\s/g, '');
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > TEAM_PHOTO_MAX_BYTES) return { ok: false, error: 'Photo must be 5 MB or smaller' };
  if (bytes < 32) return { ok: false, error: 'Photo file is empty or damaged' };
  return { ok: true, mime, bytes };
}

export const TEAM_TEXT_FIELDS = [
  ['name', 'Name', TEAM_LIMITS.name],
  ['title', 'Role', TEAM_LIMITS.title],
  ['line1', 'Background', TEAM_LIMITS.line1],
  ['line2', 'Organisation', TEAM_LIMITS.line2],
  ['bio', 'Bio', TEAM_LIMITS.bio]
] as const;

export const TEAM_LINK_FIELDS = {
  github: checkGithub,
  linkedin: checkLinkedin,
  x: checkX,
  website: checkWebsite,
  whatsapp: checkWhatsapp
} as const;

export const TEAM_VISIBILITY_FLAGS = [
  'show_title',
  'show_line1',
  'show_bio',
  'show_linkedin',
  'show_x',
  'show_website',
  'show_whatsapp',
  'show_since'
] as const;

/**
 * Validates a create/update payload. Only keys present in `raw` are checked
 * (unless `requireName`). Returns the cleaned values or the first error per field.
 */
export function validateTeamPayload(
  raw: Record<string, unknown>,
  requireName: boolean
): { ok: true; values: Record<string, string | boolean | null> } | { ok: false; errors: Record<string, string> } {
  const values: Record<string, string | boolean | null> = {};
  const errors: Record<string, string> = {};
  // Older clients send "role" for the title.
  const src: Record<string, unknown> = { ...raw };
  if (src.title === undefined && src.role !== undefined) src.title = src.role;

  for (const [key, label, max] of TEAM_TEXT_FIELDS) {
    if (src[key] === undefined && !(key === 'name' && requireName)) continue;
    const r = checkText(src[key], max, label, key === 'name');
    if (r.ok) values[key] = key === 'name' ? r.value : (r.value ?? '');
    else errors[key] = r.error;
  }
  for (const [key, check] of Object.entries(TEAM_LINK_FIELDS)) {
    if (src[key] === undefined) continue;
    const r = check(src[key]);
    if (r.ok) values[key] = r.value;
    else errors[key] = r.error;
  }
  for (const flag of [...TEAM_VISIBILITY_FLAGS, 'hidden'] as const) {
    if (src[flag] !== undefined) values[flag] = src[flag] === true || src[flag] === 'true';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
