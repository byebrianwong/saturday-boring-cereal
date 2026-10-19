import IngredientsPanel from './IngredientsPanel.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';

export default {
  title: 'Cereal detail/IngredientsPanel',
  component: IngredientsPanel,
  decorators: [frame('max-width: 380px')],
  parameters: {
    docs: {
      description: {
        component:
          'The ingredient list, printed the way a box prints it, under the Nutrition Facts panel. The text is copied from the source named in the small print and is not reworded. When no list has been found, the panel says so rather than guessing.',
      },
    },
  },
};

export const Listed = {
  args: {
    ingredients: examples.typical.data.ingredients,
    source: examples.typical.data.ingredientsSource,
  },
};

export const NotListed = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'No ingredient list on file yet. The panel reads "not listed" and shows no source line.',
      },
    },
  },
};
