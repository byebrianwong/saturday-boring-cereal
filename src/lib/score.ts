import type { CollectionEntry } from 'astro:content';

// The Overall Grade: one composite number so a box can be read at a glance,
// backed by transparent subscores. Everything here is derived at build time —
// nothing is stored in frontmatter — so retuning a target below re-scores the
// whole shelf at once. The methodology is posted on /about §6.

// --- Tunable targets (per stated serving, matching how the rest of the site
// reports nutrition). ---
// Protein is scored on % Daily Value, because the label's %DV is adjusted for
// protein quality. 35% DV earns full marks.
const PROTEIN_DV_TARGET = 35;
// Most labels print protein in grams only. For those, assume 1.25% DV per gram
// (10g → 12.5% DV). Real labels range from 1% to 2% DV per gram, depending on
// protein quality.
const PROTEIN_DV_PER_GRAM_ESTIMATE = 1.25;
const SUGAR_CEILING = 20; // g of total sugar that drops the sugar subscore to zero
const FIBER_TARGET = 12; // g of fiber that earns a full fiber subscore
const SAT_FAT_CEILING = 8; // g of saturated fat that drops its subscore to zero

// Overall = 40% Taste, 60% Nutrition.
const TASTE_WEIGHT = 0.4;

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
  /** Raw value shown beside the bar, e.g. "14g" or "8.5/10". */
  detail: string;
}

export interface Score {
  /** 0–100 composite; null when the cereal is unrated (no Taste score). */
  overall: number | null;
  /** Letter grade for `overall`; null when unrated. */
  grade: string | null;
  /** 0–100 nutrition-only mean; survives even when Taste is missing. */
  nutrition: number | null;
  /** Always taste, protein, sugar, fiber, saturated fat — in that order. */
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

/** Weighted mean of the [score, weight] pairs whose score is listed. */
function weightedMean(pairs: Array<[number | null, number]>): number | null {
  const listed = pairs.filter((p): p is [number, number] => p[0] != null);
  const totalWeight = listed.reduce((a, [, w]) => a + w, 0);
  if (!totalWeight) return null;
  return listed.reduce((a, [v, w]) => a + v * w, 0) / totalWeight;
}

export function scoreCereal(c: CollectionEntry<'cereals'>): Score {
  const { rating, nutrition: n } = c.data;

  const taste = rating == null ? null : rating * 10;
  // Use the label's protein %DV when printed; otherwise estimate it from grams.
  const proteinDVEstimated = n.proteinDV == null;
  const proteinDV =
    n.proteinDV ?? (n.protein == null ? null : n.protein * PROTEIN_DV_PER_GRAM_ESTIMATE);
  const protein = up(proteinDV, PROTEIN_DV_TARGET);
  const sugar = down(n.totalSugars, SUGAR_CEILING);
  const fiber = up(n.dietaryFiber, FIBER_TARGET);
  const satFat = down(n.saturatedFat, SAT_FAT_CEILING);

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
            ? `${n.protein}g · ~${+proteinDV.toFixed(1)}% DV est.`
            : `${n.protein ?? '?'}g · ${proteinDV}% DV`,
    },
    {
      key: 'sugar',
      label: 'Sugar',
      score: sugar,
      detail: n.totalSugars == null ? 'not listed' : `${n.totalSugars}g`,
    },
    {
      key: 'fiber',
      label: 'Fiber',
      score: fiber,
      detail: n.dietaryFiber == null ? 'not listed' : `${n.dietaryFiber}g`,
    },
    {
      key: 'satFat',
      label: 'Sat. fat',
      score: satFat,
      detail: n.saturatedFat == null ? 'not listed' : `${n.saturatedFat}g`,
    },
  ];

  const nutrition = weightedMean([
    [protein, NUTRITION_WEIGHTS.protein],
    [sugar, NUTRITION_WEIGHTS.sugar],
    [fiber, NUTRITION_WEIGHTS.fiber],
    [satFat, NUTRITION_WEIGHTS.satFat],
  ]);

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
// its cutoff sits at the current top score (64) and above the runner-up (63).
// Retune here when the targets above change.
const BANDS: Array<[number, string]> = [
  [64, 'S'],
  [62, 'A'],
  [60, 'B'],
  [57, 'C'],
  [50, 'D'],
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
