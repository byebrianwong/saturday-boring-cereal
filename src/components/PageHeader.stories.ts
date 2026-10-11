import PageHeader from './PageHeader.astro';
import { catalog } from '../../.storybook/fixtures';
import { phone } from '../../.storybook/helpers';

const granolaCount = catalog.filter((c) => c.data.formFactors.includes('granola')).length;

export default {
  title: 'Site chrome/PageHeader',
  component: PageHeader,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The loud band at the top of every inner page (everything except the home page). The kicker and title shout. The lede sits in a calm box underneath, because framing copy may be readable but must not shout. The last word of the title goes in `accent` so it can get the yellow outlined style.',
      },
    },
  },
};

// Copy taken from src/pages/top.astro.
export const Rankings = {
  args: {
    kicker: 'The official chart · Updated every Saturday',
    title: 'The ',
    accent: 'Rankings',
    lede: "Ranked by Taste, with each box's Overall grade stamped alongside.",
  },
};

// Copy taken from src/pages/about.astro.
export const LongLede = {
  args: {
    kicker: 'Terms and conditions apply',
    title: 'Store ',
    accent: 'Policy',
    lede: 'The methodology, posted by the register where nobody reads it. Every rule below is actually followed, which is the least advertising-like thing on this website.',
  },
};

export const Turquoise = {
  args: { ...Rankings.args, tone: 'turq' },
  parameters: {
    docs: {
      description: { story: 'For a page whose next section is already orange. No page uses it today.' },
    },
  },
};

// Built the way src/pages/tags/[tag].astro builds it.
export const TagPage = {
  args: {
    kicker: `Form factor · ${granolaCount} boxes on file`,
    title: '',
    accent: 'Granola',
    lede: 'Every granola box on record, ranked best first. Same figures as everywhere else on the site, taken off the side panel.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Tag pages pass an empty `title` and the tag name as `accent`, so the whole title gets the outlined style.',
      },
    },
  },
};

export const Phone = {
  ...phone,
  args: Rankings.args,
};
