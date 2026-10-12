import type { CollectionEntry } from 'astro:content';
import { per100gOf, percentDV, type DVKey, type Nutrition } from './nutrition';
import { grams } from './format';

/** "5.4g · 19% DV", or plain grams when the label omits the value. */
function gramsWithDV(key: DVKey, value: number | null | undefined): string {
  const dv = percentDV(key, value);
  return dv == null ? grams(value) : `${grams(value)} · ${Math.round(dv)}% DV`;
}

// The Tier: one composite number so a box can be read at a glance,
// backed by transparent subscores. Everything here is derived at build time —
// nothing is stored in frontmatter — so retuning a target below re-scores the
// whole shelf at once. The methodology is posted on /about §6.

// --- Tunable targets, per 100 g. Grading per 100 g instead of per serving
// means a box can't score better by stating a bigger serving. ---
// Protein is scored on % Daily Value, because the label's %DV is adjusted for
// protein quality. 35% DV per 100 g earns full marks.
const PROTEIN_DV_TARGET = 35;
// Most labels print protein in grams only. For those, assume 1.25% DV per gram
// (10g → 12.5% DV). Real labels range from 1% to 2% DV per gram, depending on
// protein quality.
const PROTEIN_DV_PER_GRAM_ESTIMATE = 1.25;
const SUGAR_CEILING = 20; // g of total sugar per 100 g that drops the sugar subscore to zero
const FIBER_TARGET = 12; // g of fiber per 100 g that earns a full fiber subscore
const SAT_FAT_CEILING = 8; // g of saturated fat per 100 g that drops its subscore to zero

// Outlier penalty for sugar and saturated fat. A subscore can't go below zero,
// so without this a box at 3x the ceiling scores the same as one just over it.
// Past the ceiling, the Nutrition score loses OUTLIER_PENALTY × (excess)² points,
// where excess is how far over the ceiling the box is, as a fraction of it.
// Squaring keeps a small overshoot nearly free and makes a big one expensive:
// 10% over costs 0.6 points, 25% over costs 3.8, 50% over costs 15, and double
// the ceiling costs 60. Nutrition is half of Overall, so Overall loses half that.
const OUTLIER_PENALTY = 60;

// Overall = 50% Taste, 50% Nutrition.
export const TASTE_WEIGHT = 0.5;

// Taste is curved before it is mixed in: the 0–10 rating is squared, so it
// keeps full value at the top and loses more the lower it goes. 9 → 81 points,
// 7 → 49, 5 → 25, 3 → 9. A 3 is a bad cereal, and squaring keeps it out of the
// top tiers: even with perfect nutrition it reaches only 55 overall, below the
// A cutoff. Raise the exponent to punish low taste harder; 1 makes it linear.
const TASTE_CURVE = 2;

// How much each nutrient counts toward the Nutrition share, in priority order:
// protein first, then low sugar, then fiber, then low saturated fat. When a label
// leaves a nutrient out, the remaining weights are scaled up to fill its share.
const NUTRITION_WEIGHTS = { protein: 0.4, sugar: 0.3, fiber: 0.2, satFat: 0.1 };

