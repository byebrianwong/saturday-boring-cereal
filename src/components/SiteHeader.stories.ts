import SiteHeader from './SiteHeader.astro';
import { catalog } from '../../.storybook/fixtures';
import { phone } from '../../.storybook/helpers';

export default {
  title: 'Site chrome/SiteHeader',
  component: SiteHeader,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The top of every page: a scrolling ticker, the three-colour wordmark, and the nav as a row of ad buttons. `Layout.astro` renders it and passes the real box count from the catalog.',
      },
    },
  },
};

export const Home = {
  args: { count: catalog.length, path: '/' },
};

export const OnTheRankingsPage = {
  args: { count: catalog.length, path: '/top/' },
  parameters: {
    docs: { description: { story: 'The current page\'s button stays pressed in, with an outline.' } },
  },
};

export const Phone = {
  ...phone,
  args: { count: catalog.length, path: '/cereals/' },
  parameters: {
    ...phone.parameters,
    docs: {
      description: {
        story: 'Below 640px the tagline goes and the nav becomes one row that scrolls sideways.',
      },
    },
  },
};
