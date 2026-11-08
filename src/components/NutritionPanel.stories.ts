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
          'A US-style Nutrition Facts label. Cereal files store nutrition per serving, exactly as the box prints it. This panel scales it to 100 g by default, so boxes with different serving sizes can be compared. Milk is scaled to 250 mL instead. A main nutrient the label does not list shows as "not listed", never as a guess. An indented one the label leaves out, such as trans fat, is left off the panel. Sodium sits last so the macros read as one block.',
      },
    },
  },
};

export const Per100g = {
  args: { nutrition: examples.typical.data.nutrition },
};

export const Per250ml = {
  args: { nutrition: examples.milk.data.nutrition, basis: '250ml' },
  parameters: {
    docs: {
      description: {
        story:
          'How a milk page shows its numbers: per 250 mL, about what goes on a bowl of cereal, scaled from the carton\'s 1 cup (240 mL) serving. 100 g of milk is less than half a glass.',
      },
    },
  },
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
        story: 'This cereal\'s file leaves out several values, including calories, sodium and total carbohydrate, so those rows read "not listed". Indented rows it leaves out are dropped.',
      },
    },
  },
};

export const GramsInServingDescription = {
  args: { nutrition: examples.gramsInServing.data.nutrition, basis: 'serving' },
  parameters: {
    docs: {
      description: {
        story:
          'This box\'s serving description already gives the grams ("0.5 cup (40 g)"), so the panel shows it as stored and does not add the grams a second time.',
      },
    },
  },
};
