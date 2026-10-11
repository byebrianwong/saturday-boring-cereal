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
  // Box photos and label photos live in public/, same as the site.
  staticDirs: ['../public'],
};

export default config;
