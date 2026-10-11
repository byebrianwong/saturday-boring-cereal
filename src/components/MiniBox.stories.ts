import MiniBox from './MiniBox.astro';
import { examples } from '../../.storybook/fixtures';

const props = (c: typeof examples.typical) => ({
  emoji: c.data.emoji,
  brand: c.data.brand,
  name: c.data.name,
  boxColor: c.data.boxColor,
  boxImage: c.data.boxImage,
  href: `/cereals/${c.id}/`,
});

export default {
  title: 'Cards/MiniBox',
  component: MiniBox,
  parameters: {
    docs: {
      description: {
        component:
          'A small box face, used in the grid on each tag page (/tags/granola/ and so on) with a PriceTag underneath. It shows the box photo when there is one, and otherwise the emoji, brand and name on the box colour.',
      },
    },
  },
};

export const WithPhoto = {
  args: props(examples.typical),
};

export const EmojiPlaceholder = {
  args: props(examples.noPhoto),
};

export const NotALink = {
  args: { ...props(examples.typical), href: undefined },
  parameters: {
    docs: {
      description: { story: 'Without `href` it renders as a plain div and does not press in on hover.' },
    },
  },
};
