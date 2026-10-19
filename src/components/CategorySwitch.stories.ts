import CategorySwitch from './CategorySwitch.astro';
import { catalog } from '../../.storybook/fixtures';

// The real count of cereals. The catalog has no bars or snacks yet, so the
// other counts in these stories are example numbers, not products on file.
const cereal = catalog.filter((c) => c.data.category === 'cereal').length;

export default {
  title: 'Site chrome/CategorySwitch',
  component: CategorySwitch,
  parameters: {
    docs: {
      description: {
        component:
          'The row above the Aisle filters that picks cereal, bars, snacks or everything. Each product is ranked only within its own category. /cereals/ shows this row only once something other than cereal is in stock, and leaves out any category with nothing in it.',
      },
    },
  },
};

export const AllThree = {
  args: { counts: { cereal, bar: 6, snack: 4 }, active: 'cereal' },
  parameters: {
    docs: { description: { story: 'Cereal, bars and snacks all stocked, cereal picked. The bar and snack counts are examples.' } },
  },
};

export const BarsPicked = {
  args: { counts: { cereal, bar: 6, snack: 0 }, active: 'bar' },
  parameters: {
    docs: { description: { story: 'No snacks in stock, so there is no Snacks tab. Bars picked. The bar count is an example.' } },
  },
};
