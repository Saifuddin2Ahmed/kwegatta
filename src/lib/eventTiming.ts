/**
 * Shared date helpers for events and opportunities (used by server.ts and the client).
 *
 * Effective start of an event: starts_at -> parsed legacy `datetime` text -> created_at.
 * Opportunities sort by a parseable deadline, else created_at.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const DEFAULT_EVENT_DURATION_MS = 2 * HOUR_MS;
export const DUPLICATE_WINDOW_MS = DAY_MS;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Legacy text was written for Kampala first, so EAT is the default when no zone is given.
const TZ_OFFSET_HOURS: Record<string, number> = { eat: 3, cat: 2, sast: 2, wat: 1, gmt: 0, utc: 0 };

function toMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = new Date(value as any).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Parses legacy free-text dates such as "Sat, Nov 14 • 2:00 PM EAT" or "November 1st".
 * When the year is missing it is inferred from `refMs` (usually created_at): the weekday
 * is matched if present, otherwise the first candidate not long before the reference.
 * Date-only text resolves to the start of the day, or the end of the day when `endOfDay` is set.
 */
export function parseLegacyDateMs(text: unknown, refMs: number = Date.now(), endOfDay = false): number | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const raw = text.trim();

  // Plain ISO date (e.g. from a date input): treat as an EAT calendar day
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) {
    const base = Date.UTC(+isoDay[1], +isoDay[2] - 1, +isoDay[3]) - 3 * HOUR_MS;
    return endOfDay ? base + DAY_MS - 1 : base;
  }
  if (/\d{4}-\d{2}-\d{2}T/.test(raw)) return toMs(raw);

  const cleaned = raw
    .toLowerCase()
    .replace(/[•·,|]/g, ' ')
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  let month = -1;
  let day = 0;
  let year: number | null = null;
  const monthFirst = cleaned.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b(?: (\d{4})\b)?/);
  const dayFirst = cleaned.match(/\b(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?: (\d{4})\b)?/);
  if (monthFirst) {
    month = MONTHS.indexOf(monthFirst[1]);
    day = +monthFirst[2];
    year = monthFirst[3] ? +monthFirst[3] : null;
  } else if (dayFirst) {
    day = +dayFirst[1];
    month = MONTHS.indexOf(dayFirst[2]);
    year = dayFirst[3] ? +dayFirst[3] : null;
  } else {
    return null;
  }
  if (month < 0 || day < 1 || day > 31) return null;

  let hours = 0;
  let minutes = 0;
  let hasTime = false;
  const ampm = cleaned.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/);
  const clock = cleaned.match(/\b(\d{1,2}):(\d{2})\b/);
  if (ampm) {
    hours = (+ampm[1] % 12) + (ampm[3] === 'pm' ? 12 : 0);
    minutes = ampm[2] ? +ampm[2] : 0;
    hasTime = true;
  } else if (clock) {
    hours = +clock[1];
    minutes = +clock[2];
    hasTime = true;
  }
  if (hours > 23 || minutes > 59) return null;

  const tzMatch = cleaned.match(/\b(eat|cat|sast|wat|gmt|utc)\b/);
  const offsetMs = (tzMatch ? TZ_OFFSET_HOURS[tzMatch[1]] : 3) * HOUR_MS;

  const build = (y: number) => {
    const base = Date.UTC(y, month, day, hours, minutes) - offsetMs;
    return !hasTime && endOfDay ? base + DAY_MS - 1 : base;
  };
  // Reject impossible dates such as Feb 31
  const isRealDate = (y: number) => new Date(Date.UTC(y, month, day)).getUTCDate() === day;

  if (year !== null) return isRealDate(year) ? build(year) : null;

  const refYear = new Date(refMs).getUTCFullYear();
  const candidates = [refYear - 1, refYear, refYear + 1].filter(isRealDate);
  const weekdayMatch = cleaned.match(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (weekdayMatch) {
    const wanted = WEEKDAYS.indexOf(weekdayMatch[1]);
    const byWeekday = candidates.filter(y => new Date(Date.UTC(y, month, day)).getUTCDay() === wanted);
    if (byWeekday.length > 0) {
      return build(byWeekday.reduce((best, y) => (Math.abs(build(y) - refMs) < Math.abs(build(best) - refMs) ? y : best)));
    }
  }
  const firstAfter = candidates.find(y => build(y) >= refMs - 180 * DAY_MS);
  return build(firstAfter ?? refYear);
}

export function getCreatedMs(item: any): number {
  return toMs(item?.created_at) ?? 0;
}

/** starts_at -> parsed legacy datetime -> created_at */
export function getEffectiveStartMs(item: any): number {
  const startsAt = toMs(item?.starts_at);
  if (startsAt !== null) return startsAt;
  const createdMs = toMs(item?.created_at);
  const legacy = parseLegacyDateMs(item?.datetime, createdMs ?? Date.now());
  if (legacy !== null) return legacy;
  return createdMs ?? 0;
}

export function getEffectiveEndMs(item: any): number {
  const start = getEffectiveStartMs(item);
  const endsAt = toMs(item?.ends_at);
  return endsAt !== null && endsAt >= start ? endsAt : start + DEFAULT_EVENT_DURATION_MS;
}

/** Parsed deadline (end of that day when no time is given), or null when it cannot be read. */
export function getOpportunityDeadlineMs(item: any): number | null {
  return parseLegacyDateMs(item?.deadline, toMs(item?.created_at) ?? Date.now(), true);
}

/** The time an item is ordered by: events by effective start, opportunities by deadline else created_at. */
export function getSortTimeMs(item: any): number {
  if (item?.kind === 'opportunity') {
    return getOpportunityDeadlineMs(item) ?? getCreatedMs(item);
  }
  return getEffectiveStartMs(item);
}

/** Upcoming: soonest first. Past: most recent first. Ties fall back to newest created. */
export function sortForTab<T>(items: T[], tab: 'upcoming' | 'past'): T[] {
  const dir = tab === 'upcoming' ? 1 : -1;
  return [...items].sort((a: any, b: any) => {
    const diff = (getSortTimeMs(a) - getSortTimeMs(b)) * dir;
    if (diff !== 0) return diff;
    return getCreatedMs(b) - getCreatedMs(a);
  });
}

export function normalizeTitle(title: unknown): string {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Finds an item by the same author with the same normalized title created within the last 24 hours.
 * `authorIds` accepts both the profile id and the account uid of the author.
 */
export function findRecentDuplicate<T extends { author_id?: string; title?: string; created_at?: string }>(
  items: T[],
  authorIds: Array<string | null | undefined>,
  title: string,
  nowMs: number = Date.now()
): T | null {
  const ids = new Set(authorIds.filter(Boolean) as string[]);
  const wanted = normalizeTitle(title);
  if (!wanted || ids.size === 0) return null;
  return (
    items.find(it => {
      if (!it.author_id || !ids.has(it.author_id)) return false;
      if (normalizeTitle(it.title) !== wanted) return false;
      const created = toMs(it.created_at);
      return created !== null && nowMs - created >= 0 && nowMs - created < DUPLICATE_WINDOW_MS;
    }) || null
  );
}
