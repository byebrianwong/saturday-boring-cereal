import AisleFilters from './AisleFilters.astro';

export default {
  title: 'Site chrome/AisleFilters',
  component: AisleFilters,
  parameters: {
    docs: {
      description: {
        component:
          'The row of filter buttons, one per "aisle". Each category (cereal, bars, snacks) has its own row; the lists come from `AISLE_FILTERS` in src/lib/taxonomy.ts.',
      },
    },
  },
};

export const Links = {
  args: { mode: 'links' },
  parameters: {
    docs: { description: { story: '`links` mode: each button is a link into the explorer at /cereals/#f=<key>. No page uses this mode today.' } },
  },
};

export const Buttons = {
  args: { mode: 'buttons', active: 'granola' },
  parameters: {
    docs: {
      description: {
        story:
          '`buttons` mode, used on /cereals/. The filtering itself is a script on that page, so clicking here does nothing. `active` marks the pressed button.',
      },
    },
  },
};

export const Bars = {
  args: { mode: 'buttons', category: 'bar' },
  parameters: {
    docs: {
      description: {
        story:
          'The bars row. On /cereals/ a button only shows when some bar in stock carries that tag (the `only` prop), so this full list appears only once every kind is stocked.',
      },
    },
  },
};

export const Everything = {
  args: { mode: 'buttons', category: 'all' },
  parameters: {
    docs: {
      description: {
        story:
          'The short row shown when the Everything category is picked. Form factors belong to one category, so only the shared attributes are left.',
      },
    },
  },
};
