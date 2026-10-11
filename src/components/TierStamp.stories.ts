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
          'The Tier as a seal. `lg` is the stamp in the Verdict panel on each cereal page; `sm` is the chip on /top/. The letter comes from `tierFor()` in src/lib/score.ts, and its colour from `tierColor()`: S is turquoise, A and B green, C amber, D and F red, unrated grey.',
      },
    },
  },
};

export const TopRated = {
  args: { tier: top.tier, overall: top.overall, size: 'lg' },
  parameters: {
    docs: { description: { story: `The top-rated cereal's real tier: ${top.tier}, ${top.overall} out of 100.` } },
  },
};

// The rest use fixed numbers so each colour band has a story.
export const TierB = { args: { tier: 'B', overall: 56, size: 'lg' } };
export const TierC = { args: { tier: 'C', overall: 52, size: 'lg' } };
export const TierF = { args: { tier: 'F', overall: 40, size: 'lg' } };

export const Unrated = {
  args: { tier: null, overall: null, size: 'lg' },
  parameters: {
    docs: { description: { story: 'A cereal with no taste score has no Tier.' } },
  },
};

export const Small = { args: { tier: top.tier, overall: top.overall, size: 'sm' } };
export const SmallUnrated = { args: { tier: null, overall: null, size: 'sm' } };
