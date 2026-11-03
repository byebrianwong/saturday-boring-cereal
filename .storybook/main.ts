import type { StorybookConfig } from '@storybook-astro/framework';

const config: StorybookConfig = {
  stories: ['../src/docs/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@chromatic-com/storybook'],
  framework: {
    name: '@storybook-astro/framework',
    // 'static' renders every story to HTML at build time, so the built
    // Storybook is plain files that Chromatic can snapshot. It also means
    // changing a control in the built Storybook does not re-render the
    // component; that only works under `npm run storybook`.
    options: {
      renderMode: 'static',
      // The framework strips unsafe HTML from slots and decorators. Allow
      // inline styles on divs so the frame() decorator in helpers.ts works.
      sanitization: { sanitizeHtml: { allowedAttributes: { div: ['style'] } } },
    },
  },
  // Frozen copies of the fixtures' box and label photos, at the same paths the
  // site uses. Not ../public, so replacing a product's photo changes no story.
  staticDirs: ['./fixture-data/public'],
  // Vite copies public/ into the build by default, which would mix the real
  // photos in with the frozen ones at the same paths.
  viteFinal: (config) => ({ ...config, publicDir: false }),
};

export default config;
