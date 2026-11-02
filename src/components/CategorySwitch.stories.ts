import CategorySwitch from './CategorySwitch.astro';
import { catalog } from '../../.storybook/fixtures';

// The real counts. The catalog has no snacks yet, so that count is an example
// number, not products on file.
const count = (category: string) => catalog.filter((c) => c.data.category === category).length;
const [cereal, bar, milk] = [count('cereal'), count('bar'), count('milk')];

export default {
  title: 'Site chrome/CategorySwitch',
  component: CategorySwitch,
  parameters: {
    docs: {
      description: {
        component:
          'The row above the Aisle filters that picks cereal, bars, milk, snacks or everything. Each product is ranked only within its own category. /cereals/ shows this row only once something other than cereal is in stock, and leaves out any category with nothing in it.',
      },
    },
  },
};

export const AllStocked = {
  args: { counts: { cereal, bar, milk, snack: 4 }, active: 'cereal' },
  parameters: {
    docs: { description: { story: 'Every category stocked, cereal picked. The snack count is an example.' } },
  },
};

export const BarsPicked = {
  args: { counts: { cereal, bar, milk, snack: 0 }, active: 'bar' },
  parameters: {
    docs: { description: { story: 'No snacks in stock, so there is no Snacks tab. Bars picked.' } },
  },
};
