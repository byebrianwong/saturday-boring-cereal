import WrapperShot from './WrapperShot.astro';
import { examples } from '../../.storybook/fixtures';
import { frame } from '../../.storybook/helpers';

// Most of these stories show the emoji placeholder, with an example emoji and
// colour. WithPhoto shows a real bar from the catalog.
const example = { emoji: '🌾', boxColor: '#e07a2e', alt: '' };

// The frames each size sits in on the site, so the strip has the room it has there.
const tileFrame = frame(
  'width: 216px; aspect-ratio: 3 / 4; display: flex; align-items: center; justify-content: center; background: var(--cream); border: 3px solid var(--ink);'
);

export default {
  title: 'Cards/WrapperShot',
  component: WrapperShot,
  parameters: {
    docs: {
      description: {
        component:
          "A bar's photo, or its emoji placeholder, as a flat 5:2 wrapper. Bars come in wrappers, so their photos are fitted to 5:2 (1000×400) instead of the tall box front. It sits inside the same box-shaped frames the cereals use (Aisle tiles, rank cards, tag-page boxes), so a bar's card is the same size as the cereal cards beside it.",
      },
    },
  },
};

export const WithPhoto = {
  args: { image: examples.bar.data.boxImage, emoji: examples.bar.data.emoji, boxColor: examples.bar.data.boxColor, alt: '' },
  decorators: [tileFrame],
  parameters: {
    docs: { description: { story: 'A real wrapper photo, as on an Aisle tile or a rank card.' } },
  },
};

export const InATile = {
  args: { ...example, note: 'No image on file' },
  decorators: [tileFrame],
  parameters: {
    docs: { description: { story: 'Medium, as on an Aisle tile or a rank card. The frame keeps the box shape so rows line up.' } },
  },
};

export const ProductPage = {
  args: { ...example, size: 'lg', note: 'Granola Bar' },
  decorators: [frame('width: 400px; padding: 56px 18px 34px;')],
  parameters: {
    docs: {
      description: {
        story: "Large, on the bar's own page, in place of the 3D box. The placeholder carries the product name, like the printing on a wrapper.",
      },
    },
  },
};

export const Small = {
  args: { ...example, size: 'sm' },
  decorators: [
    frame(
      'width: 118px; height: 158px; display: flex; align-items: center; justify-content: center; background: var(--cream); border: 3px solid var(--ink);'
    ),
  ],
  parameters: {
    docs: { description: { story: 'Small, as in the boxes on a tag page. The note is hidden at this size.' } },
  },
};

export const TableThumbnail = {
  args: { ...example, size: 'xs' },
  decorators: [
    frame(
      'width: 34px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--cream); border: 2px solid var(--ink); padding: 0 2px;'
    ),
  ],
  parameters: {
    docs: { description: { story: "Extra small, in the Aisle table's name column. No tilt or shadow at this size." } },
  },
};
