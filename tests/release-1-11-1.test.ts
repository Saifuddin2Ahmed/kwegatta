// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import {
  app,
  store,
  setMailSenderForTest,
  buildEventEmail,
  buildEmailFrom,
  formatEmailEventDate,
  sendEventConfirmationEmail,
  sendRegistrationCancelledEmail,
  selectNewEventRecipients,
  sanitizePublicProfile,
  NEW_EVENT_TAG_MATCH_CAP,
  NEW_EVENT_DAILY_CAP_PER_MEMBER
} from '../server';
import * as apiModule from '../src/services/api';
import { EventsView } from '../src/components/EventsView';

let server: any;
let baseUrl: string;
const sent: any[] = [];
const savedEnv = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };

const SMTP_USER = 'events@kwegatta.test';
const SMTP_PASS = 'not-a-real-password-1111';
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

function addProfile(uid: string, extra: Record<string, unknown> = {}) {
  if (!store.profiles.some((p: any) => p.id === uid)) {
    store.profiles.push({
      id: uid,
      account_uid: uid,
      name: `Person ${uid}`,
      email: `${uid}@kwegatta.test`,
      headline: 'Builder in Kampala',
      role: 'Developer',
      needs: 'A designer',
      offers: 'React',
      created_at: new Date().toISOString(),
      ...extra
    });
  }
}

const eventBody = (title: string, extra: Record<string, unknown> = {}) => ({
  kind: 'event',
  title,
  description: 'An evening of demos.',
  start_date: '2027-03-01',
  start_time: '18:00',
  timezone: 'Africa/Kampala',
  format: 'in_person',
  location: 'Kampala Innovation Hub',
  ...extra
});

