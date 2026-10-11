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

// FDA Daily Values for adults and children 4+, based on a 2,000-calorie diet
// (21 CFR 101.9(c), the values on every US label since the 2016 update):
// https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels
// Calories, trans fat, total sugars and the poly/mono fats have no Daily
// Value, so a real label leaves their %DV blank and so does this site.
// Protein's %DV comes from `proteinDVOf` in score.ts, because a label's
// protein %DV is adjusted for protein quality and can't be derived from grams.
export const DAILY_VALUES = {
  totalFat: 78,
  saturatedFat: 20,
  sodium: 2300,
  totalCarbs: 275,
  dietaryFiber: 28,
  addedSugars: 50,
} as const;

export type DVKey = keyof typeof DAILY_VALUES;

/** % Daily Value for an amount in the same units as the DV (g, or mg for sodium). */
export function percentDV(key: DVKey, value: number | null | undefined): number | null {
  return value == null ? null : (value / DAILY_VALUES[key]) * 100;
}

// "% of a day" for the Aisle's percent view. It uses the FDA Daily Values plus
// two references the FDA doesn't set:
// - Total sugars use 50 g, the added-sugar Daily Value. Sugar counts the same
//   whether it was added or came from fruit, so the site always grades total
//   sugars and gives them a percent too.
// - Calories use 2,000 kcal, the day every %DV on a label is based on.
// The replica Nutrition Facts panel doesn't use these, because a real label
// leaves both blank.
// Protein is not here: use `proteinDVOf` in score.ts.
export const DAY_REFERENCES = { ...DAILY_VALUES, totalSugars: 50, calories: 2000 } as const;

export type DayKey = keyof typeof DAY_REFERENCES;

/** An amount as a percent of a day's reference amount (see DAY_REFERENCES). */
export function percentOfDay(key: DayKey, value: number | null | undefined): number | null {
  return value == null ? null : (value / DAY_REFERENCES[key]) * 100;
}
