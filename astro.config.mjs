// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';

// Keystatic's admin UI (/keystatic) needs server routes, which a static build
// can't ship without an adapter. It's only useful while editing anyway, so it
// runs in `astro dev` (or with KEYSTATIC=1) and stays out of `astro build`.
const enableKeystatic =
  process.env.npm_lifecycle_event === 'dev' || process.env.KEYSTATIC === '1';

// https://astro.build/config
export default defineConfig({
  site: 'https://saturdayboringcereal.example',
  output: 'static',
  integrations: [react(), markdoc(), ...(enableKeystatic ? [keystatic()] : [])],
});