async function createEvent(hostUid: string, title: string, extra: Record<string, unknown> = {}) {
  addProfile(hostUid);
  const r = await api('POST', '/api/events', auth(hostUid), eventBody(title, extra));
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.item;
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
  cleanup();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------- */
describe('RSVP cancel: server', () => {
  it('cancelling frees the seat, promotes the first waitlisted member and never re-registers on a repeat', async () => {
    const ev = await createEvent('c1-host', 'Cancel Flow Night', { capacity: 1 });
    for (const uid of ['c1-going', 'c1-wait']) addProfile(uid);

    expect((await api('POST', `/api/events/${ev.id}/rsvp`, auth('c1-going'))).json.status).toBe('going');
    const wait = await api('POST', `/api/events/${ev.id}/rsvp`, auth('c1-wait'));
    expect(wait.json.status).toBe('waitlisted');

    const cancel = await api('POST', `/api/events/${ev.id}/rsvp`, auth('c1-going'), { action: 'cancel' });
    expect(cancel.status).toBe(200);
    expect(cancel.json.status).toBe('cancelled');
    expect(cancel.json.is_attending).toBe(false);

    const stored = store.events.find((e: any) => e.id === ev.id);
    expect(stored.attendee_ids).toEqual(['c1-wait']);
    expect(stored.waitlist_ids).toEqual([]);
    expect(store.notifications.some((n: any) => n.to_id === 'c1-wait' && n.type === 'waitlist_promoted' && n.event_id === ev.id)).toBe(true);

    // A second tap on "Cancel registration" must not sign the member back up
    const again = await api('POST', `/api/events/${ev.id}/rsvp`, auth('c1-going'), { action: 'cancel' });
    expect(again.json.status).toBe('none');
    expect(stored.attendee_ids).not.toContain('c1-going');
  });

  it('cancel on the waitlist leaves the waitlist', async () => {
    const ev = await createEvent('c2-host', 'Waitlist Leave Night', { capacity: 1 });
    for (const uid of ['c2-going', 'c2-wait']) addProfile(uid);
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c2-going'));
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c2-wait'));

    const leave = await api('POST', `/api/events/${ev.id}/rsvp`, auth('c2-wait'), { action: 'cancel' });
    expect(leave.json.status).toBe('left_waitlist');
    const stored = store.events.find((e: any) => e.id === ev.id);
    expect(stored.waitlist_ids).toEqual([]);
    expect(stored.attendee_ids).toEqual(['c2-going']);
  });

  it('sends a short "Registration cancelled" email without a calendar file', async () => {
    const ev = await createEvent('c3-host', 'Cancellation Email Night');
    addProfile('c3-member');
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c3-member'));
    sent.length = 0;

    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c3-member'), { action: 'cancel' });
    expect(sent.length).toBe(1);
    const mail = sent[0];
    expect(mail.to).toBe('c3-member@kwegatta.test');
    expect(mail.subject).toBe('Registration cancelled: Cancellation Email Night');
    expect(mail.from).toBe(`"Kwegatta Events" <${SMTP_USER}>`);
    expect(mail.text).toContain('has been cancelled');
    expect(mail.html).toContain('Cancellation Email Night');
    expect(mail.attachments).toBeUndefined();
  });

  it('the promoted member gets a "spot opened up" email', async () => {
    const ev = await createEvent('c4-host', 'Promotion Email Night', { capacity: 1 });
    for (const uid of ['c4-going', 'c4-wait']) addProfile(uid);
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c4-going'));
    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c4-wait'));
    sent.length = 0;

    await api('POST', `/api/events/${ev.id}/rsvp`, auth('c4-going'), { action: 'cancel' });
    const subjects = sent.map(m => `${m.to} | ${m.subject}`);
    expect(subjects).toContain('c4-wait@kwegatta.test | A spot opened up: Promotion Email Night');
    expect(subjects).toContain('c4-going@kwegatta.test | Registration cancelled: Promotion Email Night');
  });
});

/* ------------------------------------------------------------------------- */
describe('RSVP cancel: event detail and card', () => {
  const profile: any = { id: 'ui-member', name: 'UI Member', headline: 'Builder', role: 'Developer', created_at: new Date().toISOString() };
  const baseEvent = (extra: Record<string, unknown> = {}) => ({
    id: 'ui-ev-1',
    kind: 'event',
    title: 'Card Cancel Night',
    description: 'Demos',
    starts_at: '2027-03-01T15:00:00.000Z',
    ends_at: '2027-03-01T18:00:00.000Z',
    timezone: 'Africa/Kampala',
    format: 'in_person',
    location: 'Kampala',
    author_id: 'someone-else',
    author_name: 'Host',
    attendee_ids: ['ui-member'],
    attendee_count: 1,
    status: 'published',
    published: true,
    created_at: new Date().toISOString(),
    ...extra
  });

  async function renderList(item: any) {
    vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([item]);
    window.location.hash = '#/events';
    const onToast = vi.fn();
    await act(async () => {
      render(React.createElement(EventsView, { currentProfile: profile, allProfiles: [profile], onViewProfile: vi.fn(), onToast }));
    });
    return onToast;
  }

  it('shows "You\'re going" with a visible Cancel registration button and confirms before cancelling', async () => {
    const cancelSpy = vi.spyOn(apiModule, 'cancelRsvp').mockResolvedValue({
      success: true, status: 'cancelled', is_attending: false, attendee_count: 0, waitlist_count: 0
    });
    const onToast = await renderList(baseEvent());

    expect(await screen.findByText("✓ You're going")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Cancel your registration for Card Cancel Night?');
    expect(screen.getByRole('button', { name: 'Keep my spot' })).toBeTruthy();

    const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Cancel registration')!;
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(cancelSpy).toHaveBeenCalledWith('ui-ev-1');
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('Registration cancelled'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Keep my spot" closes the dialog without cancelling', async () => {
    const cancelSpy = vi.spyOn(apiModule, 'cancelRsvp');
    await renderList(baseEvent());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel registration' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my spot' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('a waitlisted member sees "Leave waitlist" with its own confirm step', async () => {
    const cancelSpy = vi.spyOn(apiModule, 'cancelRsvp').mockResolvedValue({
      success: true, status: 'left_waitlist', is_attending: false, attendee_count: 1, waitlist_count: 0
    });
    const onToast = await renderList(baseEvent({ attendee_ids: ['x'], capacity: 1, my_waitlist_position: 1 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave waitlist' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Leave the waitlist for Card Cancel Night?');
    const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Leave waitlist')!;
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(cancelSpy).toHaveBeenCalledWith('ui-ev-1');
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('You left the waitlist'));
  });
});

/* ------------------------------------------------------------------------- */
describe('Email: HTML part, escaping, From name and logging', () => {
  const nasty = {
    id: 'mail-ev-1',
    title: '<script>alert("x")</script> & Friends',
    starts_at: '2026-11-14T11:00:00.000Z',
    timezone: 'Africa/Kampala',
    format: 'in_person',
    venue: '<img src=x onerror=alert(1)> Hall "A"',
    author_name: '<b>Org</b>',
    description: 'desc'
  };

  it('From is "Kwegatta Events <SMTP_USER>"', () => {
    expect(buildEmailFrom(SMTP_USER)).toBe(`"Kwegatta Events" <${SMTP_USER}>`);
    expect(buildEmailFrom('')).toBe('');
  });

  it('formats the date in the event timezone', () => {
    expect(formatEmailEventDate(nasty)).toBe('Sat, 14 Nov 2026 · 2:00 PM EAT');
  });

  it('escapes all user text in the HTML part and keeps the plain-text part', () => {
    const { html, text } = buildEventEmail('confirmation', nasty, '<i>Ann</i>', 'https://kwegatta.test/#/events/mail-ev-1/ticket');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Org</b>');
    expect(html).not.toContain('<i>Ann</i>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Friends');
    expect(html).toContain('Hall &quot;A&quot;');
    expect(html).toContain('View your ticket');
    expect(html).toContain('Sat, 14 Nov 2026 · 2:00 PM EAT');
    expect(html).toContain('You received this because you registered on Kwegatta. Reply to contact the organiser.');
    expect(html).toContain('Add to calendar');
    expect(html).not.toMatch(/<style|<link|<img/i);
    expect(text).toContain('Date & Time: Sat, 14 Nov 2026 · 2:00 PM EAT');
    expect(text).toContain('View your ticket: https://kwegatta.test/#/events/mail-ev-1/ticket');
  });

  it('online events show only http(s) join links', () => {
    const { html } = buildEventEmail('confirmation', { ...nasty, format: 'online', join_link: 'javascript:alert(1)' }, 'Ann', 'https://kwegatta.test/t');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Provided on event page');
  });

  it('confirmation email has html, text and the .ics attachment', async () => {
    sent.length = 0;
    expect(await sendEventConfirmationEmail(nasty, 'ann@kwegatta.test', 'Ann', 'https://kwegatta.test/t')).toBe(true);
    expect(sent[0].html).toContain('<!doctype html>');
    expect(sent[0].text).toContain('Hi Ann,');
    expect(sent[0].attachments[0].filename).toBe('event.ics');
    expect(sent[0].from).toBe(`"Kwegatta Events" <${SMTP_USER}>`);
  });

  it('logs only "[Email] sent" or "[Email] failed: <reason>" with no address or password', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await sendRegistrationCancelledEmail(nasty, 'ann@kwegatta.test', 'Ann');
    expect(log).toHaveBeenCalledWith('[Email] sent');

    setMailSenderForTest(async () => {
      throw new Error(`550 rejected <ann@kwegatta.test> auth ${SMTP_PASS}`);
    });
    try {
      expect(await sendRegistrationCancelledEmail(nasty, 'ann@kwegatta.test', 'Ann')).toBe(false);
    } finally {
      setMailSenderForTest(async (opts: any) => {
        sent.push(opts);
      });
    }
    const lines = [...log.mock.calls, ...warn.mock.calls].map(c => c.join(' '));
    const failed = lines.find(l => l.startsWith('[Email] failed: '));
    expect(failed).toBeTruthy();
    for (const l of lines) {
      expect(l).not.toContain('ann@kwegatta.test');
      expect(l).not.toContain(SMTP_PASS);
      expect(l).not.toContain(SMTP_USER);
    }
  });
});

/* ------------------------------------------------------------------------- */
describe('New-event notifications: targeting, caps and the member setting', () => {
  const newEventNotifs = (eventId: string) =>
    store.notifications.filter((n: any) => n.event_id === eventId && n.source === 'new_event').map((n: any) => n.to_id);

  it('notifies followers and tag matches only, and respects the setting', async () => {
    addProfile('n1-host');
    addProfile('n1-follower');
    addProfile('n1-match', { skills: ['Zz Flutter'] });
    addProfile('n1-match-interest', { tags: ['zzflutter'] });
    addProfile('n1-nomatch', { skills: ['Rust'] });
    addProfile('n1-off', { skills: ['zzflutter'], notify_new_events: 'off' });
    addProfile('n1-following-only', { skills: ['zzflutter'], notify_new_events: 'following' });
    addProfile('n1-following-follower', { notify_new_events: 'following' });
    addProfile('n1-off-follower', { notify_new_events: 'off' });
    addProfile('n1-suspended', { skills: ['zzflutter'], suspended: true });
    for (const f of ['n1-follower', 'n1-following-follower', 'n1-off-follower']) {
      store.follows.push({ id: `follow-${f}`, follower_id: f, following_id: 'n1-host', created_at: new Date().toISOString() });
    }

    const ev = await createEvent('n1-host', 'Flutter Builders Night', { tags: ['zzflutter', 'zzmobile'] });
    const to = newEventNotifs(ev.id);
    expect(to.sort()).toEqual(['n1-follower', 'n1-following-follower', 'n1-match', 'n1-match-interest'].sort());
  });

  it('an event with no tags reaches only followers, never every member', async () => {
    addProfile('n2-host');
    addProfile('n2-follower');
    store.follows.push({ id: 'follow-n2', follower_id: 'n2-follower', following_id: 'n2-host', created_at: new Date().toISOString() });
    const ev = await createEvent('n2-host', 'Untagged Meetup Night');
    expect(newEventNotifs(ev.id)).toEqual(['n2-follower']);
    expect(store.profiles.length).toBeGreaterThan(5);
  });

  it(`caps tag matches at ${NEW_EVENT_TAG_MATCH_CAP} per event`, () => {
    for (let i = 0; i < NEW_EVENT_TAG_MATCH_CAP + 15; i++) addProfile(`n3-m${i}`, { skills: ['zzcaptag'] });
    const picked = selectNewEventRecipients({ tags: ['zzcaptag'] }, ['n3-host']);
    expect(picked.length).toBe(NEW_EVENT_TAG_MATCH_CAP);
  });

  it(`gives a member at most ${NEW_EVENT_DAILY_CAP_PER_MEMBER} new-event notifications per day`, async () => {
    addProfile('n4-member', { skills: ['zzdaily'] });
    const hosts = ['n4-h1', 'n4-h2', 'n4-h3', 'n4-h4'];
    const got: boolean[] = [];
    for (const h of hosts) {
      const ev = await createEvent(h, `Daily Cap Night ${h}`, { tags: ['zzdaily'] });
      got.push(newEventNotifs(ev.id).includes('n4-member'));
    }
    expect(got).toEqual([true, true, true, false]);

    // Yesterday's notifications do not count toward today
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    expect(selectNewEventRecipients({ tags: ['zzdaily'] }, ['n4-h5'], tomorrow).map(p => p.id)).toContain('n4-member');
  });

  it('members can change the setting; bad values are ignored; other members cannot see it', async () => {
    addProfile('n5-member');
    let r = await api('PATCH', '/api/data/profiles/n5-member', auth('n5-member'), { notify_new_events: 'following' });
    expect(r.status).toBe(200);
    expect(r.json.notify_new_events).toBe('following');

    r = await api('PATCH', '/api/data/profiles/n5-member', auth('n5-member'), { notify_new_events: 'loud' });
    expect(r.status).toBe(200);
    const p = store.profiles.find((x: any) => x.id === 'n5-member');
    expect(p.notify_new_events).toBe('following');

    expect(sanitizePublicProfile(p, 'n5-member').notify_new_events).toBe('following');
    expect(sanitizePublicProfile(p, 'someone-else').notify_new_events).toBeUndefined();
    addProfile('n5-default');
    expect(sanitizePublicProfile(store.profiles.find((x: any) => x.id === 'n5-default'), 'n5-default').notify_new_events).toBe('all');
  });
});
