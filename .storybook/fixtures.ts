// Story data comes from the real catalog, not hand-written mocks.
//
// Components take a `CollectionEntry<'cereals'>`, which Astro normally builds
// with `getCollection()`. That function does not run inside Storybook, so this
// file reads the same markdown files and builds the same shape. When a cereal
// file changes, its stories change with it.
//
// Two things differ from Astro's real loader:
// - The frontmatter is not validated against the Zod schema in
//   src/content.config.ts. Only the schema's defaults are applied (below).
// - The review body is not rendered. No component in src/components uses it.
import { parse } from 'yaml';
import type { CollectionEntry } from 'astro:content';

type Cereal = CollectionEntry<'cereals'>;

const files = import.meta.glob('../src/content/cereals/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function toEntry(path: string, raw: string): Cereal {
  const id = path.split('/').pop()!.replace(/\.md$/, '');
  const [, frontmatter = '', body = ''] = raw.split(/^---$/m);
  const fm = parse(frontmatter);

  return {
    id,
    collection: 'cereals',
    body: body.trim(),
    data: {
      // The schema's defaults, so a fixture looks like what getCollection returns.
      rating: null,
      emoji: '🥣',
      boxColor: '#c98d4e',
      formFactors: [],
      proteinSources: [],
      attributes: [],
      ...fm,
      dateReviewed: new Date(fm.dateReviewed),
      dateUpdated: fm.dateUpdated ? new Date(fm.dateUpdated) : undefined,
    },
  } as Cereal;
}

/** Every cereal in src/content/cereals, sorted by file name. */
export const catalog: Cereal[] = Object.entries(files)
  .map(([path, raw]) => toEntry(path, raw))
  .sort((a, b) => a.id.localeCompare(b.id));

/** One cereal by its file name (slug). Throws if the file was renamed or removed. */
export function cereal(slug: string): Cereal {
  const found = catalog.find((c) => c.id === slug);
  if (!found) {
    throw new Error(
      `No cereal "${slug}" in src/content/cereals. A story fixture points at a file that was renamed or removed.`,
    );
  }
  return found;
}

// Named examples. Each one is picked because it shows a case a component has
// to handle. If the catalog changes so one no longer shows that case, pick a
// different slug here.
export const examples = {
  /** Highest taste score on the shelf (9), photo, tasting note, full label. */
  topRated: cereal('grandy-organics-peanut-butter-dark-chocolate-granola'),
  /** A typical entry: photo, full label, no tasting note. */
  typical: cereal('natures-path-heritage-flakes'),
  /** No box photo anywhere (`noAutoImage: true`), so the emoji placeholder shows. */
  noPhoto: cereal('magic-spoon-peanut-butter'),
  /** No box photo, but it has a tasting note. */
  noPhotoWithNote: cereal('cheerios-strawberry-protein'),
  /** No taste score (`rating: null`). Must read "unrated", never a made-up number. */
  unrated: cereal('grandy-organics-classic-granola'),
  /** Lowest taste score (3), so the grade and bars land in the "bad" colours. */
  lowScore: cereal('special-k-zero-cinnamon'),
  /** Calories and other label fields missing. Must read "not listed". */
  missingFields: cereal('trader-joes-homestyle-cherry-pistachio-pecan-granola'),
};

/** The catalog newest review first. Same order as the Receipts page and the home page's recent reviews. */
export const newestFirst: Cereal[] = [...catalog].sort(
  (a, b) => b.data.dateReviewed.getTime() - a.data.dateReviewed.getTime(),
);
