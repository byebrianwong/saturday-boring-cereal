import CategorySwitch from './CategorySwitch.astro';

// Example counts, written out so that adding a product changes no snapshot.
const counts = { cereal: 33, bar: 7, milk: 3 };

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
  args: { counts: { ...counts, snack: 4 }, active: 'cereal' },
  parameters: {
    docs: { description: { story: 'Every category stocked, cereal picked.' } },
  },
};

export const BarsPicked = {
  args: { counts: { ...counts, snack: 0 }, active: 'bar' },
  parameters: {
    docs: { description: { story: 'No snacks in stock, so there is no Snacks tab. Bars picked.' } },
  },
};
