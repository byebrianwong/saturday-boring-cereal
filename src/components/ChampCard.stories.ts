import ChampCard from './ChampCard.astro';
import { examples } from '../../.storybook/fixtures';
import { frame, phone } from '../../.storybook/helpers';

export default {
  title: 'Cards/ChampCard',
  component: ChampCard,
  // The banner and the score sticker hang outside the card.
  decorators: [frame('padding: 40px 40px 20px')],
  parameters: {
    docs: {
      description: {
        component:
          'The "grand prize" card for the number one cereal on the home page. The card is loud; the tasting note and the macros inside it stay small and plain. Macros are per 100 g, and a macro the label does not list is left out rather than shown as zero.',
      },
    },
  },
};

export const TopRated = {
  args: { cereal: examples.topRated },
};

export const NoPhotoNoNote = {
  args: { cereal: examples.noPhoto },
  parameters: {
    docs: {
      description: {
        story:
          'If the winner had no box photo, the card shows its emoji on its box colour with "No image on file". With no tasting note it says so instead of inventing one.',
      },
    },
  },
};

export const Phone = {
  ...phone,
  args: { cereal: examples.topRated },
  decorators: [frame('padding: 30px 14px 20px')],
};
