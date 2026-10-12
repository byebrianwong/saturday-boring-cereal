import type { CollectionEntry } from 'astro:content';
import { per100gOf } from './nutrition';

type Cereal = CollectionEntry<'cereals'>;

export interface ShelfRecord {
  cereal: Cereal;
  /** The winning amount, per 100 g. */
  value: number;
}

type Key = 'protein' | 'dietaryFiber' | 'totalSugars';

// The box with the highest (or lowest) value per 100 g. Boxes whose label
// leaves the value out are skipped. On a tie the first box in `cereals` wins.
function best(cereals: Cereal[], key: Key, pick: 'max' | 'min'): ShelfRecord | null {
  let out: ShelfRecord | null = null;
  for (const cereal of cereals) {
    const value = per100gOf(cereal)[key];
    if (value == null) continue;
    if (!out || (pick === 'max' ? value > out.value : value < out.value)) out = { cereal, value };
  }
  return out;
}

/**
 * The home page's shelf records. Least sugar skips any box with a sugar
 * substitute in its ingredients, because those reach zero sugar by swapping
 * in a sweetener rather than by being less sweet.
 */
export function shelfRecords(cereals: Cereal[]) {
  return {
    mostProtein: best(cereals, 'protein', 'max'),
    leastSugar: best(cereals.filter((c) => c.data.sweeteners.length === 0), 'totalSugars', 'min'),
    mostFiber: best(cereals, 'dietaryFiber', 'max'),
  };
}
