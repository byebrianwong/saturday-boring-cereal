import NutritionPanel from './NutritionPanel.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';

export default {
  title: 'Cereal detail/NutritionPanel',
  component: NutritionPanel,
  decorators: [frame('max-width: 380px')],
  parameters: {
    docs: {
      description: {
        component:
          'A US-style Nutrition Facts label. Cereal files store nutrition per serving, exactly as the box prints it. This panel scales it to 100 g by default, so boxes with different serving sizes can be compared. A value the label does not list shows as "not listed", never as a guess.',
      },
    },
  },
};

export const Per100g = {
  args: { nutrition: examples.typical.data.nutrition },
};

export const PerServing = {
  args: { nutrition: examples.typical.data.nutrition, basis: 'serving' },
  parameters: {
    docs: {
      description: {
        story:
          'The stored numbers before scaling. On a cereal page this sits next to the photo of the box\'s label, so the two can be checked line by line.',
      },
    },
  },
};

export const MissingValues = {
  args: { nutrition: examples.missingFields.data.nutrition },
  parameters: {
    docs: {
      description: {
        story: 'This cereal\'s file leaves out several values, including calories, sodium and total carbohydrate, so those rows read "not listed".',
      },
    },
  },
};
