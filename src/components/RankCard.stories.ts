import RankCard from './RankCard.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';

export default {
  title: 'Cards/RankCard',
  component: RankCard,
  // The rank chip and the score sticker hang outside the card.
  decorators: [frame('padding: 34px')],
  parameters: {
    docs: {
      description: {
        component:
          'One cereal in the home page rankings, below the ChampCard. Ranks 2 and 3 use `big`; the rows after use `sm`. Most of the card\'s look (`.cd`, `.box`, `.macros`, `.score`) is in src/styles/global.css because ChampCard shares it.',
      },
    },
  },
};

export const Big = {
  args: { cereal: examples.typical, rank: 2, size: 'big' },
};

export const Small = {
  args: { cereal: examples.typical, rank: 4, size: 'sm' },
};

export const Unrated = {
  args: { cereal: examples.unrated, rank: 9, size: 'sm' },
  parameters: {
    docs: {
      description: { story: 'No taste score: the sticker turns grey and reads "Unrated". No number is made up.' },
    },
  },
};

export const NoPhoto = {
  args: { cereal: examples.noPhotoWithNote, rank: 5, size: 'sm' },
  parameters: {
    docs: {
      description: {
        story:
          'Some products have no clean, straight-on box photo anywhere, so they keep the emoji placeholder on purpose. See "Box images" in the README.',
      },
    },
  },
};
