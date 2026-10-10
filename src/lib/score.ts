import type { CollectionEntry } from 'astro:content';
import { per100gOf } from './nutrition';
import { grams } from './format';

// The Overall Grade: one composite number so a box can be read at a glance,
// backed by transparent subscores. Everything here is derived at build time —
// nothing is stored in frontmatter — so retuning a target below re-scores the
// whole shelf at once. The methodology is posted on /about §6.

// --- Tunable targets, per 100 g. Grading per 100 g instead of per serving
// means a box can't score better by stating a bigger serving. Most servings on
// the shelf are about 50 g, so these are the old per-serving targets
// (15 g / 15 g / 8 g) doubled, with fiber rounded to 15. ---
const PROTEIN_TARGET = 30; // g of protein per 100 g that earns a full protein subscore
const SUGAR_CEILING = 30; // g of sugar per 100 g that drops the sugar subscore to zero
const FIBER_TARGET = 15; // g of fiber per 100 g that earns a full fiber subscore

// Overall = half Taste, half Nutrition. The Nutrition half is the mean of
// whichever of protein/sugar/fiber the label actually lists.
const TASTE_WEIGHT = 0.5;

export type SubKey = 'taste' | 'protein' | 'sugar' | 'fiber';

export interface Subscore {
  key: SubKey;
  label: string;
  /** 0–100 "goodness"; null when the label doesn't list the input. */
  score: number | null;
  /** Raw value shown beside the bar, e.g. "14g" (per 100 g) or "8.5/10". */
  detail: string;
}

export interface Score {
  /** 0–100 composite; null when the cereal is unrated (no Taste score). */
  overall: number | null;
  /** Letter grade for `overall`; null when unrated. */
  grade: string | null;
  /** 0–100 nutrition-only mean; survives even when Taste is missing. */
  nutrition: number | null;
  /** Always taste, protein, sugar, fiber — in that order. */
  subscores: Subscore[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Higher raw value → higher score (protein, fiber). */
function up(value: number | null | undefined, target: number): number | null {
  return value == null ? null : clamp01(value / target) * 100;
}

/** Lower raw value → higher score (sugar). */
function down(value: number | null | undefined, ceiling: number): number | null {
  return value == null ? null : clamp01(1 - value / ceiling) * 100;
}

function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function scoreCereal(c: CollectionEntry<'cereals'>): Score {
  const { rating } = c.data;
  const n = per100gOf(c);

  const taste = rating == null ? null : rating * 10;
  const protein = up(n.protein, PROTEIN_TARGET);
  // Prefer added sugars; fall back to total when the label omits added.
  const sugarGrams = n.addedSugars ?? n.totalSugars;
  const sugar = down(sugarGrams, SUGAR_CEILING);
  const fiber = up(n.dietaryFiber, FIBER_TARGET);

  const subscores: Subscore[] = [
    {
      key: 'taste',
      label: 'Taste',
      score: taste,
      detail: rating == null ? 'unrated' : `${rating.toFixed(1)}/10`,
    },
    {
      key: 'protein',
      label: 'Protein',
      score: protein,
      detail: grams(n.protein),
    },
    {
      key: 'sugar',
      label: 'Sugar',
      score: sugar,
      detail:
        sugarGrams == null
          ? 'not listed'
          : `${grams(sugarGrams)} ${n.addedSugars == null ? 'total' : 'added'}`,
    },
    {
      key: 'fiber',
      label: 'Fiber',
      score: fiber,
      detail: grams(n.dietaryFiber),
    },
  ];

  const nutrition = mean(
    [protein, sugar, fiber].filter((v): v is number => v != null),
  );

  // Unrated cereals stay unrated overall — the site never invents a Taste score.
  let overall: number | null = null;
  if (taste != null && nutrition != null) {
    overall = TASTE_WEIGHT * taste + (1 - TASTE_WEIGHT) * nutrition;
  } else if (taste != null) {
    overall = taste;
  }
  // Round once so the letter grade and the displayed x.x/10 are derived from the
  // same number and can never straddle a band boundary (e.g. a 54.6 that shows
  // "5.5" but grades D).
  if (overall != null) overall = Math.round(overall);

  return {
    overall,
    grade: overall == null ? null : gradeFor(overall),
    nutrition,
    subscores,
  };
}

// Tier-list bands (S is the top, above A) on the 0–100 overall. Deliberately
// hard at the top: S is the blue ribbon for the single best box on the shelf, so
// its cutoff sits at the current top score (77) and above the runner-up (76).
// One box earns it, and A holds the rest of the top shelf. Retune here.
const BANDS: Array<[number, string]> = [
  [77, 'S'],
  [75, 'A'],
  [65, 'B'],
  [55, 'C'],
  [45, 'D'],
  [0, 'F'],
];

export function gradeFor(overall: number): string {
  for (const [min, g] of BANDS) if (overall >= min) return g;
  return 'F';
}

/** Good→bad tier for coloring a subscore bar by its raw 0–100 value. */
export function scoreTier(score: number): 'good' | 'mid' | 'bad' {
  if (score >= 75) return 'good';
  if (score >= 55) return 'mid';
  return 'bad';
}

// UK front-of-pack traffic-light thresholds, per 100 g of food: at or below
// `low` is green, above `high` is red, in between is amber. Used only to tint
// table cells for nutrients the grade does not score. Sodium is derived from
// the salt thresholds (0.3 g and 1.5 g salt; sodium is 40% of salt).
const TRAFFIC_LIGHTS = {
  totalFat: { low: 3, high: 17.5 },
  saturatedFat: { low: 1.5, high: 5 },
  sodium: { low: 120, high: 600 },
} as const;

export type MacroTintKey =
  | 'protein'
  | 'dietaryFiber'
  | 'totalSugars'
  | 'addedSugars'
  | keyof typeof TRAFFIC_LIGHTS;

/**
 * Good / mid / bad tier for one nutrient, per 100 g. Protein, fiber and both
 * sugars use the same targets as the grade, so a cell's tint agrees with the
 * Health score. Fat, saturated fat and sodium use the traffic lights above.
 * Returns null when the label omits the value.
 */
export function macroTier(
  key: MacroTintKey,
  value: number | null | undefined,
): 'good' | 'mid' | 'bad' | null {
  if (value == null) return null;
  switch (key) {
    case 'protein':
      return scoreTier(up(value, PROTEIN_TARGET)!);
    case 'dietaryFiber':
      return scoreTier(up(value, FIBER_TARGET)!);
    case 'totalSugars':
    case 'addedSugars':
      return scoreTier(down(value, SUGAR_CEILING)!);
    default: {
      const t = TRAFFIC_LIGHTS[key];
      return value <= t.low ? 'good' : value > t.high ? 'bad' : 'mid';
    }
  }
}

/**
 * Colour tier for a letter grade's stamp. S gets its own "blue ribbon" look;
 * the rest ramp green→amber→red so the seal's colour matches its letter.
 */
export function gradeColorTier(grade: string): 'elite' | 'good' | 'mid' | 'bad' {
  switch (grade) {
    case 'S':
      return 'elite';
    case 'A':
    case 'B':
      return 'good';
    case 'C':
      return 'mid';
    default:
      return 'bad'; // D, F
  }
}

/** Overall shown on the site-wide 0–10 scale (Taste's scale), one decimal. */
export function overallOutOfTen(overall: number): string {
  return (overall / 10).toFixed(1);
}
