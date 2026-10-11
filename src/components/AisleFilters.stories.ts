import AisleFilters from './AisleFilters.astro';

export default {
  title: 'Site chrome/AisleFilters',
  component: AisleFilters,
  parameters: {
    docs: {
      description: {
        component:
          'The row of filter buttons, one per "aisle". The list of aisles comes from `AISLE_FILTERS` in src/lib/taxonomy.ts.',
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
