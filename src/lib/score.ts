import type { CollectionEntry } from 'astro:content';

// The Overall Grade: one composite number so a box can be read at a glance,
// backed by transparent subscores. Everything here is derived at build time —
// nothing is stored in frontmatter — so retuning a target below re-scores the
// whole shelf at once. The methodology is posted on /about §6.

// --- Tunable targets (per stated serving, matching how the rest of the site
// reports nutrition). "Full marks" points, chosen from the real shelf spread. ---
const PROTEIN_TARGET = 15; // g of protein that earns a full protein subscore
const SUGAR_CEILING = 15; // g of sugar that drops the sugar subscore to zero
const FIBER_TARGET = 8; // g of fiber that earns a full fiber subscore

// Overall = half Taste, half Nutrition. The Nutrition half is the mean of
// whichever of protein/sugar/fiber the label actually lists.
const TASTE_WEIGHT = 0.5;

export type SubKey = 'taste' | 'protein' | 'sugar' | 'fiber';

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
  const { rating, nutrition: n } = c.data;

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
      detail: n.protein == null ? 'not listed' : `${n.protein}g`,
    },
    {
      key: 'sugar',
      label: 'Sugar',
      score: sugar,
      detail:
        sugarGrams == null
          ? 'not listed'
          : `${sugarGrams}g ${n.addedSugars == null ? 'total' : 'added'}`,
    },
    {
      key: 'fiber',
      label: 'Fiber',
      score: fiber,
      detail: n.dietaryFiber == null ? 'not listed' : `${n.dietaryFiber}g`,
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

  return {
    overall,
    grade: overall == null ? null : gradeFor(overall),
    nutrition,
    subscores,
  };
}

// Grade bands on the 0–100 overall. Deliberately hard at the top — in keeping
// with store policy, nothing gets an easy A.
const BANDS: Array<[number, string]> = [
  [85, 'A'],
  [80, 'A-'],
  [75, 'B+'],
  [70, 'B'],
  [65, 'B-'],
  [60, 'C+'],
  [55, 'C'],
  [50, 'C-'],
  [40, 'D'],
  [0, 'F'],
];

export function gradeFor(overall: number): string {
  for (const [min, g] of BANDS) if (overall >= min) return g;
  return 'F';
}

/** Good→bad tier for coloring a stamp or a bar. */
export function scoreTier(score: number): 'good' | 'mid' | 'bad' {
  if (score >= 75) return 'good';
  if (score >= 55) return 'mid';
  return 'bad';
}

/** Overall shown on the site-wide 0–10 scale (Taste's scale), one decimal. */
export function overallOutOfTen(overall: number): string {
  return (overall / 10).toFixed(1);
}
