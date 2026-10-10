import type { CollectionEntry } from 'astro:content';
import { gramsShort } from './format';
import { per100gOf } from './nutrition';

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
