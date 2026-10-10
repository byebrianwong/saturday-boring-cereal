import type { CollectionEntry } from 'astro:content';

export type Nutrition = CollectionEntry<'cereals'>['data']['nutrition'];

// Frontmatter stores nutrition per serving, exactly as the label prints it.
// The site shows and grades it per 100 g instead, because serving sizes differ
// from box to box (28 g to 65 g on the current shelf). Comparing per serving
// rewards a box for stating a bigger serving. Scaling happens here, at build
// time, so the stored numbers always match the physical label.

const SCALED_KEYS = [
  'calories',
  'totalFat',
  'saturatedFat',
  'transFat',
  'polyunsaturatedFat',
  'monounsaturatedFat',
  'totalCarbs',
  'dietaryFiber',
  'totalSugars',
  'addedSugars',
  'protein',
  'proteinDV',
  'sodium',
] as const;

/**
 * The same nutrition scaled to 100 g. `servingSize` and `servingDescription`
 * are left as the label states them. Values the label omits stay null.
 * Values are not rounded; round only when displaying.
 */
export function per100g(n: Nutrition): Nutrition {
  const factor = 100 / n.servingSize;
  const out: Nutrition = { ...n };
  for (const k of SCALED_KEYS) {
    const v = n[k];
    out[k] = v == null ? v : v * factor;
  }
  return out;
}

/** Shorthand: a cereal's nutrition per 100 g. */
export function per100gOf(c: CollectionEntry<'cereals'>): Nutrition {
  return per100g(c.data.nutrition);
}
