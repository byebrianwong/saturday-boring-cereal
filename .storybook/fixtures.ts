// Story data is a frozen copy of 14 catalog entries, so a Chromatic snapshot
// changes only when the UI changes. Adding, editing or rating a real product
// must never change a story, so stories do not read src/content or public/.
//
// Components take a `CollectionEntry<'cereals'>`, which Astro normally builds
// with `getCollection()`. That function does not run inside Storybook, so this
// file reads the markdown files in fixture-data/cereals and builds the same
// shape. Those files, and the images in fixture-data/public, were copied from
// the catalog on 2026-11-02 and are not kept in step with it. Change them only
// to test a new case or to follow a change to the schema.
//
// Two things differ from Astro's real loader:
// - The frontmatter is not validated against the Zod schema in
//   src/content.config.ts. Only the schema's defaults are applied (below).
// - The review body is not rendered. No component in src/components uses it.
import { parse } from 'yaml';
import type { CollectionEntry } from 'astro:content';

type Cereal = CollectionEntry<'cereals'>;

const files = import.meta.glob('./fixture-data/cereals/*.md', {
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
      category: 'cereal',
      rating: null,
      emoji: '🥣',
      boxColor: '#c98d4e',
      formFactors: [],
      proteinSources: [],
      attributes: [],
      sweeteners: [],
      ...fm,
      dateReviewed: new Date(fm.dateReviewed),
      dateUpdated: fm.dateUpdated ? new Date(fm.dateUpdated) : undefined,
    },
  } as Cereal;
}

const fixtures: Cereal[] = Object.entries(files).map(([path, raw]) => toEntry(path, raw));

/** One cereal by its file name (slug). Throws if the fixture file is missing. */
export function cereal(slug: string): Cereal {
  const found = fixtures.find((c) => c.id === slug);
  if (!found) {
    throw new Error(`No cereal "${slug}" in .storybook/fixture-data/cereals. Copy the file there to use it in a story.`);
  }
  return found;
}

/**
 * A copy of a cereal with its box photo removed. Every fixture has a photo, so
 * the placeholder examples are made by taking one away.
 */
function withoutPhoto(c: Cereal): Cereal {
  const { boxImage, imageSource, imageCredit, ...data } = c.data;
  return { ...c, data: { ...data, noAutoImage: true } } as Cereal;
}

// Named examples. Each one is picked because it shows a case a component has
// to handle.
export const examples = {
  /** Highest taste score among the fixtures (9), photo, tasting note, full label. */
  topRated: cereal('grandy-organics-peanut-butter-dark-chocolate-granola'),
  /** A typical entry: photo, full label, no tasting note. */
  typical: cereal('natures-path-heritage-flakes'),
  /** No box photo (removed by withoutPhoto), so the emoji placeholder shows. */
  noPhoto: withoutPhoto(cereal('magic-spoon-peanut-butter')),
  /** No box photo (removed by withoutPhoto), but it has a tasting note. */
  noPhotoWithNote: withoutPhoto(cereal('cheerios-strawberry-protein')),
  /** No taste score (`rating: null`). Must read "unrated", never a made-up number. */
  unrated: cereal('grandy-organics-classic-granola'),
  /** Lowest taste score (3), so the tier and bars land in the "bad" colours. */
  lowScore: cereal('special-k-zero-cinnamon'),
  /** Calories and other label fields missing. Must read "not listed". */
  missingFields: cereal('trader-joes-homestyle-cherry-pistachio-pecan-granola'),
  /** The serving description already gives the grams ("0.5 cup (40 g)"). */
  gramsInServing: cereal('seven-sundays-good-day-granola-peanut-butter-chocolate-banana'),
  /** A bar with a wrapper photo and no taste score yet. */
  bar: cereal('quest-cookies-and-cream-protein-bar'),
  /** A milk: a Health score, no Taste score, no Tier and no photo. */
  milk: cereal('typical-fat-free-milk'),
};
