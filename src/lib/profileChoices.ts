export const INTENT_CHOICES = [
  'Find a co-founder',
  'Find a technical partner',
  'Find a business partner',
  'Join a project',
  'Find a mentor or be one',
  'Learn a skill',
  'Find a research collaborator',
  'Find participants or data'
];

export const ROLE_CHOICES = [
  'Founder',
  'Business',
  'Developer',
  'Designer',
  'Domain expert',
  'Mentor',
  'Student',
  'Researcher'
];

export const STAGE_CHOICES = [
  'I have an idea',
  'I have a project running',
  'I have skills and want to join one'
];

export function parseIntents(input: unknown): string[] {
  if (typeof input !== 'string' && !Array.isArray(input)) return [];
  const rawItems = Array.isArray(input)
    ? input.map(x => String(x))
    : String(input).split(',');
  const valid: string[] = [];
  for (const item of rawItems) {
    const trimmed = item.trim();
    if (INTENT_CHOICES.includes(trimmed) && !valid.includes(trimmed)) {
      valid.push(trimmed);
    }
  }
  return valid;
}

export function normalizeIntent(input: unknown): string | null {
  if (input === '' || (Array.isArray(input) && input.length === 0)) {
    return '';
  }
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'string' && input.trim() === '') {
    return '';
  }

  const valid = parseIntents(input).slice(0, 3);
  if (valid.length === 0) {
    return null;
  }
  return valid.join(', ');
}

