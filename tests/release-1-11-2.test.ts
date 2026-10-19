import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { app, store, setMailSenderForTest, buildEventEmail, sendEventCancelledEmail } from '../server';

let server: any;
let baseUrl: string;
const sent: any[] = [];
const savedEnv = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };

const SMTP_USER = 'events@kwegatta.test';
const SMTP_PASS = 'not-a-real-password-1112';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

async function api(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...JSON_HEADERS, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

/** Production shape: profile id differs from the Firebase uid; email may live only on the token. */
function addMember(profileId: string, uid: string, extra: Record<string, unknown> = {}) {
  if (!store.profiles.some((p: any) => p.id === profileId)) {
    store.profiles.push({
      id: profileId,
      account_uid: uid,
      name: `Person ${profileId}`,
      headline: 'Builder in Kampala',
      role: 'Developer',
      created_at: new Date().toISOString(),
      ...extra
    });
  }
}

const eventBody = (title: string, extra: Record<string, unknown> = {}) => ({
  kind: 'event',
  title,
  description: 'An evening of demos.',
  start_date: '2027-04-01',
  start_time: '18:00',
  timezone: 'Africa/Kampala',
  format: 'in_person',
  location: 'Kampala Innovation Hub',
  ...extra
});

async function createEvent(hostProfileId: string, hostUid: string, title: string, extra: Record<string, unknown> = {}) {
  addMember(hostProfileId, hostUid, { email: `${hostUid}@kwegatta.test` });
  const r = await api('POST', '/api/events', auth(hostUid), eventBody(title, extra));
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.item;
}

const guestRegister = (eventId: string, body: Record<string, unknown>) =>
  api('POST', `/api/events/${eventId}/guest-register`, {}, { agree: true, ...body });

/** Every "[Email] ..." line written during fn, and the messages handed to the mail sender. */
async function captureEmail(fn: () => Promise<void>) {
  const lines: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { lines.push(a.join(' ')); });
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: any[]) => { lines.push(a.join(' ')); });
  const before = sent.length;
  try {
    await fn();
  } finally {
    log.mockRestore();
    warn.mockRestore();
  }
  return { lines: lines.filter(l => l.startsWith('[Email]')), mails: sent.slice(before) };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SMTP_USER = SMTP_USER;
  process.env.SMTP_PASS = SMTP_PASS;
  setMailSenderForTest(async (opts: any) => {
    sent.push(opts);
  });
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  setMailSenderForTest(null);
  if (savedEnv.user === undefined) delete process.env.SMTP_USER;
  else process.env.SMTP_USER = savedEnv.user;
  if (savedEnv.pass === undefined) delete process.env.SMTP_PASS;
  else process.env.SMTP_PASS = savedEnv.pass;
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------- */
describe('Cancellation email reaches the recipient', () => {
  it('guest flow seen in production: guest-register then guest-cancel sends "Registration cancelled"', async () => {
    const ev = await createEvent('p-host-a', 'uid-host-a', 'Guest Cancel Night');
    const reg = await guestRegister(ev.id, { name: 'Guest Gina', email: 'gina@example.com' });
    expect(reg.status, JSON.stringify(reg.json)).toBe(200);
    expect(sent.at(-1).subject).toBe('Confirmation: Guest Cancel Night');

    const { lines, mails } = await captureEmail(async () => {
      const r = await api('POST', `/api/events/${ev.id}/guest-cancel`, {}, { token: reg.json.token });
      expect(r.status).toBe(200);
    });
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('gina@example.com');
    expect(mails[0].subject).toBe('Registration cancelled: Guest Cancel Night');
    expect(lines).toEqual(['[Email] sent']);
  });

  it('member flow: profile id differs from the Firebase uid and the address is only on the token', async () => {
    const ev = await createEvent('p-host-b', 'uid-host-b', 'Member Cancel Night');
    addMember('p-mem-b', 'uid-mem-b'); // no email on the profile
    const going = await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-b'));
    expect(going.json.status).toBe('going');
    expect(store.events.find((e: any) => e.id === ev.id).attendee_ids).toContain('p-mem-b');

    const { lines, mails } = await captureEmail(async () => {
      const r = await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-b'), { action: 'cancel' });
      expect(r.json.status).toBe('cancelled');
    });
    expect(mails.map(m => `${m.to} | ${m.subject}`)).toEqual(['uid-mem-b@kwegatta.test | Registration cancelled: Member Cancel Night']);
    expect(lines).toEqual(['[Email] sent']);
  });

  it('the organiser registering on their own event can cancel and gets the email', async () => {
    const ev = await createEvent('p-host-c', 'uid-host-c', 'Own Event Night');
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-host-c'));
    const { mails } = await captureEmail(async () => {
      await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-host-c'), { action: 'cancel' });
    });
    expect(mails.map(m => m.subject)).toEqual(['Registration cancelled: Own Event Night']);
  });
});

