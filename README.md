# Saturday Boring Cereal 🥣

One man's rankings of granolas and healthier cereals, styled as a grocery aisle.
Astro static site + Keystatic admin, no database, no server.

**Live:** https://byebrianwong.github.io/saturday-boring-cereal/

## Run it

```bash
npm install
npm run dev        # site at http://localhost:4321, admin at /keystatic
npm run build      # static output in dist/ (admin excluded — see below)
npm run preview    # serve the built site
```

## Deploy

Pushing to `main` auto-deploys to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). GitHub Pages serves this
project repo under `/saturday-boring-cereal/`, so the workflow builds with `PAGES=true`,
which sets Astro's `base`. Internal links go through [`src/lib/url.ts`](src/lib/url.ts)
`u()` (reads `import.meta.env.BASE_URL`), so the same code deploys to a **root** host
(Vercel/Netlify/Cloudflare) unchanged — just build without `PAGES` and set `site` to the
real domain in [astro.config.mjs](astro.config.mjs).

## Where the data came from

The 25 cereals in [src/content/cereals/](src/content/cereals/) were migrated directly from
Brian's Notion "Cereal" database via the Notion MCP — no CSV export. The migration script
[scripts/migrate-notion.mjs](scripts/migrate-notion.mjs) holds the raw Notion rows and the
transformation (brand/name split, `Text` → formFactors parse, typo cleanup, attribute
computation from the numbers). Re-run with `node scripts/migrate-notion.mjs` — it rewrites
the markdown files from that embedded data, so make lasting bulk changes there and one-off
edits in Keystatic.

## Adding / editing cereals

Two ways, same files:

1. **Admin UI** — run `npm run dev`, open [http://localhost:4321/keystatic](http://localhost:4321/keystatic).
   Full CRUD with pickers for form factors, protein sources, attributes, and every
   nutrition field. Saves write straight to `src/content/cereals/*.md`.
2. **By hand** — edit the markdown files in [src/content/cereals/](src/content/cereals/).
   Frontmatter schema lives in [src/content.config.ts](src/content.config.ts) (Zod) and is
   mirrored in [keystatic.config.ts](keystatic.config.ts).

Rules encoded in the schema:

- `rating` is the historical Notion 0–10 Taste scale, decimals allowed.
- Nutrition fields are nullable on purpose. Leave a value blank when the box doesn't
  list it — the UI renders “not listed” instead of inventing numbers (protein %DV
  especially: FDA only requires it when a protein claim is made).
- `emoji` + `boxColor` are placeholder box art until real photos exist. When photos
  arrive, add `boxImage`, `imageSource`, and `imageCredit` (already in the schema) and
  swap the art block in `MiniBox.astro`.

## Why Keystatic only runs in dev

The `/keystatic` admin needs server routes, which a static build can't ship without an
adapter. `astro.config.mjs` enables the integration during `astro dev` (or with
`KEYSTATIC=1`) and drops it from `astro build`, so `dist/` stays purely static and
deploys anywhere (Cloudflare Pages / Netlify / Vercel).

## Layout

```
src/
  content/cereals/     one .md per cereal (frontmatter + review body)
  content.config.ts    content collection schema (Zod) + taxonomy enums
  components/          MiniBox (3D box), PriceTag, Receipt, NutritionPanel, AisleFilters
  layouts/Layout.astro store sign header + footer
  pages/
    index.astro        landing: 3D hero box, aisle signs, top-shelf ranks, receipt
    cereals/index.astro the explorer (client-side filter + sort, deep-linkable #f=granola)
    cereals/[slug].astro detail: big box, Nutrition Facts panel, tasting note
    reviews.astro      all reviews as one long receipt
    about.astro        methodology, written as store policy
  lib/                 taxonomy labels + formatting helpers
```

## Nutrition completeness

Migrated entries carry exactly what Brian recorded in Notion: serving size, taste rating
(nullable — Grandy Organics has none), total/saturated fat, sugars, fiber, protein, and his
tasting notes. Everything he didn't record — calories, added sugars, trans/poly/mono fat,
protein %DV — renders as **"not listed"** rather than a guess.

Backfilling those is a **reviewable** job, run by [scripts/enrich.mjs](scripts/enrich.mjs):

```bash
node scripts/enrich.mjs            # fetch candidates -> enrichment/<slug>.json + REVIEW.md
# open enrichment/REVIEW.md, verify each match via its OFF link,
# set "approved": true in the slug's JSON for the good ones, then:
node scripts/enrich.mjs --apply    # writes ONLY approved drafts, filling null fields only
FDC_API_KEY=xxxx node scripts/enrich.mjs   # also query USDA FoodData Central (free key)
```

It pulls from Open Food Facts (free, no key) and — with `FDC_API_KEY` — USDA, then scores
each match by comparing the source's protein/sugar/fiber against Brian's recorded numbers.
Sanity guards drop implausible values (OFF sometimes stores per-container, not per-serving,
data). Everything defaults to `approved: false`; nothing is written until you confirm,
and `--apply` only fills blank fields — your verified numbers are never overwritten. Applied
entries gain a `barcode`, `imageSource: open_food_facts`, and a CC-BY-SA `imageCredit` line.
Why not "approve in Keystatic" directly? Keeping drafts out of the content model avoids
polluting it; once applied, the values show up in Keystatic for any further editing.

Caveats seen in practice: OFF search is non-deterministic (matches vary run to run) and
mis-matches plenty (a "KIND Dark Chocolate Clusters" search hit a dipped-cluster snack) —
which is exactly why the confirm step exists. Box images from OFF are CC-BY-SA: the applied
`imageCredit` attributes contributors and links back to the product page.

### What's already enriched

**12 of 25** cereals have been enriched and verified — calories / added sugars / sodium
back-filled from Open Food Facts (USDA cross-checked with a personal key), plus **12 real
box photos** downloaded into `public/images/cereals/` and rendered on the shelf and detail
pages with CC-BY-SA credit. Every applied value passed a macro cross-check against Brian's
recorded numbers and a product-name-overlap gate; two exact-product matches that just missed
the auto threshold were promoted by hand after inspection.

The other 13 stayed on emoji art + "not listed" because the source matched the wrong product
(granola *bars* for Kodiak/KIND, peanut *butter* spread for a Trader Joe's search, wrong
flavor variants) or had no usable data. Those are honest gaps, not guesses. Guards in
`enrich.mjs` dropped bad per-container values before they landed (e.g. a 1400 kcal / 60g
added-sugar Trader Joe's OFF record).

To fill more later: re-run `FDC_API_KEY=… node scripts/enrich.mjs --auto-approve`, verify
new matches in `enrichment/REVIEW.md`, and `--apply`. Free USDA key:
https://fdc.nal.usda.gov/api-key-signup

## Still to do (from the build plan)

- Enrich the remaining 13 (need better source matches — often the exact SKU isn't in OFF/USDA).

Phase-2 items from the plan are now built: comparison view (`/compare`) and `/tags/[tag]`
landing pages (one per form factor / attribute / protein source).
