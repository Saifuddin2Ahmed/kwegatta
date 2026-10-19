// Page header photos in public/images/headers (credits in public/images/CREDITS.md).
// Each photo has a 1920px and an 800px WebP, both 16:9.

export interface HeaderImage {
  src: string;
  srcSet: string;
  alt: string;
}

function headerImage(name: string, alt: string): HeaderImage {
  const base = `/images/headers/${name}`;
  return {
    src: `${base}.webp`,
    srcSet: `${base}-800.webp 800w, ${base}.webp 1920w`,
    alt
  };
}

export const HEADER_IMAGES = {
  about: headerImage('about-hero', 'Five young people gathered around a table, planning a project together on paper'),
  events: headerImage('events', 'Students filling a lecture hall with red seats, listening to a talk'),
  people: headerImage('people', 'Two students working side by side on a laptop while a mentor looks on'),
  learn: headerImage('learn', 'Students studying at wooden desks in a bright classroom in Iganga, Uganda'),
  feed: headerImage('feed', 'Three young people leaning over a laptop, smiling at what they see'),
  team: headerImage('team', 'Kampala city skyline in warm evening light')
} satisfies Record<string, HeaderImage>;
