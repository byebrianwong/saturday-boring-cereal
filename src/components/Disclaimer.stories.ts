import Disclaimer from './Disclaimer.astro';
import { catalog, newestFirst } from '../../.storybook/fixtures';
import { shortDate } from '../lib/format';

export default {
  title: 'Sections/Disclaimer',
  component: Disclaimer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Reviews written as advert small print. `legaleseFor()` in src/lib/legalese.ts turns each cereal into a sentence built only from its real fields; a missing score or note is stated as missing. This is where the joke lands: the page shouts, the small print stays flat and factual.',
      },
    },
  },
};

export const HomePage = {
  args: { cereals: newestFirst.slice(0, 6) },
  parameters: {
    docs: { description: { story: 'The six newest reviews, as on the home page.' } },
  },
};

export const ReceiptsPage = {
  args: {
    cereals: newestFirst,
    title: 'Full record',
    sub: `${catalog.length} boxes · Latest reviewed ${shortDate(newestFirst[0].data.dateReviewed)}`,
    showCta: false,
  },
  parameters: {
    docs: { description: { story: 'Every review, as on /reviews/. The button to the receipts page is hidden there.' } },
  },
};
