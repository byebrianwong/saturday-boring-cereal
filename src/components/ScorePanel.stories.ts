import ScorePanel from './ScorePanel.astro';
import { examples } from '../../.storybook/fixtures';
import { frame, phone } from '../../.storybook/helpers';

export default {
  title: 'Cereal detail/ScorePanel',
  component: ScorePanel,
  // Roughly the width of its column on a cereal page.
  decorators: [frame('max-width: 460px')],
  parameters: {
    docs: {
      description: {
        component:
          '"The Verdict" on each cereal page: the Overall grade stamp and one bar per subscore. All of it comes from `scoreCereal()` in src/lib/score.ts, which grades per 100 g: Overall is 40% taste and 60% nutrition (protein, sugar, fiber, saturated fat). The method is written up on /about.',
      },
    },
  },
};

export const TopRated = { args: { cereal: examples.topRated } };

export const LowScore = { args: { cereal: examples.lowScore } };

export const Unrated = {
  args: { cereal: examples.unrated },
  parameters: {
    docs: {
      description: {
        story: 'No taste score: the Taste bar is empty, reads "unrated", and there is no Overall grade. The nutrition bars still show.',
      },
    },
  },
};

export const Phone = {
  ...phone,
  args: { cereal: examples.topRated },
  decorators: [],
};
