# Saturday Boring Cereal 🥣

One man's rankings of granolas and healthier cereals, styled as a grocery aisle.
Astro static site + Keystatic admin, no database, no server.

**Live:** https://saturday-boring-cereal.vercel.app
(also mirrored on GitHub Pages at https://byebrianwong.github.io/saturday-boring-cereal/)

## Run it

```bash
npm install
npm run dev        # site at http://localhost:4321; admin at /admin + /keystatic
npm run build      # static output in dist/ (admin excluded — see below)
npm run preview    # serve the built site
npm test           # guards the frontmatter editor against corrupting content
```

## Deploy

Pushing to `main` deploys to **both** hosts automatically:

- **Vercel** (primary) — via the Git integration, zero-config. Builds without `PAGES`, so
  it serves at the root (`/`). `astro.config` reads `VERCEL_PROJECT_PRODUCTION_URL` to set
  `site`, so canonical/OG/RSS URLs resolve to the real `.vercel.app` domain.
- **GitHub Pages** (mirror) — via [.github/workflows/deploy.yml](.github/workflows/deploy.yml),
  which builds with `PAGES=true`. Pages serves this project repo under
  `/saturday-boring-cereal/`, so that build sets Astro's `base`.

The same code targets both because every internal link/asset goes through
[`src/lib/url.ts`](src/lib/url.ts) `u()`, which reads `import.meta.env.BASE_URL` (`/` on
Vercel, `/saturday-boring-cereal/` on Pages).

## Where the data came from

The 25 cereals in [src/content/cereals/](src/content/cereals/) were migrated directly from
Brian's Notion "Cereal" database via the Notion MCP — no CSV export. The migration script
[scripts/migrate-notion.mjs](scripts/migrate-notion.mjs) holds the raw Notion rows and the
transformation (brand/name split, `Text` → formFactors parse, typo cleanup, attribute
computation from the numbers). Re-run with `node scripts/migrate-notion.mjs` — it rewrites
the markdown files from that embedded data, so make lasting bulk changes there and one-off
edits in Keystatic.

## Adding / editing cereals

**The short version:**

```bash
npm run find "magic spoon peanut butter"  # search by name, pick it, done
npm run add                          # type the label yourself (databases don't have it)
npm run rate <slug> 8.5              # change a taste score
npm run image <slug> <image-url>     # set the box photo
npm run enrich && npm run enrich:apply   # backfill nutrition across the catalog
```

Every command takes a partial slug, so `npm run rate "heritage flakes" 8.5` works;
ambiguous input lists the matches instead of guessing. Add `--dry-run` to any of
`find` / `rate` / `image` to see the change without writing it.

Five ways in, same files:

1. **Search by name** — [scripts/find.mjs](scripts/find.mjs), the fastest way in when the
   product exists in the databases:

   ```bash
   npm run find "magic spoon peanut butter"
   ```

   It searches Open Food Facts + USDA, shows what came back with each candidate's serving
   size and macros, and you pick the right one off the list. Then it fills in **the whole
   label** — serving size, calories, all the fats, carbs, fiber, sugars, added sugars,
   protein, sodium — pulls the box photo if the record has one, guesses the
   form-factor/attribute/protein-source tags from the name and ingredients, and asks you
   for the only two things it can't know: the taste score and the tasting note.

   **Why this one can fill in the macros when `npm run add` can't.** The batch enrichment
   path has to verify an unattended match, so it cross-checks the source's
   protein/sugar/fiber against numbers you already recorded — which is why `add` makes you
   type them first. Here *you* confirm the product by picking it out of the search
   results, so eyeballing the match is the safety gate and the macros are free to come
   down from the source. The per-container sanity guards still run, a record with no
   serving size is refused rather than guessed (the label is per-serving and meaningless
   without one), and `proteinDV` is still never invented.

   Useful flags: `--pick <n>` (skip the prompt — scriptable), `--rating` / `--note`,
   `--brand` / `--name` to override the brand/product split it guesses from the match,
   `--no-image`, `--no-usda`, `--no-infer` (don't guess tags), `--fit contain`,
   `--dry-run`.

   The guessed tags and the photo are the two things worth a glance afterwards — both are
   printed in the summary. Box photos come from Open Food Facts, which is crowdsourced, so
   see [Box images](#box-images): if it's angled, `npm run image <slug> <url>` replaces it.

2. **One-step add (auto-pulls nutrition)** — for a box in your hand that the databases
   don't have (small and store brands, mostly):

   ```bash
   npm run add          # interactive: asks brand, product, score, serving, macros
   ```

   It scaffolds `src/content/cereals/<slug>.md` from what you type, then **looks the
   product up on Open Food Facts + USDA in the same step** and fills in the blanks
   (calories, added sugars, sodium, sat/trans fat) — but only when the match is
   confident (its macros cross-check against the numbers you entered **and** the
   product name overlaps). Anything it isn't sure about is left for you to confirm
   instead of guessed. Your recorded numbers are never overwritten. Box art starts as
   the emoji placeholder; add a real photo with `npm run image` (below).

   Prefer flags over prompts (or to script it):

   ```bash
   npm run add -- --brand "Magic Spoon" --name "Peanut Butter" --rating 5 \
                  --serving 36 --protein 14 --sugars 0.1 --fiber 1 \
                  --form os --protein-src milk-protein --attrs high-protein,low-sugar
   ```

   Enter at least two of protein / sugar / fiber — that's what lets it verify a match is
   the right product. Useful flags: `--no-enrich` (just scaffold, skip the lookup),
   `--review` (look up but always hold for confirmation, never auto-apply),
   `--no-usda`, `--serving-desc`, `--note`, `--emoji`, `--color`. Set `FDC_API_KEY` for a
   personal USDA key ([free](https://fdc.nal.usda.gov/api-key-signup)).

3. **Change a rating** — [scripts/rate.mjs](scripts/rate.mjs):

   ```bash
   npm run rate natures-path-heritage-flakes 8.5
   npm run rate "heritage flakes" 8.5 --note "Better than I remembered."
   npm run rate magic-spoon --unrated        # clear the score entirely
   ```

   Validates the 0–10 scale, stamps `dateUpdated` (leaving `dateReviewed` as the
   original review date), and optionally replaces the tasting note.

4. **Set a box photo** — [scripts/image.mjs](scripts/image.mjs):

   ```bash
   npm run image natures-path-heritage-flakes https://…/front.png --source manufacturer
   npm run image kodiak ./downloads/box.png --fit contain
   npm run image magic-spoon --none          # no clean front exists anywhere
   ```

   Downloads (or reads a local file), trims the margins, flattens onto white, fits
   it to the 240×320 box-face ratio at 900px, writes
   `public/images/cereals/<slug>.jpg`, and sets `boxImage` / `imageSource` /
   `imageCredit`. See [Box images](#box-images) for why the source has to be a flat,
   straight-on front and where to find one.

5. **The Stock Room** — `npm run dev`, then [http://localhost:4321/admin](http://localhost:4321/admin).
   Two tabs: **Add a cereal** (search, pick the product, pick its box photo, score it) and
   **Edit one you have** (everything above in one form — score, note, tags, every nutrition
   field, and the photo). See [Web admin](#web-admin-the-stock-room) below — including why
   it's dev-only.

6. **Keystatic** — run `npm run dev`, open [http://localhost:4321/keystatic](http://localhost:4321/keystatic).
   Full CRUD with pickers for form factors, protein sources, attributes, and every
   nutrition field. Saves write straight to `src/content/cereals/*.md`. (Nutrition is
   entered by hand here — to auto-pull it, use `npm run add` above or `npm run enrich`.)
7. **By hand** — edit the markdown files in [src/content/cereals/](src/content/cereals/).
   Frontmatter schema lives in [src/content.config.ts](src/content.config.ts) (Zod) and is
   mirrored in [keystatic.config.ts](keystatic.config.ts).

Rules encoded in the schema:

- `rating` is the historical Notion 0–10 Taste scale, decimals allowed.
- Nutrition fields are nullable on purpose. Leave a value blank when the box doesn't
  list it — the UI renders “not listed” instead of inventing numbers (protein %DV
  especially: FDA only requires it when a protein claim is made).
- `emoji` + `boxColor` are the placeholder box art, used whenever `boxImage` is unset.
- `noAutoImage: true` marks a product with no usable flat front anywhere, so enrichment
  can't put an angled one back. `npm run image <slug> --none` sets it.

## Updating a cereal you already have

Four places can change an existing entry. They all write the same markdown files, so pick
whichever is closest to hand:

| What you're changing | Fastest way |
|---|---|
| Score / tasting note | `npm run rate "heritage flakes" 8.5 --note "…"` |
| Box photo | `npm run image "heritage flakes" <url>` |
| Anything — score, note, tags, any nutrition field, the photo | **Stock Room** → *Edit one you have* |
| Anything, in a CMS | Keystatic at `/keystatic` |

`npm run rate` and the Stock Room both stamp `dateUpdated` when the **score or note**
changes, leaving `dateReviewed` as the original review date — the site uses the pair to
tell a re-rate from a first review. Fixing a nutrition typo isn't a re-review, so it
doesn't stamp.

The Stock Room's edit form is the only one of the four that covers everything in one
place; `boxImage`/`imageSource`/`imageCredit`, `dateUpdated`, `purchaseLocation` and
`price` are **not** in `keystatic.config.ts`, so Keystatic can't set them (and if a
Keystatic save ever drops them, `git diff` will show it — worth a look the first time).

Renaming in the edit form changes only how a cereal reads on the site. The filename and
its URL stay put, because they're the identity every existing link uses. To genuinely
rename one, `git mv` the markdown and the `.jpg` and update `boxImage` by hand.

## Web admin (the Stock Room)

`npm run dev` → **[localhost:4321/admin](http://localhost:4321/admin)**, for when you'd
rather not be in a terminal. Two tabs.

### Add a cereal

`npm run find` with a browser on it:

1. **Search** a name. Both sources, same lookup code the CLI uses.
2. **Pick the product** from the results — each one shows its serving size and macros, and
   is marked if it's already in the aisle or unusable (no serving size). Those aren't
   selectable.
3. **Pick the photo.** Every front shot across *all* the matching records, pooled into one
   gallery — the same product often has several OFF entries with different photos, and
   this is the one step where seeing them side by side actually beats the CLI. Ingredient
   and nutrition panels are filtered out; width variants of the same shot are collapsed.
   Paste your own URL to override, or choose "No photo" to keep the emoji placeholder.
4. **Score it and write the note.** Tags come pre-checked from the guess; fix what's wrong.
5. **Preview file** shows the exact markdown before anything is written. **Add to the
   aisle** writes it.

It writes the same files as the CLI, so it's `git status` and a commit afterwards, same as
always.

### Edit one you have

The catalog, filterable, with its box art. Click one and you get every field on one form:
brand, name, score, note, emoji, box colour, all three tag groups, all fifteen nutrition
fields, and the photo. **Find photos** re-runs the Open Food Facts search for that product
and offers the gallery again; **Remove photo** deletes the `.jpg` and sets `noAutoImage`,
exactly like `npm run image <slug> --none`.

**Preview changes** shows the resulting file before anything is written, and saving edits
only what you actually changed:

```diff
-rating: 7
+rating: 8.5
+shortNote: Better than I remembered.
 dateReviewed: 2026-01-06
+dateUpdated: 2026-07-27
```

That surgical behaviour is the whole point, and it's the reason the write path is a
line-level edit rather than parse-then-reserialize: reserializing drops any key the tool
doesn't model, and these files carry several (`purchaseLocation`, `price`, a review body)
that nothing in the admin touches.

`npm test` holds it to that: it parses every file in the real catalog, feeds every value
straight back through the editor, and fails unless the output is byte-identical — plus
the targeted cases (quoting, key insertion order, nullable vs. removable fields, the
review body). Run it after touching `updateFrontmatter` in
[scripts/lib/compose-core.mjs](scripts/lib/compose-core.mjs).

### Why it's dev-only

Same reason as Keystatic: it needs server routes *and* a writable
`src/content/cereals/` — a static build on a static host has neither. Its pages live in
`src/admin/` rather than `src/pages/`, so `astro build` can't pick them up even by
accident; a small integration in `astro.config.mjs` injects them as routes during
`astro dev` (or with `ADMIN=1`). `dist/` stays purely static, and neither the admin nor
its auth code appears in a production build.

The password (`ADMIN_PASSWORD` in `.env`, default `cereal`) is there to stop someone else
on your network — or a stray tab — from writing to your content directory. It is **not**
built to face the public internet.

**If you ever want this on the live Vercel site**, know what changes: serverless has no
writable disk, so saving has to commit to GitHub through the API, which means a token with
write access to this repo sitting in the deploy env — and that password becomes the only
thing standing between the internet and it. That needs a real secret, rate limiting, and
ideally proper auth (an OAuth provider, or Vercel's own access protection) rather than a
shared password. It also means adding `@astrojs/vercel` and switching off `output:
'static'`, which changes how the whole site deploys. Worth doing deliberately, not by
extending this.

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
  admin/               the Stock Room — dev-only, injected as routes, never built
    index.astro        search → pick product → pick photo → score + note → save
    api/               login / search / create endpoints
  lib/                 taxonomy labels + formatting helpers
scripts/
  find.mjs             search by name and add (CLI)
  add.mjs  rate.mjs  image.mjs  enrich.mjs
  lib/
    enrich-core.mjs    lookup + scoring + the safety gates
    compose-core.mjs   picked result → brand/name split, tags, markdown, write
    image-core.mjs     download → trim → flatten → fit the 3D box face
```

## Nutrition completeness

Migrated entries carry exactly what Brian recorded in Notion: serving size, taste rating
(nullable — Grandy Organics has none), total/saturated fat, sugars, fiber, protein, and his
tasting notes. Everything he didn't record — calories, added sugars, trans/poly/mono fat,
protein %DV — renders as **"not listed"** rather than a guess.

For a **single new cereal**, `npm run find` pulls the whole label in one step and
`npm run add` fills the blanks around what you typed (see above). To **backfill the
existing catalog in bulk**, use the batch tool
[scripts/enrich.mjs](scripts/enrich.mjs) — both share the same lookup + safety code in
[scripts/lib/enrich-core.mjs](scripts/lib/enrich-core.mjs), so they behave identically:

```bash
npm run enrich                     # fetch candidates -> enrichment/<slug>.json + REVIEW.md
# open enrichment/REVIEW.md, verify each match via its OFF link,
# set "approved": true in the slug's JSON for the good ones, then:
npm run enrich:apply               # writes ONLY approved drafts, filling null fields only
node scripts/enrich.mjs --auto-approve   # auto-approve matches that pass BOTH checks
FDC_API_KEY=xxxx npm run enrich     # also query USDA FoodData Central (free key)
```

It pulls from Open Food Facts (free, no key) and — with `FDC_API_KEY` — USDA, then scores
each match by comparing the source's protein/sugar/fiber against Brian's recorded numbers.
USDA needs two calls: `foods/search` ranks candidates on its per-100g `foodNutrients`,
then `food/{fdcId}` supplies the `labelNutrients` actually printed on the box. (Search
results carry no `labelNutrients` at all — reading it there returned `undefined` for every
field, scoring every USDA candidate 999 with zero compared fields, which quietly kept USDA
out of the running entirely until it was fixed.)
Sanity guards drop implausible values (OFF sometimes stores per-container, not per-serving,
data). Everything defaults to `approved: false`; nothing is written until you confirm,
and `--apply` only fills blank fields — your verified numbers are never overwritten. A
nutrition key that's *missing* from a file counts as blank too: `--apply` inserts it in
schema order. (It used to only rewrite existing `key: null` lines, which meant sodium —
absent from every migrated file — was fetched, sanity-checked, and then silently dropped
for the entire catalog.) Applied entries also gain a `barcode`.

Why not "approve in Keystatic" directly? Keeping drafts out of the content model avoids
polluting it; once applied, the values show up in Keystatic for any further editing.

Two gates run before anything can auto-approve. **Name overlap** requires ≥2 shared
significant tokens. **Product form** rejects a candidate whose name claims a form ours
never mentions — the granola *bar*, breakfast *biscuits*, hot *oatmeal*, Bircher *muesli*
and Heritage *Bites* matches all cleared the macro check and were caught here. It's
one-way, so "butter" in their name is fine when ours is a Peanut Butter granola.

Neither gate can catch a *flavour* or *brand* swap, so those still need eyes. Both search
APIs are non-deterministic — the same query returns different winners run to run — and
USDA's `brandOwner` field is frequently junk ("The Harrell Sisters" for Manitoba Harvest,
"Mr. Beverages Old Time Cocktail Mixes" for Magic Spoon), so it can't be used to verify a
brand. The reliable check is the **barcode**: look it up on Open Food Facts and see what
comes back. That's what caught an "ALMOND BUTTER GRANOLA" match for Michele's whose UPC
resolves to Udi's Gluten Free, and what confirmed the Manitoba Harvest match that USDA had
attributed to the wrong company.

### Box images

`boxImage` renders as the **front face of a CSS 3D box** that already applies its own
`rotateY(-20deg)`. So the source must be a flat, straight-on, dead-center package front.
A 3/4 "packshot" render reads as a box inside a box; an Open Food Facts user snapshot
drags in table edges, fingers and tilt.

That's why **enrichment no longer touches box images** — `npm run image` is the way in.
`npm run enrich --with-off-image` opts back in where a photo beats nothing, and cereals
marked `noAutoImage: true` are skipped even then.

`npm run find` is the one exception that pulls a photo by default, because it's the one
place you've just seen the product you picked: it reports the photo it wrote and what the
crop discarded, so an angled one is obvious immediately and `npm run image <slug> <url>`
replaces it. `--no-image` keeps the emoji placeholder instead.

Sourcing that works: manufacturer sites are best, and most run Shopify, so
`…/cdn/shop/files/<name>.png?width=2000` gives a transparent flat front. Retailer
fallbacks: Kroger `product/images/xlarge/front/<upc>`, Amazon `_SL1600_`. Avoid Target's
main image (angled). Tall bags lose their top and bottom to the default center crop —
`npm run image` warns when it discards ≥25% and suggests `--fit contain`, which pads onto
white instead.

### What's already enriched

**17 of 25** cereals have calories, **16** have added sugars, **14** carry sodium
(previously none could — see the writer note above), and **22** have real flat-front box
photos. Every applied value passed the macro cross-check plus both gates above, and the
brand-ambiguous ones were confirmed by barcode.

The remaining 8 stay on "not listed" because the source matched the wrong product or had
no usable data — honest gaps, not guesses:

| cereal | why |
|---|---|
| Kodiak Cookie Butter Granola | no record; search lands on wheat bread / a protein pack |
| KIND Soft Baked Granola | only the granola **bar** exists in USDA |
| KIND Dark Chocolate Clusters | matches a dipped-cluster snack, not the cereal |
| Michele's Almond Butter | best match's UPC resolves to Udi's Gluten Free |
| Manitoba Harvest Superseed | only the plain hemp seeds / other brands' granola |
| Trader Joe's Cherry Pistachio | search returns cherry *juice* and cornichons |
| Calbee Frugra | OFF record is per-container (510 kcal/56g — guard dropped it) |
| Magic Spoon Peanut Butter | matches the **Cocoa** Peanut Butter flavour, identical macros |

Three products — Magic Spoon Peanut Butter, Cheerios Strawberry Protein, Cascadian Farm
Hearty Morning — have no flat front at any source and are marked `noAutoImage: true`.
Cheerios and Hearty Morning did gain full nutrition this round; they just keep emoji art.

To fill more later: re-run `FDC_API_KEY=… node scripts/enrich.mjs --auto-approve`, verify
new matches in `enrichment/REVIEW.md`, and `--apply`. Because both APIs are
non-deterministic, a repeat run surfaces different candidates — it's worth re-running
occasionally. Applying is safe to repeat: it only ever fills blanks.

Free USDA key: https://fdc.nal.usda.gov/api-key-signup — worth setting, since `DEMO_KEY`
is shared and rate-limits about ten cereals into a sweep. Keep it in the environment
(`.env` is gitignored), never in a tracked file.

## Still to do (from the build plan)

- Enrich the remaining 8 (table above). None carry a barcode, so there's no direct lookup
  — most would need the number off the physical box.

Phase-2 items from the plan are now built: comparison view (`/compare`) and `/tags/[tag]`
landing pages (one per form factor / attribute / protein source).
