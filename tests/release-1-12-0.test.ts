// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import {
  app,
  store,
  setMailSenderForTest,
  buildEventEmail,
  selectNewEventRecipients,
  NEW_EVENT_RECIPIENT_CAP,
  NEW_EVENT_DAILY_CAP_PER_MEMBER
} from '../server';
import { PageHeader } from '../src/components/PageHeader';
import { TeamAvatar, TeamGrid, teamInitialsColor } from '../src/components/TeamGrid';
import { AboutView } from '../src/components/AboutView';
import { HEADER_IMAGES } from '../src/lib/headerImages';

let server: any;
let baseUrl: string;
const sent: any[] = [];
const savedEnv = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };

const SMTP_USER = 'events@kwegatta.test';
const SMTP_PASS = 'not-a-real-password-1120';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const realFetch = globalThis.fetch;

async function api(method: string, urlPath: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await realFetch(`${baseUrl}${urlPath}`, {
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

/** Production shape: profile id differs from the Firebase uid. */
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

const follow = (followerId: string, followingId: string) =>
  store.follows.push({ id: `follow-${followerId}-${followingId}`, follower_id: followerId, following_id: followingId, created_at: new Date().toISOString() });

async function createEvent(hostProfileId: string, hostUid: string, title: string, extra: Record<string, unknown> = {}) {
  addMember(hostProfileId, hostUid, { email: `${hostUid}@kwegatta.test` });
  const r = await api('POST', '/api/events', auth(hostUid), {
    kind: 'event',
    title,
    description: 'An evening of demos.',
    start_date: '2027-05-01',
    start_time: '18:00',
    timezone: 'Africa/Kampala',
    format: 'in_person',
    location: 'Kampala Innovation Hub',
    ...extra
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.item;
}

const guestRegister = (eventId: string, body: Record<string, unknown>) =>
  api('POST', `/api/events/${eventId}/guest-register`, {}, { agree: true, ...body });

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
describe('PageHeader', () => {
  it('renders the title as h1, the subtitle, actions and a breadcrumb', () => {
    render(
      React.createElement(PageHeader, {
        title: 'Events & opportunities',
        subtitle: 'Meetups, hackathons and calls happening around you.',
        image: HEADER_IMAGES.events,
        actions: React.createElement('button', null, 'Create event'),
        breadcrumb: [{ label: 'Home', href: '#/home' }, { label: 'Events' }]
      })
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Events & opportunities');
    expect(screen.getByText('Meetups, hackathons and calls happening around you.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create event' })).toBeTruthy();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('#/home');
    expect(within(crumbs).getByText('Events').getAttribute('aria-current')).toBe('page');
  });

  it('uses the local photo with an 800px and a 1920px source, meaningful alt text and high priority', () => {
    render(React.createElement(PageHeader, { title: 'People', image: HEADER_IMAGES.people }));
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/images/headers/people.webp');
    expect(img.getAttribute('srcset')).toBe('/images/headers/people-800.webp 800w, /images/headers/people.webp 1920w');
    expect(img.getAttribute('alt')!.length).toBeGreaterThan(15);
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('width')).toBe('1920');
    expect(img.getAttribute('height')).toBe('1080');
    expect(screen.getByTestId('page-header').className).toContain('kw-page-header--image');
  });

  it('without a photo it shows the brand gradient and no image', () => {
    render(React.createElement(PageHeader, { title: 'Plain' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('page-header').className).toContain('kw-page-header--plain');
  });

  it('every header photo exists in both sizes, is under budget and is listed in CREDITS.md', () => {
    const pub = path.resolve(__dirname, '../public');
    const credits = fs.readFileSync(path.join(pub, 'images/CREDITS.md'), 'utf8');
    for (const img of Object.values(HEADER_IMAGES)) {
      const big = path.join(pub, img.src);
      const small = big.replace('.webp', '-800.webp');
      expect(fs.statSync(big).size).toBeLessThan(200 * 1024);
      expect(fs.statSync(small).size).toBeLessThan(200 * 1024);
      expect(img.alt.trim().length).toBeGreaterThan(15);
      expect(credits).toContain(img.src.replace('/images/', ''));
    }
    expect(credits).toMatch(/Unsplash License/);
    expect(credits).toMatch(/Pexels License/);
  });
});

/* ------------------------------------------------------------------------- */
describe('Team avatars and cards', () => {
  it('no photo: initials in a brand colour, never an empty circle', () => {
    render(React.createElement(TeamAvatar, { name: 'Amina Nakato', photoUrl: null }));
    const el = screen.getByTestId('team-initials');
    expect(el.textContent).toBe('AN');
    expect(el.getAttribute('aria-label')).toBe('Amina Nakato');
    expect(['rgb(245, 183, 0)', 'rgb(18, 181, 166)']).toContain(el.style.backgroundColor);
  });

  it('the colour is the same for the same name', () => {
    expect(teamInitialsColor('Amina Nakato')).toEqual(teamInitialsColor('Amina Nakato'));
    expect(['#F5B700', '#12B5A6']).toContain(teamInitialsColor('Someone Else').bg);
  });

  it('a photo that fails to load falls back to initials', () => {
    render(React.createElement(TeamAvatar, { name: 'Brian Okello', photoUrl: '/api/team/photo/missing' }));
    const img = screen.getByRole('img', { name: 'Photo of Brian Okello' });
    fireEvent.error(img);
    expect(screen.getByTestId('team-initials').textContent).toBe('BO');
  });

  it('cards show name, role from the admin panel, affiliation and links', () => {
    const team: any[] = [
      { id: 't1', name: 'Amina Nakato', title: 'Product lead', line2: 'Makerere University Business School', github: 'amina', order: 0, hidden: false },
      { id: 't2', name: 'Brian Okello', title: 'Backend', line2: 'Kyambogo University', photo_url: '/x.webp', order: 1, hidden: false }
    ];
    render(React.createElement(TeamGrid, { team, loading: false }));
    expect(screen.getByText('Product lead')).toBeTruthy();
    expect(screen.getByText('Makerere University Business School')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Amina Nakato on GitHub' }).getAttribute('href')).toBe('https://github.com/amina');
    expect(screen.getAllByTestId('team-initials')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Photo of Brian Okello' })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
describe('About page layout', () => {
  async function renderAbout() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      if (String(input) === '/api/team') {
        return new Response(JSON.stringify([{ id: 't1', name: 'Amina Nakato', title: 'Product lead', line2: 'MUBS', order: 0, hidden: false }]), { status: 200 });
      }
      return realFetch(input, init);
    });
    let utils: any;
    await act(async () => {
      utils = render(React.createElement(AboutView, { onNavigateHome: vi.fn(), isSignedIn: false }));
    });
    return utils;
  }

  it('sections come in the new order: hero, problem and answer, team, how it works, recognition, privacy', async () => {
    const { container } = await renderAbout();
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s: any) => s.id);
    expect(ids).toEqual(['about-top', 'challenge', 'team', 'how-it-works', 'story', 'privacy']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Find the people you should build and learn with.');
    expect(await screen.findByText('Product lead')).toBeTruthy();
  });

  it('hero has Start matching and Meet the team; Meet the team scrolls to the team', async () => {
    await renderAbout();
    const team = document.getElementById('team')!;
    const scroll = vi.fn();
    team.scrollIntoView = scroll;
    expect(screen.getByRole('button', { name: /Start matching/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Meet the team/ }));
    expect(scroll).toHaveBeenCalled();
  });

  it('keeps the name-origin text, drops numbered labels and the full licence text', async () => {
    const { container } = await renderAbout();
    const text = container.textContent || '';
    expect(text).toContain('Kwegatta comes from the Luganda word okwegatta, meaning to unite or come together.');
    expect(text).toContain('Okwegatta ge maanyi — unity is strength.');
    expect(text).not.toMatch(/\b0\d \//);
    expect(text).not.toContain('Permission is hereby granted');
    expect(screen.getByRole('link', { name: /Read the licence/ }).getAttribute('href')).toContain('/LICENSE');
  });

  it('technical details are in a section that is closed by default', async () => {
    const { container } = await renderAbout();
    const details = container.querySelector('details#engine') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('gemma-4-26b-a4b-it');
    expect(details.querySelector('summary')!.textContent).toContain('Technical details');
  });

  it('recognition keeps the current facts', async () => {
    const { container } = await renderAbout();
    const story = container.querySelector('section#story')!.textContent || '';
    expect(story).toContain('Hacktoberfest 2026 Hack Day Kampala × MUBS');
    expect(story).toContain('1st place');
    expect(story).toContain('MUBS Entrepreneurship, Innovation and Incubation Centre');
    expect(container.querySelector('section#story img')!.getAttribute('loading')).toBe('lazy');
  });

  it('every image has alt text; only the hero loads eagerly', async () => {
    const { container } = await renderAbout();
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    for (const img of imgs) expect((img.getAttribute('alt') || '').length).toBeGreaterThan(5);
    const eager = imgs.filter(i => i.getAttribute('loading') !== 'lazy');
    expect(eager).toHaveLength(1);
    expect(eager[0].getAttribute('src')).toBe('/images/headers/about-hero.webp');
    expect(eager[0].getAttribute('fetchpriority')).toBe('high');
  });
});

/* ------------------------------------------------------------------------- */
describe('Event cancelled email reaches the waitlist', () => {
  it('organiser delete emails registered and waitlisted members and guests, with waitlist wording', async () => {
    const ev = await createEvent('p-host-w1', 'uid-host-w1', 'Waitlist Demo Night', { capacity: 2 });
    addMember('p-mem-w1', 'uid-mem-w1', { email: 'going-member@example.com' });
    addMember('p-mem-w2', 'uid-mem-w2', { email: 'waiting-member@example.com' });
    expect((await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-w1'))).json.status).toBe('going');
    expect((await guestRegister(ev.id, { name: 'Guest Gail', email: 'going-guest@example.com' })).json.status).toBe('going');
    expect((await api('POST', `/api/events/${ev.id}/rsvp`, auth('uid-mem-w2'))).json.status).toBe('waitlisted');
    expect((await guestRegister(ev.id, { name: 'Guest Wade', email: 'waiting-guest@example.com' })).json.status).toBe('waitlisted');

    const before = sent.length;
    const r = await api('DELETE', `/api/events/${ev.id}`, auth('uid-host-w1'));
    expect(r.status).toBe(200);
    const mails = sent.slice(before);

    expect(mails.map(m => m.to).sort()).toEqual([
      'going-guest@example.com',
      'going-member@example.com',
      'waiting-guest@example.com',
      'waiting-member@example.com'
    ]);
    for (const m of mails) expect(m.subject).toBe('Event cancelled: Waitlist Demo Night');
    const byTo = (to: string) => mails.find(m => m.to === to);
    for (const to of ['waiting-member@example.com', 'waiting-guest@example.com']) {
      expect(byTo(to).text).toContain('You were on the waitlist');
      expect(byTo(to).text).toContain('because you joined the waitlist');
      expect(byTo(to).text).not.toContain('ticket');
    }
    for (const to of ['going-member@example.com', 'going-guest@example.com']) {
      expect(byTo(to).text).toContain('Your registration and ticket are no longer valid');
    }
    expect(mails.some(m => m.to === 'uid-host-w1@kwegatta.test')).toBe(false);
  });

  it('admin delete also emails the waitlist, with moderator wording', async () => {
    if (!Array.isArray(store.admin_emails)) store.admin_emails = [];
    if (!store.admin_emails.includes('test-admin@kwegatta.test')) store.admin_emails.push('test-admin@kwegatta.test');
    const ev = await createEvent('p-host-w2', 'uid-host-w2', 'Moderated Waitlist Night', { capacity: 1 });
    await guestRegister(ev.id, { name: 'Guest One', email: 'one@example.com' });
    expect((await guestRegister(ev.id, { name: 'Guest Two', email: 'two@example.com' })).json.status).toBe('waitlisted');

    const before = sent.length;
    const r = await api('DELETE', `/api/admin/events/${ev.id}`, auth('test-admin'), { reason: 'Spam or scam' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const mails = sent.slice(before);
    expect(mails.map(m => m.to).sort()).toEqual(['one@example.com', 'two@example.com']);
    expect(mails.find(m => m.to === 'two@example.com').text).toContain('cancelled by a moderator');
  });

  it('the waitlist HTML part is escaped and has no ticket button', () => {
    const { html, text } = buildEventEmail('event_cancelled', { id: 'ev-w', title: '<i>Gone</i>' }, 'Wes', '', 'host', true);
    expect(html).toContain('&lt;i&gt;Gone&lt;/i&gt;');
    expect(html).not.toContain('<i>Gone</i>');
    expect(html).not.toContain('View your ticket');
    expect(text).toContain('Find other events:');
  });
});

/* ------------------------------------------------------------------------- */
describe('New-event notifications reach followers of the organiser', () => {
  const newEventNotifs = (eventId: string) =>
    store.notifications.filter((n: any) => n.event_id === eventId && n.source === 'new_event').map((n: any) => n.to_id);

  it('followers are notified even with no matching interests, and respect their setting', async () => {
    addMember('p-fan-1', 'uid-fan-1');
    addMember('p-fan-following', 'uid-fan-following', { notify_new_events: 'following' });
    addMember('p-fan-off', 'uid-fan-off', { notify_new_events: 'off' });
    addMember('p-not-fan', 'uid-not-fan', { skills: ['Rust'] });
    for (const f of ['p-fan-1', 'p-fan-following', 'p-fan-off']) follow(f, 'p-host-f1');

    const ev = await createEvent('p-host-f1', 'uid-host-f1', 'Follower Night', { tags: ['zzf1tag'] });
    expect(newEventNotifs(ev.id).sort()).toEqual(['p-fan-1', 'p-fan-following']);
  });

  it(`followers still count toward the per-member limit of ${NEW_EVENT_DAILY_CAP_PER_MEMBER} a day`, async () => {
    addMember('p-busy-fan', 'uid-busy-fan');
    follow('p-busy-fan', 'p-host-f2');
    const today = new Date().toISOString();
    for (let i = 0; i < NEW_EVENT_DAILY_CAP_PER_MEMBER; i++) {
      store.notifications.push({ id: `seed-busy-${i}`, to_id: 'p-busy-fan', source: 'new_event', type: 'digest', body: 'x', read: false, created_at: today });
    }
    const ev = await createEvent('p-host-f2', 'uid-host-f2', 'Busy Fan Night');
    expect(newEventNotifs(ev.id)).not.toContain('p-busy-fan');
  });

  it(`followers come first and share the cap of ${NEW_EVENT_RECIPIENT_CAP} with tag matches`, () => {
    for (let i = 0; i < 3; i++) {
      addMember(`p-f3-fan${i}`, `uid-f3-fan${i}`);
      follow(`p-f3-fan${i}`, 'p-host-f3');
    }
    for (let i = 0; i < NEW_EVENT_RECIPIENT_CAP + 10; i++) addMember(`p-f3-m${i}`, `uid-f3-m${i}`, { skills: ['zzf3tag'] });

    const picked = selectNewEventRecipients({ tags: ['zzf3tag'] }, ['p-host-f3']).map(p => p.id);
    expect(picked).toHaveLength(NEW_EVENT_RECIPIENT_CAP);
    expect(picked.slice(0, 3).sort()).toEqual(['p-f3-fan0', 'p-f3-fan1', 'p-f3-fan2']);
    expect(picked.filter(id => id.startsWith('p-f3-m'))).toHaveLength(NEW_EVENT_RECIPIENT_CAP - 3);
  });

  it('when followers alone fill the cap, no tag matches are added', () => {
    for (let i = 0; i < NEW_EVENT_RECIPIENT_CAP + 5; i++) {
      addMember(`p-f4-fan${i}`, `uid-f4-fan${i}`);
      follow(`p-f4-fan${i}`, 'p-host-f4');
    }
    addMember('p-f4-match', 'uid-f4-match', { skills: ['zzf4tag'] });
    const picked = selectNewEventRecipients({ tags: ['zzf4tag'] }, ['p-host-f4']).map(p => p.id);
    expect(picked).toHaveLength(NEW_EVENT_RECIPIENT_CAP);
    expect(picked.every(id => id.startsWith('p-f4-fan'))).toBe(true);
  });
});
