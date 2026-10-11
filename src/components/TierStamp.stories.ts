import TierStamp from './TierStamp.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';
import { scoreCereal } from '../lib/score';

const top = scoreCereal(examples.topRated);

export default {
  title: 'Cereal detail/TierStamp',
  component: TierStamp,
  decorators: [frame('padding: 16px')],
  parameters: {
    docs: {
      description: {
        component:
          'The Tier as a round seal, in the Verdict panel on each cereal page. The letter comes from `tierFor()` in src/lib/score.ts, and its colour from `tierColor()`: S is turquoise, A and B green, C amber, D and F red, unrated grey.',
      },
    },
  },
};

export const TopRated = {
  args: { tier: top.tier, overall: top.overall },
  parameters: {
    docs: { description: { story: `The top-rated cereal's real tier: ${top.tier}, ${top.overall} out of 100.` } },
  },
};

// The rest use fixed numbers so each colour band has a story.
export const TierB = { args: { tier: 'B', overall: 56 } };
export const TierC = { args: { tier: 'C', overall: 52 } };
export const TierF = { args: { tier: 'F', overall: 40 } };

export const Unrated = {
  args: { tier: null, overall: null },
  parameters: {
    docs: { description: { story: 'A cereal with no taste score has no Tier.' } },
  },
};
