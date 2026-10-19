// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import sharp from 'sharp';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import {
  app,
  store,
  getPublicTeamList,
  processTeamPhoto,
  setTestStorageWriter,
  newAuditId,
  injectEventOgIntoHtml,
  canClaimProfile,
  allowNotificationSend,
  needsLargeJsonBody,
  PROTECTED_PROFILE_FIELDS
} from '../server';
import {
  checkGithub,
  checkLinkedin,
  checkX,
  checkWebsite,
  checkWhatsapp,
  checkPhotoDataUrl,
  validateTeamPayload,
  whatsappLink
} from '../src/lib/teamFields';
import { validateEventTitle, hasUnbalancedQuotes, EVENT_TITLE_MAX } from '../src/lib/eventTitle';
import { roleReason, sparkSentence } from '../src/services/api';
import * as apiModule from '../src/services/api';
import { TeamManager, checkPhotoFile } from '../src/components/TeamManager';
import { EventsView } from '../src/components/EventsView';
import { useTeam } from '../src/hooks/useTeam';

let server: any;
let baseUrl: string;

const ADMIN = { Authorization: 'Bearer t111-admin' };
const MEMBER = { Authorization: 'Bearer t111-member' };
const OTHER = { Authorization: 'Bearer t111-other' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

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

async function pngDataUrl(size = 24): Promise<string> {
  const buf = await sharp({ create: { width: size, height: size, channels: 3, background: '#12B5A6' } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function addProfile(uid: string, extra: Record<string, unknown> = {}) {
  if (!store.profiles.some((p: any) => p.id === uid)) {
    store.profiles.push({
      id: uid,
      account_uid: uid,
      name: `Person ${uid}`,
      headline: 'Builder in Kampala',
      role: 'Developer',
      needs: 'A designer',
      offers: 'React',
      created_at: new Date().toISOString(),
      ...extra
    });
  }
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
  if (!Array.isArray(store.admin_emails)) store.admin_emails = [];
  store.admin_emails.push('t111-admin@kwegatta.test');
  addProfile('t111-member');
  addProfile('t111-other');
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------- */
describe('Team management: admin only', () => {
  let memberId: string;

  beforeAll(async () => {
    const r = await api('POST', '/api/admin/team', ADMIN, { name: 'Access Check Person', title: 'Partnerships Lead' });
    expect(r.status).toBe(201);
    memberId = r.json.member.id;
  });

  const writeRoutes = (id: () => string): Array<[string, () => string, unknown]> => [
    ['POST', () => '/api/admin/team', { name: 'Intruder' }],
    ['PATCH', () => `/api/admin/team/${id()}`, { name: 'Changed' }],
    ['DELETE', () => `/api/admin/team/${id()}`, undefined],
    ['POST', () => `/api/admin/team/${id()}/photo`, { photo: 'data:image/png;base64,AAAA' }],
    ['POST', () => '/api/admin/team/reorder', { ordered_ids: [id()] }],
    ['PATCH', () => '/api/admin/team/settings', { team_details_enabled: true }],
    ['POST', () => '/api/admin/settings', { team_details_enabled: true }]
  ];

  it('a signed-in non-admin gets 403 on every team write route and nothing changes', async () => {
    const before = JSON.stringify(store.team);
    for (const [method, path, body] of writeRoutes(() => memberId)) {
      const r = await api(method, path(), MEMBER, body);
      expect(r.status, `${method} ${path()}`).toBe(403);
    }
    expect(JSON.stringify(store.team)).toBe(before);
  });

  it('a signed-out visitor gets 401 on every team write route', async () => {
    for (const [method, path, body] of writeRoutes(() => memberId)) {
      const r = await api(method, path(), {}, body);
      expect(r.status, `${method} ${path()}`).toBe(401);
    }
  });

  it('non-admins cannot read the admin team list or search profiles', async () => {
    expect((await api('GET', '/api/admin/team', MEMBER)).status).toBe(403);
    expect((await api('GET', '/api/admin/team/profile-search?q=pe', MEMBER)).status).toBe(403);
  });

  it('team cards cannot be changed through the generic data routes, even by members', async () => {
    expect((await api('PATCH', `/api/data/team/${memberId}`, MEMBER, { name: 'Defaced' })).status).toBe(403);
    expect((await api('DELETE', `/api/data/team/${memberId}`, MEMBER)).status).toBe(403);
    expect(store.team.find((m: any) => m.id === memberId)?.name).toBe('Access Check Person');
  });

  it('an unverified account under a panel-added admin email is not an admin', async () => {
    store.admin_emails.push('unverified-x@kwegatta.test');
    const r = await api('POST', '/api/admin/team', { Authorization: 'Bearer unverified-x' }, { name: 'Nope' });
    expect(r.status).toBe(403);
  });

  it('a member who sets their profile email to an admin email does not become admin', async () => {
    const patch = await api('PATCH', '/api/data/profiles/t111-member', MEMBER, { email: 't111-admin@kwegatta.test', headline: 'Still a member' });
    expect(patch.status).toBe(200);
    const stored = store.profiles.find((p: any) => p.id === 't111-member');
    expect(stored.email).not.toBe('t111-admin@kwegatta.test');
    expect(stored.headline).toBe('Still a member');
    expect((await api('GET', '/api/admin/overview', MEMBER)).status).toBe(403);
  });
});

/* ------------------------------------------------------------------------- */
describe('Team management: add, edit, order, hide, remove', () => {
  const ids: string[] = [];

  beforeAll(async () => {
    store.team = store.team.filter((m: any) => m.id === '__team_settings__' || m.is_settings);
    for (const [name, title] of [['Ada Order', 'Frontend Developer'], ['Ben Order', 'Partnerships Lead'], ['Cy Order', 'Designer']]) {
      const r = await api('POST', '/api/admin/team', ADMIN, { name, title, show_title: true });
      expect(r.status).toBe(201);
      ids.push(r.json.member.id);
    }
  });

  it('stores a free-text role exactly as typed (no fixed titles)', () => {
    const ben: any = store.team.find((m: any) => m.id === ids[1]);
    expect(ben?.title).toBe('Partnerships Lead');
  });

  it('reorder persists: store, every changed document write and the public list follow the new order', async () => {
    const writes: Array<{ col: string; id: string; order: number }> = [];
    setTestStorageWriter(async (col, id, data) => {
      if (col === 'team') writes.push({ col, id, order: data.order });
    });
    try {
      const r = await api('POST', '/api/admin/team/reorder', ADMIN, { ordered_ids: [ids[2], ids[0], ids[1]] });
      expect(r.status).toBe(200);
    } finally {
      setTestStorageWriter(null);
    }
    const publicOrder = getPublicTeamList().map(m => m.id);
    expect(publicOrder).toEqual([ids[2], ids[0], ids[1]]);
    expect(writes.find(w => w.id === ids[2])?.order).toBe(0);
    expect(writes.find(w => w.id === ids[1])?.order).toBe(2);
    const admin = await api('GET', '/api/admin/team', ADMIN);
    expect(admin.json.map((m: any) => m.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('reorder rejects unknown ids and duplicates', async () => {
    expect((await api('POST', '/api/admin/team/reorder', ADMIN, { ordered_ids: ['nope'] })).status).toBe(400);
    expect((await api('POST', '/api/admin/team/reorder', ADMIN, { ordered_ids: [ids[0], ids[0]] })).status).toBe(400);
    expect((await api('POST', '/api/admin/team/reorder', ADMIN, { ordered_ids: 'x' })).status).toBe(400);
  });

  it('hidden members are not in the public list and their photo is not served', async () => {
    await api('POST', `/api/admin/team/${ids[0]}/photo`, ADMIN, { photo: await pngDataUrl() });
    const r = await api('PATCH', `/api/admin/team/${ids[0]}`, ADMIN, { hidden: true });
    expect(r.status).toBe(200);
    const pub = await api('GET', '/api/team');
    expect(pub.json.some((m: any) => m.id === ids[0])).toBe(false);
    expect(pub.json.some((m: any) => m.id === '__team_settings__')).toBe(false);
    const photo = await fetch(`${baseUrl}/api/team-photo/${ids[0]}`);
    expect(photo.status).toBe(404);
    // Still listed for admins, marked hidden
    const admin = await api('GET', '/api/admin/team', ADMIN);
    expect(admin.json.find((m: any) => m.id === ids[0]).hidden).toBe(true);
  });

  it('removing a member deletes the card', async () => {
    const r = await api('DELETE', `/api/admin/team/${ids[1]}`, ADMIN);
    expect(r.status).toBe(200);
    expect(store.team.some((m: any) => m.id === ids[1])).toBe(false);
    expect((await api('DELETE', `/api/admin/team/${ids[1]}`, ADMIN)).status).toBe(404);
  });
});

/* ------------------------------------------------------------------------- */
describe('Team management: field visibility', () => {
  let id: string;

  beforeAll(async () => {
    const r = await api('POST', '/api/admin/team', ADMIN, {
      name: 'Vis Person',
      title: 'Data Lead',
      bio: 'Builds data tools for traders.',
      linkedin: 'https://www.linkedin.com/in/vis-person',
      x: '@visperson',
      website: 'https://vis.example.com',
      whatsapp: '+256 700 123456',
      github: 'vis-person',
      show_title: true,
      show_bio: false,
      show_linkedin: true,
      show_x: false,
      show_website: true,
      show_whatsapp: false
    });
    expect(r.status).toBe(201);
    id = r.json.member.id;
  });

  it('with team details off, only name, organisation and GitHub are public', async () => {
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: false });
    const card = getPublicTeamList().find(m => m.id === id)!;
    expect(card.github).toBe('vis-person');
    for (const k of ['title', 'bio', 'linkedin', 'x', 'website', 'whatsapp_url']) expect(card[k]).toBeUndefined();
  });

  it('with team details on, each field follows its own toggle', async () => {
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
    let card = getPublicTeamList().find(m => m.id === id)!;
    expect(card.title).toBe('Data Lead');
    expect(card.linkedin).toBe('https://www.linkedin.com/in/vis-person');
    expect(card.website).toBe('https://vis.example.com/');
    expect(card.bio).toBeUndefined();
    expect(card.x).toBeUndefined();
    expect(card.whatsapp_url).toBeUndefined();

    await api('PATCH', `/api/admin/team/${id}`, ADMIN, { show_bio: true, show_x: true, show_whatsapp: true, show_title: false });
    card = getPublicTeamList().find(m => m.id === id)!;
    expect(card.bio).toBe('Builds data tools for traders.');
    expect(card.x).toBe('https://x.com/visperson');
    expect(card.whatsapp_url).toBe('https://wa.me/256700123456');
    expect(card.title).toBeUndefined();
    // The raw number is never exposed, only the link
    expect(JSON.stringify(card)).not.toContain('+256');
  });

  it('a linked profile photo is used when no photo is uploaded', async () => {
    addProfile('t111-linked', { avatar: 'data:image/png;base64,iVBORw0KGgo=' });
    const r = await api('PATCH', `/api/admin/team/${id}`, ADMIN, { linked_profile_id: 't111-linked' });
    expect(r.status).toBe(200);
    const card = getPublicTeamList().find(m => m.id === id)!;
    expect(card.photo_url).toBeNull();
    expect(card.linked_avatar).toBe('/api/avatar/t111-linked');
  });

  it('linking to a profile that does not exist is rejected', async () => {
    expect((await api('PATCH', `/api/admin/team/${id}`, ADMIN, { linked_profile_id: 'ghost-profile' })).status).toBe(400);
  });

  it('profile search finds members by name for linking', async () => {
    const r = await api('GET', '/api/admin/team/profile-search?q=t111-linked', ADMIN);
    expect(r.status).toBe(200);
    expect(r.json.some((p: any) => p.id === 't111-linked')).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain('data:image');
  });
});

/* ------------------------------------------------------------------------- */
describe('Team management: validation', () => {
  let id: string;
  beforeAll(async () => {
    const r = await api('POST', '/api/admin/team', ADMIN, { name: 'Valid Person' });
    id = r.json.member.id;
  });

  it.each([
    [{ linkedin: 'https://evil.example.com/in/x' }, 'linkedin'],
    [{ website: 'javascript:alert(1)' }, 'website'],
    [{ website: 'not a url' }, 'website'],
    [{ x: 'https://facebook.com/someone' }, 'x'],
    [{ github: 'bad user!' }, 'github'],
    [{ whatsapp: '12345' }, 'whatsapp'],
    [{ name: '' }, 'name'],
    [{ title: 'x'.repeat(81) }, 'title'],
    [{ bio: 'x'.repeat(301) }, 'bio']
  ])('rejects %j', async (body, field) => {
    const r = await api('PATCH', `/api/admin/team/${id}`, ADMIN, body);
    expect(r.status).toBe(400);
    expect(r.json.fields?.[field]).toBeTruthy();
  });

  it('rejects a new member without a name', async () => {
    expect((await api('POST', '/api/admin/team', ADMIN, { title: 'No name' })).status).toBe(400);
  });

  it('rejects non-image uploads, oversized images and undecodable images', async () => {
    const html = `data:text/html;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
    expect((await api('POST', `/api/admin/team/${id}/photo`, ADMIN, { photo: html })).status).toBe(400);
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    expect((await api('POST', `/api/admin/team/${id}/photo`, ADMIN, { photo: svg })).status).toBe(400);
    const big = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString('base64')}`;
    expect((await api('POST', `/api/admin/team/${id}/photo`, ADMIN, { photo: big })).status).toBe(400);
    const junk = `data:image/png;base64,${Buffer.alloc(200, 7).toString('base64')}`;
    expect((await api('POST', `/api/admin/team/${id}/photo`, ADMIN, { photo: junk })).status).toBe(400);
    expect(store.team.find((m: any) => m.id === id)?.photo).toBeFalsy();
  });

  it('PATCH cannot set a raw photo, only clear it', async () => {
    expect((await api('PATCH', `/api/admin/team/${id}`, ADMIN, { photo: 'https://evil.example.com/x.png' })).status).toBe(400);
  });

  it('a valid photo is converted to WebP and served with a cache-busting link', async () => {
    const r = await api('POST', `/api/admin/team/${id}/photo`, ADMIN, { photo: await pngDataUrl(600) });
    expect(r.status).toBe(200);
    expect(r.json.photo_url).toMatch(new RegExp(`^/api/team-photo/${id}\\?v=`));
    const res = await fetch(`${baseUrl}/api/team-photo/${id}`);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(400);
  });

  it('processTeamPhoto rejects data that is not an image', async () => {
    expect((await processTeamPhoto('hello')).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */
describe('Team management: audit log', () => {
  it('every team change writes an audit entry with a unique id', async () => {
    const before = store.audit_log.length;
    const created = await api('POST', '/api/admin/team', ADMIN, { name: 'Audit Person' });
    const id = created.json.member.id;
    await api('PATCH', `/api/admin/team/${id}`, ADMIN, { title: 'Ops' });
    await api('POST', `/api/admin/team/${id}/photo`, ADMIN, { photo: await pngDataUrl() });
    await api('POST', '/api/admin/team/reorder', ADMIN, { ordered_ids: [id] });
    await api('PATCH', '/api/admin/team/settings', ADMIN, { team_details_enabled: true });
    await api('DELETE', `/api/admin/team/${id}`, ADMIN);
    const actions = store.audit_log.slice(0, store.audit_log.length - before).map((e: any) => e.action);
    for (const a of ['TEAM_MEMBER_CREATED', 'TEAM_MEMBER_UPDATED', 'TEAM_PHOTO_UPDATED', 'TEAM_REORDERED', 'TEAM_SETTINGS_UPDATED', 'TEAM_MEMBER_DELETED']) {
      expect(actions).toContain(a);
    }
    const ids = store.audit_log.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('newAuditId never repeats within the same millisecond', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newAuditId()));
    expect(seen.size).toBe(200);
  });
});

/* ------------------------------------------------------------------------- */
describe('Team field rules (shared by server and Admin form)', () => {
  it('normalises links and numbers', () => {
    expect(checkGithub('https://github.com/Saifuddin2Ahmed')).toEqual({ ok: true, value: 'Saifuddin2Ahmed' });
    expect(checkGithub('@octo-cat')).toEqual({ ok: true, value: 'octo-cat' });
    expect(checkLinkedin('linkedin.com/in/abc')).toEqual({ ok: true, value: 'https://linkedin.com/in/abc' });
    expect(checkX('twitter.com/abc_1')).toEqual({ ok: true, value: 'https://x.com/abc_1' });
    expect(checkWebsite('example.org/me')).toEqual({ ok: true, value: 'https://example.org/me' });
    expect(checkWhatsapp('+256 (700) 123-456')).toEqual({ ok: true, value: '+256700123456' });
    expect(whatsappLink('+256700123456')).toBe('https://wa.me/256700123456');
  });

  it('empty values clear a field', () => {
    for (const f of [checkGithub, checkLinkedin, checkX, checkWebsite, checkWhatsapp]) expect(f('')).toEqual({ ok: true, value: null });
  });

  it('photo checks', () => {
    expect(checkPhotoDataUrl('data:image/gif;base64,' + 'A'.repeat(100)).ok).toBe(true);
    expect(checkPhotoDataUrl('data:image/svg+xml;base64,AAAA').ok).toBe(false);
    expect(checkPhotoFile({ type: 'image/heic', size: 10 })).toMatch(/JPEG, PNG, WebP or GIF/);
    expect(checkPhotoFile({ type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(checkPhotoFile({ type: 'image/png', size: 1000 })).toBeNull();
  });

  it('validateTeamPayload strips control characters and reports each bad field', () => {
    const r = validateTeamPayload({ name: ' A\u0007da ', website: 'ftp://x.y', linkedin: 'nope' }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['linkedin', 'website']);
    const ok = validateTeamPayload({ name: ' A\u0007da ' }, true);
    expect(ok.ok && ok.values.name).toBe('Ada');
  });
});

/* ------------------------------------------------------------------------- */
describe('TeamManager (Admin Team tab)', () => {
  const team: any[] = [
    { id: 'tm-1', name: 'Ada One', title: 'Frontend Developer', line2: 'MUBS', order: 0, hidden: false, show_title: true },
    { id: 'tm-2', name: 'Ben Two', title: 'Partnerships Lead', line2: 'Makerere', order: 1, hidden: true }
  ];

  it('lists members with a Hidden badge and no ranking badge', () => {
    render(React.createElement(TeamManager, { team, detailsEnabled: false, onDetailsEnabledChange: vi.fn(), onChanged: vi.fn(), onToast: vi.fn() }));
    expect(screen.getByText('Ada One')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByText(/Lead \/ 1st/)).toBeNull();
    expect(screen.queryByText(/founder/i)).toBeNull();
  });

  it('remove asks for confirmation in a dialog, and Escape cancels it', async () => {
    const del = vi.spyOn(apiModule, 'deleteTeamMember').mockResolvedValue(true);
    render(React.createElement(TeamManager, { team, detailsEnabled: false, onDetailsEnabledChange: vi.fn(), onChanged: vi.fn(), onToast: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada One' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada One' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    expect(del).toHaveBeenCalledWith('tm-1');
  });

  it('shows field errors in the form and does not save an invalid link', async () => {
    const create = vi.spyOn(apiModule, 'createTeamMember').mockResolvedValue({});
    render(React.createElement(TeamManager, { team, detailsEnabled: false, onDetailsEnabledChange: vi.fn(), onChanged: vi.fn(), onToast: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: /Add person/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Full name *'), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'javascript:alert(1)' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Full name *').closest('form')!);
    });
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/Website must be a valid link/)).toBeTruthy();
  });

  it('move down sends the new order', async () => {
    const reorder = vi.spyOn(apiModule, 'reorderTeamMembers').mockResolvedValue([]);
    render(React.createElement(TeamManager, { team, detailsEnabled: false, onDetailsEnabledChange: vi.fn(), onChanged: vi.fn(), onToast: vi.fn() }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Move Ada One down' }));
    });
    expect(reorder).toHaveBeenCalledWith(['tm-2', 'tm-1']);
  });
});

describe('useTeam', () => {
  it('starts empty (no built-in list) and shows what the server returns', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 'x', name: 'Only Person', line2: '', order: 0, hidden: false }])));
    let snapshot: any = null;
    function Probe() {
      snapshot = useTeam();
      return null;
    }
    render(React.createElement(Probe));
    expect(snapshot.team).toEqual([]);
    await waitFor(() => expect(snapshot.team.map((m: any) => m.name)).toEqual(['Only Person']));
    expect(fetchSpy).toHaveBeenCalledWith('/api/team');
  });
});

/* ------------------------------------------------------------------------- */
describe('Event title rules', () => {
  it.each([
    ['', 'Title is required'],
    ['Hey', 'at least 4'],
    ['x'.repeat(EVENT_TITLE_MAX + 1), `${EVENT_TITLE_MAX} characters or fewer`],
    ['e.g. Flutter Hackday', 'own title'],
    ['Flutter Hackday', 'own title'],
    ['My e.g. Flutter Hackday night', 'own title'],
    ['Something people attend at a set date and time, in person or online.', 'own title'],
    ['"Demo Day', 'quote'],
    ['“Demo Day', 'quote']
  ])('blocks %j', (title, msg) => {
    expect(validateEventTitle(title)).toContain(msg);
  });

  it.each(['Kampala Flutter Hackday 2026', '"Build Week" at MUBS', 'Women’s Tech Night', 'AI Day'])('allows %j', title => {
    expect(validateEventTitle(title)).toBeNull();
  });

  it('hasUnbalancedQuotes', () => {
    expect(hasUnbalancedQuotes('"a" "b"')).toBe(false);
    expect(hasUnbalancedQuotes('“a”')).toBe(false);
    expect(hasUnbalancedQuotes('a"')).toBe(true);
  });

  const eventBody = (title: string) => ({
    kind: 'event',
    title,
    description: 'An evening of demos.',
    start_date: '2027-03-01',
    start_time: '18:00',
    timezone: 'Africa/Kampala',
    format: 'in_person',
    location: 'Kampala Innovation Hub'
  });

  it('the server rejects placeholder, quote and length problems with a clear message', async () => {
    for (const t of ['e.g. Flutter Hackday', '"Open Night', 'Hi']) {
      const r = await api('POST', '/api/events', MEMBER, eventBody(t));
      expect(r.status, t).toBe(400);
      expect(r.json.field).toBe('title');
    }
  });

  it('a double submit returns the event already created instead of a second copy', async () => {
    const first = await api('POST', '/api/events', MEMBER, eventBody('Double Click Demo Night'));
    expect(first.status).toBe(200);
    const second = await api('POST', '/api/events', MEMBER, eventBody('Double Click Demo Night'));
    expect(second.status).toBe(200);
    expect(second.json.duplicate).toBe(true);
    expect(second.json.item.id).toBe(first.json.item.id);
    expect(store.events.filter((e: any) => e.title === 'Double Click Demo Night').length).toBe(1);
  });

  it('editing an event to a placeholder title is rejected', async () => {
    const created = await api('POST', '/api/events', MEMBER, eventBody('Edit Rules Night'));
    const r = await api('PATCH', `/api/events/${created.json.item.id}`, MEMBER, { title: 'Flutter Hackday' });
    expect(r.status).toBe(400);
  });

  it('the create form shows the message and does not submit', async () => {
    const profile: any = { id: 't111-member', name: 'Person', headline: 'Builder', role: 'Developer', created_at: new Date().toISOString() };
    vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([]);
    const createSpy = vi.spyOn(apiModule, 'createEvent').mockResolvedValue({} as any);
    window.location.hash = '#/events';
    await act(async () => {
      render(React.createElement(EventsView, { currentProfile: profile, allProfiles: [profile], onViewProfile: vi.fn(), onToast: vi.fn() }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create event/i }));
    });
    const input = await screen.findByLabelText(/Title \*/);
    fireEvent.change(input, { target: { value: 'e.g. Flutter Hackday' } });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(await screen.findByText('Please write your own title instead of the example text')).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------------- */
describe('Generic data routes: ownership and protected fields', () => {
  it('profile PATCH ignores protected fields such as suspended, account_uid and is_organiser', async () => {
    addProfile('t111-sus', { suspended: true, hidden: true });
    const r = await api('PATCH', '/api/data/profiles/t111-sus', { Authorization: 'Bearer t111-sus' }, {
      suspended: false,
      hidden: false,
      is_organiser: true,
      account_uid: 'someone-else',
      headline: 'Updated'
    });
    expect(r.status).toBe(200);
    const p = store.profiles.find((x: any) => x.id === 't111-sus');
    expect(p.suspended).toBe(true);
    expect(p.hidden).toBe(true);
    expect(p.is_organiser).toBeFalsy();
    expect(p.account_uid).toBe('t111-sus');
    expect(p.headline).toBe('Updated');
    for (const f of ['email', 'suspended', 'account_uid']) expect(PROTECTED_PROFILE_FIELDS).toContain(f as any);
  });

  it('re-saving a profile through POST keeps admin-managed fields in the stored document', async () => {
    addProfile('t111-resave', { suspended: true });
    const written: any[] = [];
    setTestStorageWriter(async (col, _id, data) => {
      if (col === 'profiles') written.push(data);
    });
    try {
      const r = await api('POST', '/api/data/profiles', { Authorization: 'Bearer t111-resave' }, { name: 'Resave Person', headline: 'New headline' });
      expect(r.status).toBe(200);
    } finally {
      setTestStorageWriter(null);
    }
    expect(written.at(-1).suspended).toBe(true);
  });

  it('a post cannot overwrite another post by sending its id, and created_at is set by the server', async () => {
    const mine = await api('POST', '/api/data/posts', OTHER, { body: 'Original post' });
    const attack = await api('POST', '/api/data/posts', MEMBER, { id: mine.json.id, body: 'Replaced', created_at: '2099-01-01T00:00:00.000Z' });
    expect(attack.status).toBe(200);
    expect(attack.json.id).not.toBe(mine.json.id);
    expect(attack.json.created_at.startsWith('2099')).toBe(false);
    expect(store.posts.find((p: any) => p.id === mine.json.id).body).toBe('Original post');
  });

  it('post authors may edit only title, body, kind and tags', async () => {
    const mine = await api('POST', '/api/data/posts', MEMBER, { body: 'Mine' });
    const r = await api('PATCH', `/api/data/posts/${mine.json.id}`, MEMBER, { body: 'Edited', author_id: 't111-other', created_at: '2000-01-01' });
    expect(r.status).toBe(200);
    const p = store.posts.find((x: any) => x.id === mine.json.id);
    expect(p.body).toBe('Edited');
    expect(p.author_id).toBe('t111-member');
    expect(p.created_at.startsWith('2000')).toBe(false);
  });

  it('members cannot record matches for other people or delete someone else’s match', async () => {
    expect((await api('POST', '/api/data/matches', MEMBER, { a_id: 't111-other', b_id: 't111-member', score: 99 })).status).toBe(403);
    const ok = await api('POST', '/api/data/matches', OTHER, { a_id: 't111-other', b_id: 't111-member', score: 70 });
    expect(ok.status).toBe(200);
    const again = await api('POST', '/api/data/matches', OTHER, { a_id: 't111-other', b_id: 't111-member', score: 75 });
    expect(again.json.id).toBe(ok.json.id);
    addProfile('t111-third');
    expect((await api('DELETE', `/api/data/matches/${ok.json.id}`, { Authorization: 'Bearer t111-third' })).status).toBe(403);
    expect((await api('PATCH', `/api/data/matches/${ok.json.id}`, MEMBER, { score: 1 })).status).toBe(403);
  });

  it('event authors cannot change moderation fields through the generic route', async () => {
    addProfile('t111-host-a');
    const HOST = { Authorization: 'Bearer t111-host-a' };
    const created = await api('POST', '/api/events', HOST, {
      kind: 'event', title: 'Moderation Field Night', description: 'Demo', start_date: '2027-04-01', start_time: '18:00',
      timezone: 'Africa/Kampala', format: 'in_person', location: 'Kampala Innovation Hub'
    });
    const r = await api('PATCH', `/api/data/events/${created.json.item.id}`, HOST, { hidden_by_moderation: false, author_id: 'x' });
    expect(r.status).toBe(403);
  });

  it('deleting an event through the generic route removes its guests too', async () => {
    addProfile('t111-host-b');
    const HOST = { Authorization: 'Bearer t111-host-b' };
    const created = await api('POST', '/api/events', HOST, {
      kind: 'event', title: 'Cascade Delete Night', description: 'Demo', start_date: '2027-05-01', start_time: '18:00',
      timezone: 'Africa/Kampala', format: 'in_person', location: 'Kampala Innovation Hub'
    });
    const evId = created.json.item.id;
    store.event_guests.push({ id: 'g-t111', event_id: evId, name: 'Guest', email: 'g@example.com' });
    const r = await api('DELETE', `/api/data/events/${evId}`, HOST);
    expect(r.status).toBe(200);
    expect(store.events.some((e: any) => e.id === evId)).toBe(false);
    expect(store.event_guests.some((g: any) => g.event_id === evId)).toBe(false);
  });

  it('notifications: recipient must exist, type is limited, and senders are rate limited', async () => {
    expect((await api('POST', '/api/data/notifications', MEMBER, { to_id: 'ghost', body: 'hi' })).status).toBe(400);
    const r = await api('POST', '/api/data/notifications', MEMBER, { to_id: 't111-other', body: 'hi', type: 'admin_broadcast' });
    expect(r.status).toBe(200);
    expect(r.json.type).toBe('message');
    const now = Date.now();
    for (let i = 0; i < 30; i++) expect(allowNotificationSend('t111-limit', now)).toBe(true);
    expect(allowNotificationSend('t111-limit', now)).toBe(false);
    expect(allowNotificationSend('t111-limit', now + 11 * 60 * 1000)).toBe(true);
  });

  it('marking a notification read cannot rewrite its text', async () => {
    const n = await api('POST', '/api/data/notifications', OTHER, { to_id: 't111-member', body: 'Original' });
    await api('PATCH', `/api/data/notifications/${n.json.id}`, MEMBER, { read: true, body: 'Changed' });
    const stored = store.notifications.find((x: any) => x.id === n.json.id);
    expect(stored.read).toBe(true);
    expect(stored.body).toBe('Original');
  });

  it('claiming a profile requires the same email (or none stored)', async () => {
    expect(canClaimProfile({ email: 'a@x.com' }, 'u1', 'b@x.com')).toBe(false);
    expect(canClaimProfile({ email: 'A@x.com' }, 'u1', 'a@x.com')).toBe(true);
    expect(canClaimProfile({}, 'u1', undefined)).toBe(true);
    expect(canClaimProfile({ account_uid: 'u2' }, 'u1', 'a@x.com')).toBe(false);
    store.profiles.push({ id: 't111-unclaimed', name: 'Unclaimed', email: 'owner@example.com', created_at: new Date().toISOString() });
    const r = await api('POST', '/api/auth/claim-profile', MEMBER, { profileId: 't111-unclaimed' });
    expect(r.status).toBe(403);
    expect(store.profiles.find((p: any) => p.id === 't111-unclaimed').account_uid).toBeUndefined();
  });

  it('admin "delete member" also removes follows, matches and notifications', async () => {
    addProfile('t111-gone');
    store.follows.push({ id: 'f-t111-gone', follower_id: 't111-gone', following_id: 't111-member' });
    store.notifications.push({ id: 'n-t111-gone', to_id: 't111-gone', body: 'x' });
    const r = await api('POST', '/api/admin/action', ADMIN, { action: 'delete_member', id: 't111-gone' });
    expect(r.status).toBe(200);
    expect(store.follows.some((f: any) => f.id === 'f-t111-gone')).toBe(false);
    expect(store.notifications.some((n: any) => n.id === 'n-t111-gone')).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */
describe('Admin routes, limits and small hardening', () => {
  it('signed-in non-admins get 403 (not 401) on admin routes', async () => {
    expect((await api('GET', '/api/admin/overview', OTHER)).status).toBe(403);
    expect((await api('GET', '/api/admin/overview')).status).toBe(401);
    expect((await api('POST', '/api/upload-photo', OTHER, { slot: 'hero', dataUrl: 'x' })).status).toBe(403);
  });

  it('the admin fallback token is not accepted from the query string', async () => {
    expect((await api('GET', '/api/admin/overview?token=anything')).status).toBe(401);
  });

  it('JSON bodies are capped at 2 MB outside admin uploads', async () => {
    const big = 'x'.repeat(2.5 * 1024 * 1024);
    const r = await api('POST', '/api/data/posts', MEMBER, { body: big });
    expect(r.status).toBe(413);
    expect(needsLargeJsonBody('/api/admin/team/x/photo')).toBe(true);
    expect(needsLargeJsonBody('/api/data/profiles')).toBe(false);
  });

  it('site photo upload accepts only the known slots and real images', async () => {
    expect((await api('POST', '/api/upload-photo', ADMIN, { slot: '../../server', dataUrl: await pngDataUrl() })).status).toBe(400);
    const notImage = `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`;
    expect((await api('POST', '/api/upload-photo', ADMIN, { slot: 'hero', dataUrl: notImage })).status).toBe(400);
  });

  it('event share pages keep "$&" in titles literally', () => {
    const html = injectEventOgIntoHtml('<html><head></head><body></body></html>', { id: 'e1', title: 'Pay $& win', starts_at: new Date().toISOString() });
    expect(html).toContain('Pay $&amp; win');
    expect(html).not.toContain('<head></head>Pay');
  });

  it('avatar initials are escaped in the SVG', async () => {
    addProfile('t111-amp', { name: '<Amp', avatar: '' });
    const res = await fetch(`${baseUrl}/api/avatar/t111-amp`);
    const svg = await res.text();
    expect(svg).toContain('&lt;');
    expect(svg).not.toContain('><</text>');
  });
});

/* ------------------------------------------------------------------------- */
describe('Match wording', () => {
  it('does not say "Developer and Developer"', () => {
    expect(roleReason('Ada', 'Developer', 'Developer')).not.toMatch(/Developer and Developer/);
    expect(roleReason('Ada', 'Designer', 'Developer')).toContain('Designer and Developer');
  });

  it('spark sentences do not repeat the same phrase or cut words', () => {
    expect(sparkSentence('React and TypeScript', 'React and TypeScript')).toBe('A project where you both put React and TypeScript to work.');
    const s = sparkSentence('Customer interviews and market sizing for fintech products in Kampala', 'Flutter');
    expect(s).toMatch(/^A project combining Customer interviews and market sizing for with Flutter\.$|^A project combining Customer interviews and market sizing with Flutter\.$/);
  });
});

/* ------------------------------------------------------------------------- */
describe('Screen fixes', () => {
  it('older events with a machine date show a formatted time, not the raw ISO text', async () => {
    const { formatEventDateTime } = await import('../src/utils');
    const r = formatEventDateTime(undefined, undefined, 'Africa/Kampala', '2026-10-24T14:47:49.690Z');
    expect(r.isLegacy).toBe(false);
    expect(r.display).not.toContain('T14:47');
    expect(formatEventDateTime(undefined, undefined, undefined, 'Every Friday').display).toBe('Every Friday');
  });

  it('a link to a missing event shows "Page not found" with a way back to events', async () => {
    vi.spyOn(apiModule, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(apiModule, 'fetchEventById').mockResolvedValue(null as any);
    window.location.hash = '#/events/no-such-event';
    await act(async () => {
      render(React.createElement(EventsView, { currentProfile: null, allProfiles: [], initialItemId: 'no-such-event', onViewProfile: vi.fn(), onToast: vi.fn() } as any));
    });
    expect(await screen.findByText(/does not exist or was removed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /See all events/ })).toBeTruthy();
    window.location.hash = '';
  });

  it('Learn shows an empty state instead of "(0)" when nobody teaches yet', async () => {
    const { LearnView } = await import('../src/components/LearnView');
    render(React.createElement(LearnView, { currentProfile: null, allProfiles: [], followingIds: [], onToggleFollow: vi.fn(), onViewProfile: vi.fn(), onJoinClick: vi.fn() } as any));
    expect(screen.getByText(/No one has shared what they can teach yet/)).toBeTruthy();
    expect(screen.queryByText(/\(0\)/)).toBeNull();
  });

  it('dialogs close on Escape, move focus inside and give it back on close', async () => {
    const { useDialogA11y } = await import('../src/hooks/useDialogA11y');
    function Demo() {
      const [open, setOpen] = React.useState(false);
      const ref = useDialogA11y<HTMLDivElement>(open, () => setOpen(false));
      return React.createElement('div', null,
        React.createElement('button', { onClick: () => setOpen(true) }, 'Open'),
        open && React.createElement('div', { ref, role: 'dialog', tabIndex: -1 },
          React.createElement('button', null, 'First'),
          React.createElement('button', null, 'Last')));
    }
    render(React.createElement(Demo));
    const opener = screen.getByText('Open');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement?.textContent).toBe('First');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('the header keeps the full search box for wide screens only (fits at 768px)', async () => {
    if (typeof window.matchMedia !== 'function') {
      (window as any).matchMedia = (query: string) => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
    }
    const { Header } = await import('../src/components/Header');
    const member: any = { id: 'h1', name: 'Hana Member', headline: 'x', role: 'Developer', created_at: new Date().toISOString() };
    const { container } = render(React.createElement(Header, { unreadCount: 0, themePreference: 'system', onCycleTheme() {}, searchQuery: '', onSearchChange() {}, onNavigate() {}, currentProfile: member } as any));
    const box = container.querySelector('input[aria-label="Search people, skills, and needs"]')!.closest('div.hidden')!;
    expect(box.className).toContain('lg:flex');
    expect(box.className).not.toContain('md:flex');
    expect(container.querySelector('button[aria-label="Toggle search"]')!.className).toContain('lg:hidden');
  });

  it('footer separators are hidden on phones so no "·" dangles at a line end', async () => {
    const { Footer } = await import('../src/components/Footer');
    const { container } = render(React.createElement(Footer, { onNavigate: vi.fn(), onJoin: vi.fn() } as any));
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')).filter(s => s.textContent === '·');
    expect(dots.length).toBeGreaterThan(0);
    for (const d of dots) expect(d.className).toContain('hidden sm:inline');
  });

  it('the pinned announcement is not polled while the tab is in the background', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(apiModule, 'fetchPinnedAnnouncement').mockResolvedValue(null as any);
    const { PinnedAnnouncementBar } = await import('../src/components/PinnedAnnouncementBar');
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(React.createElement(PinnedAnnouncementBar));
    const initial = spy.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(95_000);
    });
    expect(spy.mock.calls.length).toBe(initial);
    vis.mockReturnValue('visible');
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(spy.mock.calls.length).toBeGreaterThan(initial);
    vi.useRealTimers();
  });

  it('the profile page no longer shows the made-up activity heatmap', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/ProfileView.tsx', 'utf8');
    expect(src).not.toMatch(/Commit Stream/);
  });

  it('the Matches banner never shows a server setting name to members', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/MatchesView.tsx', 'utf8');
    expect(src).not.toMatch(/\{errorMessage \|\|/);
    expect(src).not.toMatch(/GEMINI_API_KEY/);
  });

  it('heavy screens are code-split out of the main bundle', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/App.tsx', 'utf8');
    for (const name of ['EventsView', 'LearnView', 'InboxView', 'ProfileView', 'AuthModal', 'AdminView']) {
      expect(src).toMatch(new RegExp(`const ${name} = React\\.lazy\\(`));
      expect(src).not.toMatch(new RegExp(`import \\{ ${name} \\} from`));
    }
  });
});
