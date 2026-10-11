import SiteFooter from './SiteFooter.astro';

export default {
  title: 'Site chrome/SiteFooter',
  component: SiteFooter,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'The bottom of every page. Same links as the header, plus RSS.' } },
  },
};

export const Default = {};
