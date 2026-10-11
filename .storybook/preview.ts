import type { AstroRenderer, ProjectAnnotations } from '@storybook-astro/framework';
// The site's design tokens and shared classes. Layout.astro imports this on
// every page; stories render components without Layout, so load it here.
import '../src/styles/global.css';

const preview: ProjectAnnotations<AstroRenderer> = {
  // A Docs page for every component, built from its description and props.
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    backgrounds: {
      options: {
        cream: { name: 'Cream (page)', value: '#fff8ea' },
        white: { name: 'White', value: '#ffffff' },
        ink: { name: 'Ink (footer)', value: '#1b1206' },
      },
    },
    viewport: {
      options: {
        phone: { name: 'Phone (375)', styles: { width: '375px', height: '812px' } },
        tablet: { name: 'Tablet (768)', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop (1280)', styles: { width: '1280px', height: '900px' } },
      },
    },
    options: {
      storySort: {
        order: ['Start here', 'Foundations', 'Site chrome', 'Cards', 'Cereal detail', 'Sections', '*'],
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'cream' },
  },
};

export default preview;
