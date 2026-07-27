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

// The /admin section (search a product, pick it, write the cereal file) is the
// browser version of `npm run find`, and it needs the same two things Keystatic
// does: server routes, and a writable content directory. Neither exists in a
// static build on a static host, so it follows the same rule — dev only.
//
// Its pages live in src/admin/ rather than src/pages/, so `astro build` can't
// pick them up even by accident; they only become routes when this integration
// injects them. `dist/` stays purely static.
const enableAdmin =
  process.env.npm_lifecycle_event === 'dev' || process.env.ADMIN === '1';

/** @type {import('astro').AstroIntegration} */
const adminRoutes = {
  name: 'sbc-admin',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      const routes = [
        ['/admin', './src/admin/index.astro'],
        ['/admin/api/login', './src/admin/api/login.ts'],
        ['/admin/api/search', './src/admin/api/search.ts'],
        ['/admin/api/create', './src/admin/api/create.ts'],
        ['/admin/api/list', './src/admin/api/list.ts'],
        ['/admin/api/load', './src/admin/api/load.ts'],
        ['/admin/api/update', './src/admin/api/update.ts'],
      ];
      for (const [pattern, entrypoint] of routes) {
        injectRoute({ pattern, entrypoint, prerender: false });
      }
    },
  },
};

// GitHub Pages serves this project repo under /saturday-boring-cereal/. The
// deploy workflow sets PAGES=true; a root host (Vercel/Netlify) builds without
// it and serves at "/". Internal links go through src/lib/url.ts `u()`, which
// reads BASE_URL, so both work unchanged.
const onPages = process.env.PAGES === 'true';

// `site` drives canonical + OpenGraph + RSS absolute URLs. Pick the real domain
// for whichever host is building: GitHub Pages, Vercel (which exposes its stable
// production domain via VERCEL_PROJECT_PRODUCTION_URL), else a local placeholder.
const site = onPages
  ? 'https://byebrianwong.github.io'
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://saturdayboringcereal.example';

// https://astro.build/config
export default defineConfig({
  site,
  base: onPages ? '/saturday-boring-cereal' : undefined,
  output: 'static',
  integrations: [
    react(),
    markdoc(),
    ...(enableKeystatic ? [keystatic()] : []),
    ...(enableAdmin ? [adminRoutes] : []),
  ],
});
