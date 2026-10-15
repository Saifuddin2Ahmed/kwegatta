export const EAT_TIMEZONES = new Set([
  'Africa/Kampala',
  'Africa/Nairobi',
  'Africa/Dar_es_Salaam',
  'Africa/Addis_Ababa',
  'Africa/Mogadishu',
  'Africa/Djibouti',
  'Africa/Asmara',
  'Indian/Comoro',
  'Indian/Antananarivo',
  'Indian/Mayotte'
]);

/**
 * Returns a friendly timezone abbreviation/label (e.g. "EAT", "GMT+2", "EST").
 * - East Africa Time zones -> "EAT"
 * - Valid IANA zones -> timeZoneName ('short') part from Intl.DateTimeFormat
 * - Empty string / undefined -> "EAT" (default Africa/Kampala)
 * - Invalid timezone identifier -> "UTC"
 */
export function formatTzLabel(tz?: string, at?: Date): string {
  const trimmed = (tz || '').trim();
  if (!trimmed) {
    return 'EAT';
  }
  if (EAT_TIMEZONES.has(trimmed)) {
    return 'EAT';
  }
  const dateObj = at instanceof Date && !isNaN(at.getTime()) ? at : new Date();
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: trimmed,
      timeZoneName: 'short'
    });
    const parts = dtf.formatToParts(dateObj);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      return tzPart.value;
    }
    return trimmed;
  } catch (_) {
    return 'UTC';
  }
}
