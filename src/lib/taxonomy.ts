import type { CollectionEntry } from 'astro:content';

export const FORM_FACTOR_LABELS: Record<string, string> = {
  flakes: 'Flakes',
  clusters: 'Clusters',
  granola: 'Granola',
  puffs: 'Puffs',
  squares: 'Squares',
  os: "O's",
  shredded: 'Shredded',
  biscuits: 'Biscuits',
  muesli: 'Muesli',
  oats: 'Oats',
  crisps: 'Crisps',
  // Bars. Each label says "Bar" so a bar reads as one in a mixed list.
  'protein-bar': 'Protein Bar',
  'granola-bar': 'Granola Bar',
  'nut-bar': 'Nut Bar',
  'fruit-bar': 'Fruit Bar',
  // Snacks. Puffs and crisps are shared with cereal.
  chips: 'Chips',
  bites: 'Bites',
  cookies: 'Cookies',
  jerky: 'Jerky',
  crackers: 'Crackers',
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  'gluten-free': 'Gluten-Free',
  'grain-free': 'Grain-Free',
  keto: 'Keto',
  'low-sugar': 'Low-Sugar',
  'high-protein': 'High-Protein',
  'high-fiber': 'High-Fiber',
  vegan: 'Vegan',
  organic: 'Organic',
  'no-added-sugar': 'No Added Sugar',
  'nut-free': 'Nut-Free',
};

export const PROTEIN_SOURCE_LABELS: Record<string, string> = {
  'pea-protein': 'Pea Protein',
  'milk-protein': 'Milk Protein',
  whey: 'Whey',
  soy: 'Soy',
  'nut-seed': 'Nut / Seed',
  'grain-only': 'Grain-Only',
};

export type Category = CollectionEntry<'cereals'>['data']['category'];

/**
 * How each category reads on the site, and where its pages live. `path` is the
 * URL segment of its detail pages: cereals stay at /cereals/<slug>/, so no
 * existing link changes. `one` and `many` are the nouns for counts.
 */
export const CATEGORY_INFO: Record<Category, { label: string; one: string; many: string; path: string }> = {
  cereal: { label: 'Cereal', one: 'box', many: 'boxes', path: 'cereals' },
  bar: { label: 'Bars', one: 'bar', many: 'bars', path: 'bars' },
  snack: { label: 'Snacks', one: 'snack', many: 'snacks', path: 'snacks' },
};

/** Categories in display order. Cereal first: the site is a cereal site. */
export const CATEGORY_ORDER: Category[] = ['cereal', 'bar', 'snack'];

/** "3 bars", "1 box". */
export function countOf(category: Category, n: number): string {
  const info = CATEGORY_INFO[category];
  return `${n} ${n === 1 ? info.one : info.many}`;
}

/** A product's own page, before the base path is added. */
export function productPath(c: CollectionEntry<'cereals'>): string {
  return `/${CATEGORY_INFO[c.data.category].path}/${c.id}/`;
}

/**
 * True for a bar. Bars come in wrappers, so their photo is a wide 5:2 strip
 * (WrapperShot) rather than the tall front of a box.
 */
export function inWrapper(c: CollectionEntry<'cereals'>): boolean {
  return c.data.category === 'bar';
}

/** The products in one category, in the order given. */
export function inCategory<T extends CollectionEntry<'cereals'>>(list: T[], category: Category): T[] {
  return list.filter((c) => c.data.category === category);
}

// The filter buttons on the Aisle, one row per category. `all` is everything
// in that category. High-protein and low-sugar are attributes, so they work
// in every category; the rest are form factors.
export const AISLE_FILTERS: Record<Category, string[]> = {
  cereal: ['all', 'flakes', 'clusters', 'granola', 'puffs', 'high-protein', 'low-sugar'],
  bar: ['all', 'protein-bar', 'granola-bar', 'nut-bar', 'fruit-bar', 'high-protein', 'low-sugar'],
  snack: ['all', 'chips', 'puffs', 'crisps', 'bites', 'cookies', 'jerky', 'crackers', 'high-protein', 'low-sugar'],
};

/** The filter row shown when every category is on the shelf at once. */
export const EVERYTHING_FILTERS = ['all', 'high-protein', 'low-sugar'];

export function label(key: string): string {
  if (key === 'all') return 'Everything';
  return (
    FORM_FACTOR_LABELS[key] ?? ATTRIBUTE_LABELS[key] ?? PROTEIN_SOURCE_LABELS[key] ?? key
  );
}
