/**
 * Shared Ticket Code Normalization, Validation & Formatting (Release 1.9.2)
 * Used by both client and server for readable, typo-tolerant event ticket codes.
 */

/**
 * Normalizes a scanned or manually typed ticket code:
 * - Trims whitespace
 * - If it starts with KWG1: (any case), extracts the part after the second colon
 * - Converts to uppercase
 * - Removes spaces, hyphens, dots, and underscores
 * - Maps common lookalike digits to their Base32 letters: 0 -> O, 1 -> I, 8 -> B
 */
export function normalizeTicketCode(input: string): string {
  let str = String(input ?? '').trim();
  if (/^kwg1:/i.test(str)) {
    const firstColon = str.indexOf(':');
    const secondColon = firstColon >= 0 ? str.indexOf(':', firstColon + 1) : -1;
    if (secondColon >= 0) {
      str = str.slice(secondColon + 1);
    }
  }
  return str
    .trim()
    .toUpperCase()
    .replace(/[\s\-._]+/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/8/g, 'B');
}

/**
 * Checks whether a normalized ticket code is exactly 10 Base32 characters (A-Z and 2-7).
 */
export function isValidTicketCode(code: string): boolean {
  if (typeof code !== 'string') return false;
  return /^[A-Z2-7]{10}$/.test(code);
}

/**
 * Formats a ticket code as "ABCDE-FGHIJ".
 */
export function formatTicketCode(code: string): string {
  const norm = normalizeTicketCode(code);
  if (norm.length >= 10) {
    return `${norm.slice(0, 5)}-${norm.slice(5, 10)}`;
  }
  if (norm.length > 5) {
    return `${norm.slice(0, 5)}-${norm.slice(5)}`;
  }
  return norm;
}

/**
 * Auto-formats user input while typing a manual ticket code (inserts dash after 5 chars).
 */
export function formatLiveTicketInput(raw: string): string {
  const trimmed = String(raw ?? '');
  if (/^kwg1:/i.test(trimmed.trim())) {
    return formatTicketCode(trimmed);
  }
  const cleaned = trimmed
    .toUpperCase()
    .replace(/[\s\-._]+/g, '')
    .slice(0, 10);
  if (cleaned.length > 5) {
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
  }
  return cleaned;
}