/* ------------------------------------------------------------------------- */
describe('"[Email] skipped: <reason>" log lines', () => {
  it('guest without an email: skipped: no address, on register and on cancel', async () => {
    const ev = await createEvent('p-host-d', 'uid-host-d', 'Phone Only Night');
    let token = '';
    const reg = await captureEmail(async () => {
      const r = await guestRegister(ev.id, { name: 'Phone Pat', phone: '+256700000123' });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      token = r.json.token;
    });
    expect(reg.lines).toEqual(['[Email] skipped: no address']);
    const cancel = await captureEmail(async () => {
      await api('POST', `/api/events/${ev.id}/guest-cancel`, {}, { token });
    });
    expect(cancel.lines).toEqual(['[Email] skipped: no address']);
    expect(cancel.mails).toHaveLength(0);
  });

  it('leaving a waitlist (member or guest): skipped: left waitlist', async () => {
    const ev = await createEvent('p-host-e', 'uid-host-e', 'Full House Night', { capacity: 1 });
    addMember('p-mem-e1', 'uid-mem-e1');
    addMember('p-mem-e2', 'uid-mem-e2');
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-e1'));
    expect((await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-e2'))).json.status).toBe('waitlisted');
    const guest = await guestRegister(ev.id, { name: 'Wait Walt', email: 'walt@example.com' });
    expect(guest.json.status).toBe('waitlisted');

    const { lines, mails } = await captureEmail(async () => {
      await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-e2'), { action: 'cancel' });
      await api('POST', `/api/events/${ev.id}/guest-cancel`, {}, { token: guest.json.token });
    });
    expect(lines).toEqual(['[Email] skipped: left waitlist', '[Email] skipped: left waitlist']);
    expect(mails).toHaveLength(0);
  });

  it('opportunity: skipped: opportunity', async () => {
    const opp = await createEvent('p-host-f', 'uid-host-f', 'Design Internship', {
      kind: 'opportunity',
      deadline: '2027-05-01'
    });
    addMember('p-mem-f', 'uid-mem-f');
    await api('POST', `/api/events/${opp.id}/rsvp`, auth('uid-mem-f'));
    const { lines, mails } = await captureEmail(async () => {
      await api('POST', `/api/events/${opp.id}/rsvp`, auth('uid-mem-f'), { action: 'cancel' });
    });
    expect(lines).toEqual(['[Email] skipped: opportunity']);
    expect(mails).toHaveLength(0);
  });

  it('SMTP not configured: skipped: SMTP not configured', async () => {
    const ev = await createEvent('p-host-g', 'uid-host-g', 'No Mail Night');
    addMember('p-mem-g', 'uid-mem-g', { email: 'mem-g@example.com' });
    delete process.env.SMTP_PASS;
    try {
      const { lines, mails } = await captureEmail(async () => {
        await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-g'));
      });
      expect(lines).toEqual(['[Email] skipped: SMTP not configured']);
      expect(mails).toHaveLength(0);
    } finally {
      process.env.SMTP_PASS = SMTP_PASS;
    }
  });

  it('skip and send lines never contain an address', async () => {
    const ev = await createEvent('p-host-h', 'uid-host-h', 'Privacy Night');
    addMember('p-mem-h', 'uid-mem-h', { email: 'private-h@example.com' });
    const { lines } = await captureEmail(async () => {
      await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-h'));
      await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-h'), { action: 'cancel' });
      await sendEventCancelledEmail(ev, 'not-an-address', 'X');
      await api('DELETE', `/api/events/${ev.id}`, auth('uid-host-h'));
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toMatch(/@|example\.com/);
  });
});

/* ------------------------------------------------------------------------- */
describe('Deleting an event emails registered members and guests', () => {
  it('organiser delete: "Event cancelled: <title>" to members and registered guests, not the organiser or the waitlist', async () => {
    const ev = await createEvent('p-host-i', 'uid-host-i', 'Deleted Demo Night', { capacity: 3 });
    addMember('p-mem-i1', 'uid-mem-i1', { email: 'mem-i1@example.com' });
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-i1'));
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-host-i')); // organiser is also registered
    await guestRegister(ev.id, { name: 'Guest Ivy', email: 'ivy@example.com' });
    const waiting = await guestRegister(ev.id, { name: 'Guest Wes', email: 'wes@example.com' });
    expect(waiting.json.status).toBe('waitlisted');

    const { lines, mails } = await captureEmail(async () => {
      const r = await api('DELETE', `/api/events/${ev.id}`, auth('uid-host-i'));
      expect(r.status).toBe(200);
    });
    expect(mails.map(m => `${m.to} | ${m.subject}`).sort()).toEqual([
      'ivy@example.com | Event cancelled: Deleted Demo Night',
      'mem-i1@example.com | Event cancelled: Deleted Demo Night'
    ]);
    expect(lines).toEqual(['[Email] sent', '[Email] sent']);
    expect(mails[0].text).toContain('cancelled by the organiser');
    expect(mails[0].text).not.toContain(`/e/${ev.id}`);

    // In-app notice is still created
    expect(store.notifications.some((n: any) => n.to_id === 'p-mem-i1' && String(n.body).includes('Deleted Demo Night'))).toBe(true);
  });

  it('admin delete: moderator wording, same recipients rule', async () => {
    if (!Array.isArray(store.admin_emails)) store.admin_emails = [];
    if (!store.admin_emails.includes('test-admin@kwegatta.test')) store.admin_emails.push('test-admin@kwegatta.test');
    const ev = await createEvent('p-host-j', 'uid-host-j', 'Moderated Night');
    addMember('p-mem-j', 'uid-mem-j', { email: 'mem-j@example.com' });
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-j'));
    await guestRegister(ev.id, { name: 'Guest Jo', email: 'jo@example.com' });

    const { mails } = await captureEmail(async () => {
      const r = await api('DELETE', `/api/admin/events/${ev.id}`, auth('test-admin'), { reason: 'Spam or scam' });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
    });
    expect(mails.map(m => m.to).sort()).toEqual(['jo@example.com', 'mem-j@example.com']);
    for (const m of mails) {
      expect(m.subject).toBe('Event cancelled: Moderated Night');
      expect(m.text).toContain('cancelled by a moderator');
    }
  });

  it('no registrations: no email and no log line', async () => {
    const ev = await createEvent('p-host-k', 'uid-host-k', 'Empty Night');
    const { lines, mails } = await captureEmail(async () => {
      await api('DELETE', `/api/events/${ev.id}`, auth('uid-host-k'));
    });
    expect(mails).toHaveLength(0);
    expect(lines).toEqual([]);
  });
});

describe('buildEventEmail event_cancelled', () => {
  it('escapes the title and links to the app, not the deleted event page', () => {
    const { subject, text, html } = buildEventEmail('event_cancelled', { id: 'ev-x', title: '<b>Gone</b>' }, 'Ann', '');
    expect(subject).toBe('Event cancelled: <b>Gone</b>');
    expect(text).toContain('Find other events:');
    expect(text).not.toContain('/e/ev-x');
    expect(html).not.toContain('<b>Gone</b>');
    expect(html).toContain('&lt;b&gt;Gone&lt;/b&gt;');
    expect(html).not.toContain('/e/ev-x');
  });
});
