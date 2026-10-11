import type { CollectionEntry } from 'astro:content';
import { gramsShort } from './format';
import { per100gOf } from './nutrition';
import { macroTier, proteinDVOf } from './score';

export interface CardMacro {
  /** "12g" per 100 g. */
  value: string;
  label: string;
  /** Same good/mid/bad cut-offs as the Tier score. */
  tier: 'good' | 'mid' | 'bad';
  /** The tier in words, for screen readers and the hover title. */
  verdict: 'Good' | 'Middling' | 'Poor';
}

const VERDICT = { good: 'Good', mid: 'Middling', bad: 'Poor' } as const;

/**
 * Protein, fiber and sugar per 100 g for the home page cards, each with a
 * good/mid/bad tier so the card can tint it. Values the label leaves out are
 * dropped rather than shown as zero.
 */
export function cardMacros(c: CollectionEntry<'cereals'>): CardMacro[] {
  const n = per100gOf(c);
  const rows = [
    // Protein is judged by its %DV, the same number the Tier score uses.
    { raw: n.protein, tier: macroTier('protein', proteinDVOf(n).dv), label: 'Protein /100g' },
    { raw: n.dietaryFiber, tier: macroTier('dietaryFiber', n.dietaryFiber), label: 'Fiber /100g' },
    { raw: n.totalSugars, tier: macroTier('totalSugars', n.totalSugars), label: 'Sugar /100g' },
  ];
  return rows
    .filter((r) => r.raw != null && r.tier != null)
    .map((r) => ({
      value: gramsShort(r.raw)!,
      label: r.label,
      tier: r.tier!,
      verdict: VERDICT[r.tier!],
    }));
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