export type SubKey = 'taste' | 'protein' | 'sugar' | 'fiber' | 'satFat';

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
  /** Tier letter (S, A–D, F) for `overall`; null when unrated. */
  tier: string | null;
  /**
   * 0–100 nutrition-only score: the weighted mean of the nutrient subscores,
   * minus any outlier penalty. Survives even when Taste is missing.
   */
  nutrition: number | null;
  /**
   * Always taste, then the good nutrients (protein, fiber), then the bad ones
   * (sugar, saturated fat), in that order.
   */
  subscores: Subscore[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Higher raw value → higher score (protein, fiber). */
function up(value: number | null | undefined, target: number): number | null {
  return value == null ? null : clamp01(value / target) * 100;
}

/** Lower raw value → higher score (sugar, saturated fat). */
function down(value: number | null | undefined, ceiling: number): number | null {
  return value == null ? null : clamp01(1 - value / ceiling) * 100;
}

/** How far past the ceiling a value is, as a fraction of it: 12 over 8 → 0.5. */
function excessOver(value: number | null | undefined, ceiling: number): number {
  return value == null ? 0 : Math.max(0, value / ceiling - 1);
}

/** Nutrition points lost for being `excess` past a ceiling (see OUTLIER_PENALTY). */
function outlierPenalty(excess: number): number {
  return OUTLIER_PENALTY * excess ** 2;
}

/** Extra text for a sugar or saturated-fat bar that is past its ceiling. */
function overNote(excess: number): string {
  return excess > 0 ? ` · ${Math.round(excess * 100)}% over the limit` : '';
}

/** Weighted mean of the [score, weight] pairs whose score is listed. */
function weightedMean(pairs: Array<[number | null, number]>): number | null {
  const listed = pairs.filter((p): p is [number, number] => p[0] != null);
  const totalWeight = listed.reduce((a, [, w]) => a + w, 0);
  if (!totalWeight) return null;
  return listed.reduce((a, [v, w]) => a + v * w, 0) / totalWeight;
}

/**
 * Protein as % Daily Value: the label's own %DV when printed, otherwise an
 * estimate from grams. Pass per-100 g nutrition to get %DV per 100 g.
 */
export function proteinDVOf(n: Nutrition): { dv: number | null; estimated: boolean } {
  if (n.proteinDV != null) return { dv: n.proteinDV, estimated: false };
  return {
    dv: n.protein == null ? null : n.protein * PROTEIN_DV_PER_GRAM_ESTIMATE,
    estimated: true,
  };
}

export function scoreCereal(c: CollectionEntry<'cereals'>): Score {
  const { rating } = c.data;
  const n = per100gOf(c);

  const taste = rating == null ? null : rating * 10;
  const { dv: proteinDV, estimated: proteinDVEstimated } = proteinDVOf(n);
  const protein = up(proteinDV, PROTEIN_DV_TARGET);
  const sugar = down(n.totalSugars, SUGAR_CEILING);
  const fiber = up(n.dietaryFiber, FIBER_TARGET);
  const satFat = down(n.saturatedFat, SAT_FAT_CEILING);
  const sugarExcess = excessOver(n.totalSugars, SUGAR_CEILING);
  const satFatExcess = excessOver(n.saturatedFat, SAT_FAT_CEILING);

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
      detail:
        proteinDV == null
          ? 'not listed'
          : proteinDVEstimated
            ? `${grams(n.protein)} · ~${Math.round(proteinDV)}% DV est.`
            : `${grams(n.protein)} · ${Math.round(proteinDV)}% DV`,
    },
    {
      key: 'fiber',
      label: 'Fiber',
      score: fiber,
      detail: gramsWithDV('dietaryFiber', n.dietaryFiber),
    },
    {
      key: 'sugar',
      label: 'Sugar',
      score: sugar,
      detail: grams(n.totalSugars) + overNote(sugarExcess),
    },
    {
      key: 'satFat',
      label: 'Sat. fat',
      score: satFat,
      detail: gramsWithDV('saturatedFat', n.saturatedFat) + overNote(satFatExcess),
    },
  ];

  const mean = weightedMean([
    [protein, NUTRITION_WEIGHTS.protein],
    [sugar, NUTRITION_WEIGHTS.sugar],
    [fiber, NUTRITION_WEIGHTS.fiber],
    [satFat, NUTRITION_WEIGHTS.satFat],
  ]);
  const nutrition =
    mean == null
      ? null
      : Math.max(0, mean - outlierPenalty(sugarExcess) - outlierPenalty(satFatExcess));

  // Unrated cereals stay unrated overall — the site never invents a Taste score.
  let overall: number | null = null;
  // The Taste bar shows the plain rating; only the overall uses the curve.
  const curvedTaste = taste == null ? null : Math.pow(taste / 100, TASTE_CURVE) * 100;
  if (curvedTaste != null && nutrition != null) {
    overall = TASTE_WEIGHT * curvedTaste + (1 - TASTE_WEIGHT) * nutrition;
  } else if (curvedTaste != null) {
    overall = curvedTaste;
  }
  // Round once so the tier letter and the displayed x.x/10 are derived from the
  // same number and can never straddle a band boundary (e.g. a 49.6 that shows
  // "5.0" but lands in D).
  if (overall != null) overall = Math.round(overall);

  return {
    overall,
    tier: overall == null ? null : tierFor(overall),
    nutrition,
    subscores,
  };
}

// Tier-list bands (S is the top, above A) on the 0–100 overall. Deliberately
// hard at the top: S is the blue ribbon for the best box on the shelf, so its
// cutoff sits at the current top score (61, shared by IKEA Hjälteroll and
// Calbee Frugra) and above the runner-up (60). D is wide so a box that tastes
// fine but has one outlier nutrient (Cheerios Strawberry Protein, 38, with 60%
// over the sugar limit) lands in D, not F. F is for boxes below that.
// Retune here when the targets, the taste curve or the outlier penalty change.
const BANDS: Array<[number, string]> = [
  [61, 'S'],
  [58, 'A'],
  [54, 'B'],
  [50, 'C'],
  [38, 'D'],
  [0, 'F'],
];

export function tierFor(overall: number): string {
  for (const [min, t] of BANDS) if (overall >= min) return t;
  return 'F';
}

/** Good→bad tier for coloring a subscore bar by its raw 0–100 value. */
export function scoreTier(score: number): 'good' | 'mid' | 'bad' {
  if (score >= 75) return 'good';
  if (score >= 55) return 'mid';
  return 'bad';
}

export type MacroTintKey = 'protein' | 'dietaryFiber' | 'totalSugars' | 'saturatedFat';

/**
 * Good / mid / bad tier for one graded nutrient, per 100 g. Uses the same
 * targets as the Tier score, so a cell's tint agrees with the Health score; for
 * protein, pass the %DV from `proteinDVOf`, not grams. Returns null when the
 * label omits the value.
 */
export function macroTier(
  key: MacroTintKey,
  value: number | null | undefined,
): 'good' | 'mid' | 'bad' | null {
  if (value == null) return null;
  switch (key) {
    case 'protein':
      return scoreTier(up(value, PROTEIN_DV_TARGET)!);
    case 'dietaryFiber':
      return scoreTier(up(value, FIBER_TARGET)!);
    case 'totalSugars':
      return scoreTier(down(value, SUGAR_CEILING)!);
    case 'saturatedFat':
      return scoreTier(down(value, SAT_FAT_CEILING)!);
  }
}

/**
 * Colour for a tier stamp. S gets its own "blue ribbon" look; the rest ramp
 * green→amber→red so the seal's colour matches its letter.
 */
export function tierColor(tier: string): 'elite' | 'good' | 'mid' | 'bad' {
  switch (tier) {
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

/**
 * Sort by Tier score (taste and health combined), best first. Unrated cereals
 * go last; ties fall back to the plain taste rating.
 */
export function byOverallDesc(a: CollectionEntry<'cereals'>, b: CollectionEntry<'cereals'>): number {
  const diff = (scoreCereal(b).overall ?? -1) - (scoreCereal(a).overall ?? -1);
  return diff || (b.data.rating ?? -1) - (a.data.rating ?? -1);
}
