import GradeStamp from './GradeStamp.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';
import { scoreCereal } from '../lib/score';

const top = scoreCereal(examples.topRated);

export default {
  title: 'Cereal detail/GradeStamp',
  component: GradeStamp,
  decorators: [frame('padding: 16px')],
  parameters: {
    docs: {
      description: {
        component:
          'The Overall grade as a seal. `lg` is the stamp in the Verdict panel on each cereal page; `sm` is the chip on /top/. The letter comes from `gradeFor()` in src/lib/score.ts, and its colour from `gradeColorTier()`: S is turquoise, A and B green, C amber, D and F red, unrated grey.',
      },
    },
  },
};

export const TopRated = {
  args: { grade: top.grade, overall: top.overall, size: 'lg' },
  parameters: {
    docs: { description: { story: `The top-rated cereal's real grade: ${top.grade}, ${top.overall} out of 100.` } },
  },
};

// The rest use fixed numbers so each colour band has a story.
export const GradeB = { args: { grade: 'B', overall: 63, size: 'lg' } };
export const GradeC = { args: { grade: 'C', overall: 58, size: 'lg' } };
export const GradeF = { args: { grade: 'F', overall: 30, size: 'lg' } };

export const Unrated = {
  args: { grade: null, overall: null, size: 'lg' },
  parameters: {
    docs: { description: { story: 'A cereal with no taste score has no Overall grade.' } },
  },
};

export const Small = { args: { grade: top.grade, overall: top.overall, size: 'sm' } };
export const SmallUnrated = { args: { grade: null, overall: null, size: 'sm' } };
