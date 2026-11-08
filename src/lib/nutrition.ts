import type { CollectionEntry } from 'astro:content';

export type Nutrition = CollectionEntry<'cereals'>['data']['nutrition'];

// Frontmatter stores nutrition per serving, exactly as the label prints it.
// The site shows and grades it per 100 g instead, because serving sizes differ
// from box to box (28 g to 65 g on the current shelf). Comparing per serving
// rewards a box for stating a bigger serving. Scaling happens here, at build
// time, so the stored numbers always match the physical label.
//
// Milk is the one exception: it is shown and graded per 250 mL. That is about
// what someone pours on a bowl of cereal or into a glass, while 100 g of milk
// is less than half a glass. Milk labels state the serving in millilitres, so
// scaling by volume needs no density.

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

/** Every amount multiplied by `factor`. Values the label omits stay null. */
function scaled(n: Nutrition, factor: number): Nutrition {
  const out: Nutrition = { ...n };
  for (const k of SCALED_KEYS) {
    const v = n[k];
    out[k] = v == null ? v : v * factor;
  }
  return out;
}

/**
 * The same nutrition scaled to 100 g. `servingSize` and `servingDescription`
 * are left as the label states them. Values the label omits stay null.
 * Values are not rounded; round only when displaying.
 */
export function per100g(n: Nutrition): Nutrition {
  return scaled(n, 100 / n.servingSize);
}

/** How much milk the site shows and grades, in millilitres. */
export const MILK_ML = 250;

// The FDA's serving for milk, which every US carton prints: 1 cup, 240 mL.
// Used only when a milk's serving description doesn't give the millilitres.
const CUP_ML = 240;

/** A label serving in millilitres: read from "1 cup (240 mL)", else 1 cup. */
export function servingMl(n: Nutrition): number {
  const m = /(\d+(?:\.\d+)?)\s*ml\b/i.exec(n.servingDescription ?? '');
  return m ? Number(m[1]) : CUP_ML;
}

/** The same nutrition scaled to 250 mL, for milk. Like `per100g` otherwise. */
export function per250ml(n: Nutrition): Nutrition {
  return scaled(n, MILK_ML / servingMl(n));
}

/** What a product's numbers are shown and graded per. */
export interface Basis {
  /** For "per …" text: "100 g" or "250 mL". */
  label: string;
  /** The same, squeezed for a price tag: "/100g" or "/250mL". */
  short: string;
}

const PER_100G: Basis = { label: '100 g', short: '/100g' };
const PER_250ML: Basis = { label: `${MILK_ML} mL`, short: `/${MILK_ML}mL` };

/** Per 250 mL for milk, per 100 g for everything else. */
export function basisFor(category: string): Basis {
  return category === 'milk' ? PER_250ML : PER_100G;
}

/**
 * A product's nutrition on its own basis (see `basisFor`): per 250 mL for
 * milk, per 100 g for everything else. Everything the site shows or grades
 * uses this.
 */
export function nutritionOf(c: CollectionEntry<'cereals'>): Nutrition {
  return c.data.category === 'milk' ? per250ml(c.data.nutrition) : per100g(c.data.nutrition);
}

// FDA Daily Values for adults and children 4+, based on a 2,000-calorie diet
// (21 CFR 101.9(c), the values on every US label since the 2016 update):
// https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels
// Calories, trans fat, total sugars and the poly/mono fats have no Daily
// Value, so a real label leaves their %DV blank. The site gives total sugars a
// percent anyway, from DAY_REFERENCES below.
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

// "% of a day" for every percent the site shows. It uses the FDA Daily Values
// plus two references the FDA doesn't set:
// - Total sugars use 50 g, the added-sugar Daily Value. Sugar counts the same
//   whether it was added or came from fruit, so the site always grades total
//   sugars, and every sugar percent on the site is total sugars against 50 g.
//   Added sugars get no percent.
// - Calories use 2,000 kcal, the day every %DV on a label is based on. The
//   replica Nutrition Facts panel leaves calories without one, like a real label.
// Protein is not here: use `proteinDVOf` in score.ts.
export const DAY_REFERENCES = { ...DAILY_VALUES, totalSugars: 50, calories: 2000 } as const;

export type DayKey = keyof typeof DAY_REFERENCES;

/** An amount as a percent of a day's reference amount (see DAY_REFERENCES). */
export function percentOfDay(key: DayKey, value: number | null | undefined): number | null {
  return value == null ? null : (value / DAY_REFERENCES[key]) * 100;
}
