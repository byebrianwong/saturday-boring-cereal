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

// GitHub Pages serves this project repo under /saturday-boring-cereal/. The
// deploy workflow sets PAGES=true; a root host (Vercel/Netlify) builds without
// it and serves at "/". Internal links go through src/lib/url.ts `u()`, which
// reads BASE_URL, so both work unchanged.
const onPages = process.env.PAGES === 'true';

// https://astro.build/config
export default defineConfig({
  site: onPages ? 'https://byebrianwong.github.io' : 'https://saturdayboringcereal.example',
  base: onPages ? '/saturday-boring-cereal' : undefined,
  output: 'static',
  integrations: [react(), markdoc(), ...(enableKeystatic ? [keystatic()] : [])],
});
