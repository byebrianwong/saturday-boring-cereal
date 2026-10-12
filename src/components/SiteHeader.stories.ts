import SiteHeader from './SiteHeader.astro';
import { phone } from '../../.storybook/helpers';

export default {
  title: 'Site chrome/SiteHeader',
  component: SiteHeader,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The top of every page: a scrolling ticker, the three-colour wordmark, and the nav as a row of ad buttons. `Layout.astro` renders it on every page.',
      },
    },
  },
};

export const Home = {
  args: { path: '/' },
};

export const OnThePriceCheckPage = {
  args: { path: '/compare/' },
  parameters: {
    docs: { description: { story: 'The current page\'s button stays pressed in, with an outline.' } },
  },
};

export const Phone = {
  ...phone,
  args: { path: '/cereals/' },
  parameters: {
    ...phone.parameters,
    docs: {
      description: {
        story: 'Below 640px the nav becomes one row that scrolls sideways.',
      },
    },
  },
};
