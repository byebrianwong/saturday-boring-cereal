import PriceTag from './PriceTag.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';
import { macroLine } from '../lib/macros';

export default {
  title: 'Cards/PriceTag',
  component: PriceTag,
  // On the tag pages it sits under a MiniBox, at the box's width.
  decorators: [frame('width: 118px')],
  parameters: {
    docs: {
      description: {
        component:
          'The tag under each MiniBox: the taste score in red, then one plain line of macros per 100 g from `macroLine()` in src/lib/macros.ts. The macro line is the one thing on the card that never exaggerates. It has no top border because it sits flush under the MiniBox.',
      },
    },
  },
};

export const Rated = {
  args: { rating: examples.typical.data.rating, macros: macroLine(examples.typical) },
};

export const Unrated = {
  args: { rating: examples.unrated.data.rating, macros: macroLine(examples.unrated) },
};

export const NoMacros = {
  args: { rating: 7, macros: '' },
  parameters: {
    docs: {
      description: {
        story:
          '`macroLine()` returns an empty string when the label lists none of protein, sugar or fiber. No cereal in the catalog hits this today.',
      },
    },
  },
};
