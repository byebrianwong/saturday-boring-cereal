import BreakfastStrip from './BreakfastStrip.astro';

export default {
  title: 'Sections/BreakfastStrip',
  component: BreakfastStrip,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The "part of a complete breakfast" strip on the home page: bowl + cereal + milk + spoon, a nod to the line old cereal adverts ran under a picture of the meal. It takes no props.',
      },
    },
  },
};

export const Default = {};
