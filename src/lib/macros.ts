import type { CollectionEntry } from 'astro:content';
import { gramsShort } from './format';
import { per100gOf, percentOfDay, type Nutrition } from './nutrition';
import { macroTier, proteinDVOf, type Tint } from './score';

export interface CardMacro {
  /** Share of a day per 100 g, e.g. "24%", or "~24%" for estimated protein. */
  value: string;
  label: string;
  /** Same tint as the /cereals/ table (see `macroTier`). */
  tier: Tint;
  /** The tier in words, for screen readers and the hover title. */
  verdict: 'Good' | 'Middling' | 'Poor' | 'Watch out';
}

const VERDICT = { good: 'Good', mid: 'Middling', bad: 'Poor', worst: 'Watch out' } as const;

export type ShareKey = 'protein' | 'dietaryFiber' | 'totalSugars';

/**
 * A nutrient as a share of a day, from per-100 g nutrition: "24%". Protein is
 * its %DV, marked "~" when estimated from grams; sugar is total sugars against
 * 50 g (see DAY_REFERENCES). Null when the label leaves the nutrient out.
 */
export function dayShare(n: Nutrition, key: ShareKey): string | null {
  const { dv, estimated } =
    key === 'protein' ? proteinDVOf(n) : { dv: percentOfDay(key, n[key]), estimated: false };
  return dv == null ? null : `${estimated ? '~' : ''}${Math.round(dv)}%`;
}

/**
 * Protein, fiber and sugar per 100 g for the home page cards, as a share of a
 * day, each with a tint so the card can colour it. Values the label leaves out
 * are dropped rather than shown as zero.
 */
export function cardMacros(c: CollectionEntry<'cereals'>): CardMacro[] {
  const n = per100gOf(c);
  const rows = [
    // Protein is judged by its %DV, the same number the Tier score uses.
    { key: 'protein', tier: macroTier('protein', proteinDVOf(n).dv), label: 'Protein' },
    { key: 'dietaryFiber', tier: macroTier('dietaryFiber', n.dietaryFiber), label: 'Fiber' },
    { key: 'totalSugars', tier: macroTier('totalSugars', n.totalSugars), label: 'Sugar' },
  ] as const;
  return rows.flatMap((r) => {
    const value = dayShare(n, r.key);
    return value == null || r.tier == null
      ? []
      : [{ value, label: r.label, tier: r.tier, verdict: VERDICT[r.tier] }];
  });
}

/** "PRO 9.3g · SUG 0g /100g" price-tag line, hiding values the label doesn't list. */
export function macroLine(c: CollectionEntry<'cereals'>): string {
  const n = per100gOf(c);
  const parts: string[] = [];
  const pro = gramsShort(n.protein);
  const sug = gramsShort(n.totalSugars);
  const fib = gramsShort(n.dietaryFiber);
  if (pro) parts.push(`PRO ${pro}`);
  if (sug) parts.push(`SUG ${sug}`);
  else if (fib) parts.push(`FIB ${fib}`);
  return parts.length ? `${parts.join(' · ')} /100g` : '';
}

export function byRatingDesc(a: CollectionEntry<'cereals'>, b: CollectionEntry<'cereals'>): number {
  return (b.data.rating ?? -1) - (a.data.rating ?? -1);
}
