// Title rules for events and opportunities, shared by the create/edit forms and the server.

export const EVENT_TITLE_MIN = 4;
export const EVENT_TITLE_MAX = 120;

/** Placeholder and help text shown in the event form; a title must not just repeat them. */
export const EVENT_FORM_PROMPTS = [
  'e.g. Flutter Hackday',
  'Flutter Hackday',
  'Share details about what builders will learn, hack on, or gain...',
  'Something people attend at a set date and time, in person or online.',
  'Something people apply for before a deadline, like a grant, job or hackathon.',
  'Title',
  'Event title',
  'Enter a title'
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/^e\.g\.?\s*/, '')
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();
}

/** True when straight double quotes or curly double quotes are left open. */
export function hasUnbalancedQuotes(title: string): boolean {
  const straight = (title.match(/"/g) || []).length;
  if (straight % 2 !== 0) return true;
  const open = (title.match(/“/g) || []).length;
  const close = (title.match(/”/g) || []).length;
  return open !== close;
}

/** Returns an error message for the title, or null when it can be published. */
export function validateEventTitle(raw: unknown, prompts: readonly string[] = EVENT_FORM_PROMPTS): string | null {
  const title = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!title) return 'Title is required';
  if (title.length < EVENT_TITLE_MIN) return `Title must be at least ${EVENT_TITLE_MIN} characters`;
  if (title.length > EVENT_TITLE_MAX) return `Title must be ${EVENT_TITLE_MAX} characters or fewer`;
  const norm = normalize(title);
  const lower = title.toLowerCase();
  for (const p of prompts) {
    const np = normalize(p);
    // Equal to an example ("Flutter Hackday"), or containing the literal placeholder
    // ("e.g. Flutter Hackday") or a whole help sentence. A real title may still mention Flutter Hackday.
    const literal = p.toLowerCase().replace(/\.{3}$/, '');
    const containsLiteral = (literal.startsWith('e.g.') || literal.length >= 30) && lower.includes(literal);
    if ((np && norm === np) || containsLiteral) {
      return 'Please write your own title instead of the example text';
    }
  }
  if (hasUnbalancedQuotes(title)) return 'Title has an opening quote without a closing one';
  return null;
}
