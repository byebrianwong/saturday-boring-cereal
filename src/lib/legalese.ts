import type { CollectionEntry } from 'astro:content';

// Reviews are rendered as advert small print. The design shouts; this is the
// part that stays flat and factual, which is where the joke actually lands.
// Everything below is derived from the real entry — no figure is invented, and
// a missing value is stated as missing rather than filled in.

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Spell a whole number out, the way small print does. Falls back to digits. */
export function numWord(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (!Number.isInteger(n)) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  if (n < 1000) {
    const h = `${ONES[Math.floor(n / 100)]} hundred`;
    const r = n % 100;
    return r ? `${h} and ${numWord(r)}` : h;
  }
  return String(n);
}

/** "four grams protein" — null values are dropped, never guessed. */
function gramClause(value: number | null | undefined, noun: string): string | null {
  if (value == null) return null;
  return `${numWord(value)} gram${value === 1 ? '' : 's'} ${noun}`;
}

export interface LegaleseParts {
  /** "MICHELLE'S GRANOLA — ALMOND BUTTER." */
  heading: string;
  /** "8.5 / 10", or null when the box is unrated. */
  score: string | null;
  /** The verbatim tasting note, or null when none was recorded. */
  note: string | null;
  /** The nutrition sentence, already assembled. */
  figures: string;
  /** A closing clause, picked deterministically so builds stay stable. */
  closer: string;
}

const CLOSERS = [
  'Individual bowls may vary. Not a substitute for breakfast, merely the loudest part of it.',
  'No endorsement, payment, sample, or affiliation exists between this site and any manufacturer named herein.',
  'Serving size measured on a kitchen scale and not estimated by eye, spoon, or hope.',
  'Figures transcribed from the packaging panel at time of purchase and may be reformulated without warning or apology.',
  'The panel on the front of the box is an advert. The panel on the side is the truth. Only one of them is quoted here.',
  'Scored by one person, in one kitchen, on one Saturday, with no supervision whatsoever.',
];

export function legaleseFor(cereal: CollectionEntry<'cereals'>, index = 0): LegaleseParts {
  const d = cereal.data;
  const n = d.nutrition;

  const clauses = [
    gramClause(n.protein, 'protein'),
    gramClause(n.totalSugars, 'sugar'),
    gramClause(n.dietaryFiber, 'fiber'),
    gramClause(n.totalFat, 'fat'),
  ].filter((c): c is string => c != null);

  const calories = n.calories != null ? `${numWord(n.calories)} calories` : null;
  const all = calories ? [...clauses, calories] : clauses;

  const figures = all.length
    ? `${all.join(', ')} per ${numWord(n.servingSize)} gram serving.`
    : `Serving size ${numWord(n.servingSize)} grams. No further figures are listed on the panel, and none have been supplied here.`;

  return {
    heading: `${d.brand} — ${d.name}.`,
    score: d.rating == null ? null : `${d.rating.toFixed(1)} / 10`,
    note: d.shortNote ?? null,
    figures,
    closer: CLOSERS[index % CLOSERS.length],
  };
}
