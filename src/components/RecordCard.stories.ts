import RecordCard from './RecordCard.astro';
import { catalog, cereal, examples } from '../../.storybook/fixtures';
import { frame, phone } from '../../.storybook/helpers';

export default {
  title: 'Cards/RecordCard',
  component: RecordCard,
  // The label sticker hangs above the card's top edge.
  decorators: [frame('padding: 30px 20px 20px')],
  parameters: {
    docs: {
      description: {
        component:
          'One card in the home page\'s "But wait, there\'s more — and less" row. It names the cereal that holds a shelf record (most protein, least sugar, most fiber) and shows its box, with the amount in 100 g as a share of a day (the same percent as the cards above it). With `stack` it fans out three boxes behind a count instead, for "Boxes on the record". The winners are picked by `shelfRecords()` in src/lib/records.ts.',
      },
    },
  },
};

export const Record = {
  args: {
    label: 'Most protein',
    value: '82%',
    note: 'of a day, per 100g',
    cereal: cereal('special-k-zero-cinnamon'),
  },
};

export const WithCaveat = {
  args: {
    label: 'Least sugar',
    value: '8%',
    note: 'of a day, per 100g',
    caveat: 'No sugar substitutes',
    cereal: cereal('ikea-hjalteroll-muesli-cocoa-berries'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'The least-sugar record leaves out boxes with a sugar substitute in their ingredients (the `sweeteners` field), and the caveat line says so.',
      },
    },
  },
};

export const BoxCount = {
  args: {
    label: 'Boxes on the record',
    value: String(catalog.length),
    note: 'tasted and weighed',
    stack: catalog.slice(0, 3),
    href: '/cereals/',
  },
};

export const NoPhoto = {
  args: { label: 'Most protein', value: '72%', note: 'of a day, per 100g', cereal: examples.noPhoto },
  parameters: {
    docs: {
      description: { story: 'Without a box photo the card shows the emoji on the box colour.' },
    },
  },
};

export const Phone = {
  ...phone,
  args: WithCaveat.args,
};
