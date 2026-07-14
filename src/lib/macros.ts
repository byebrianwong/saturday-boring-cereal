import type { CollectionEntry } from 'astro:content';
import { gramsShort } from './format';

/** "PRO 4g · SUG 5g · 28g" price-tag line, hiding values the label doesn't list. */
export function macroLine(c: CollectionEntry<'cereals'>): string {
  const n = c.data.nutrition;
  const parts: string[] = [];
  const pro = gramsShort(n.protein);
  const sug = gramsShort(n.totalSugars);
  const fib = gramsShort(n.dietaryFiber);
  if (pro) parts.push(`PRO ${pro}`);
  if (sug) parts.push(`SUG ${sug}`);
  else if (fib) parts.push(`FIB ${fib}`);
  parts.push(`${n.servingSize}g`);
  return parts.join(' · ');
}

export function byRatingDesc(a: CollectionEntry<'cereals'>, b: CollectionEntry<'cereals'>): number {
  return (b.data.rating ?? -1) - (a.data.rating ?? -1);
}
