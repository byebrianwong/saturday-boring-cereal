// Shared nutrition-enrichment core, used by both:
//   scripts/enrich.mjs  — batch backfill across the whole catalog
//   scripts/add.mjs     — add one cereal and pull its nutrition in the same step
//
// Sources: USDA FoodData Central (label-derived, public domain; preferred) and
// Open Food Facts (crowdsourced, free — and the one source of reusable images).
// Each candidate is scored by comparing its protein/sugar/fiber (scaled to the
// serving size you recorded) against the numbers you already entered. Sanity
// guards drop values that look per-container rather than per-serving.
//
// It NEVER overwrites your recorded fields (protein/sugar/fiber/serving/rating)
// and only fills what's currently blank (calories, sat/trans/poly/mono fat,
// added sugars, sodium) plus a barcode.
//
// Box images are NOT pulled from Open Food Facts by default. OFF photos are
// crowdsourced snapshots — tilted, shot on tables, sometimes hand-held — and
// the site renders boxImage as the flat front face of a CSS 3D box that already
// applies its own rotateY perspective, so an angled photo reads as a box inside
// a box. Use `npm run image <slug> <url>` to set a proper flat front instead.
// Pass `withImage: true` to opt back in to the old OFF download.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CEREALS = join(ROOT, 'src', 'content', 'cereals');
export const DRAFTS = join(ROOT, 'enrichment');
export const UA = 'SaturdayBoringCereal/0.1 (beamer408@gmail.com)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const round = (v, step) => (v == null || Number.isNaN(v) ? null : Math.round(v / step) * step);

// --- taxonomy -----------------------------------------------------------------
// The allowed form factors / protein sources / attributes live in
// src/content.config.ts (the Zod schema, single source of truth). It's a
// TypeScript file that imports the virtual `astro:content` module, so we can't
// `import` it from plain Node — read the enum arrays out of its text instead.
// If that ever fails to parse, callers skip validation rather than block a add.
export function readTaxonomy() {
  const grab = (src, constName) => {
    const m = src.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\]`));
    return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : null;
  };
  try {
    const src = readFileSync(join(ROOT, 'src', 'content.config.ts'), 'utf8');
    return {
      FORM_FACTORS: grab(src, 'FORM_FACTORS'),
      PROTEIN_SOURCES: grab(src, 'PROTEIN_SOURCES'),
      ATTRIBUTES: grab(src, 'ATTRIBUTES'),
    };
  } catch {
    return { FORM_FACTORS: null, PROTEIN_SOURCES: null, ATTRIBUTES: null };
  }
}

// --- minimal frontmatter read (we control the format) -------------------------
export function readCereal(file) {
  const raw = readFileSync(join(CEREALS, file), 'utf8');
  const fm = raw.split('---')[1] || '';
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
  const nut = (k) => {
    const v = (fm.match(new RegExp(`^\\s+${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
    return v === undefined || v === 'null' ? null : Number(v);
  };
  const unquote = (s) => (s ? s.replace(/^['"]|['"]$/g, '') : s);
  return {
    file,
    slug: file.replace(/\.md$/, ''),
    brand: unquote(get('brand')),
    name: unquote(get('name')),
    // Opt-out marker for products with no flat, straight-on front anywhere.
    noAutoImage: get('noAutoImage') === 'true',
    servingSize: nut('servingSize'),
    protein: nut('protein'),
    totalSugars: nut('totalSugars'),
    dietaryFiber: nut('dietaryFiber'),
    raw,
  };
}

// score a candidate's macros vs recorded; lower = closer
export function macroScore(cereal, cand) {
  let score = 0;
  let compared = 0;
  const diff = (a, b) => {
    if (a == null || b == null) return;
    score += Math.abs(a - b);
    compared++;
  };
  diff(cand.protein, cereal.protein);
  diff(cand.sugars, cereal.totalSugars);
  diff(cand.fiber, cereal.dietaryFiber);
  return { score: compared ? score / compared : 999, compared };
}

// drop implausible (per-container) values
export function guard(d, cereal) {
  d.flags = [];
  const s = cereal.servingSize;
  const kcalPerG = d.calories != null && s ? d.calories / s : null;
  if (kcalPerG != null && (kcalPerG < 2 || kcalPerG > 7)) {
    d.flags.push(`calories ${d.calories} implausible (${kcalPerG.toFixed(1)} kcal/g) — dropped`);
    d.calories = null;
  }
  if (d.addedSugars != null && cereal.totalSugars != null && d.addedSugars > cereal.totalSugars + 1) {
    d.flags.push(`addedSugars ${d.addedSugars} > recorded total ${cereal.totalSugars} — dropped`);
    d.addedSugars = null;
  }
  if (d.addedSugars != null && s && d.addedSugars > s * 0.7) {
    d.flags.push(`addedSugars ${d.addedSugars} implausible for ${s}g — dropped`);
    d.addedSugars = null;
  }
  if (d.saturatedFat != null && s && d.saturatedFat > s * 0.6) {
    d.flags.push(`saturatedFat ${d.saturatedFat} implausible — dropped`);
    d.saturatedFat = null;
  }
  // near-zero sodium on a packaged cereal almost always means missing OFF data,
  // not a genuine 0 — drop it rather than assert a wrong value.
  if (d.sodium != null && d.sodium < 10) {
    d.flags.push(`sodium ${d.sodium}mg implausibly low — dropped`);
    d.sodium = null;
  }
  return d;
}

// --- Open Food Facts ----------------------------------------------------------
export async function offSearch(cereal) {
  const q = encodeURIComponent(`${cereal.brand} ${cereal.name}`);
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,code,nutriments,image_front_url`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const products = (await res.json()).products || [];
  if (!products.length) return null;
  const s = cereal.servingSize || 100;
  const scale = (per100) => (per100 == null ? null : (per100 * s) / 100);
  const scored = products
    .map((p) => {
      const n = p.nutriments || {};
      const m = macroScore(cereal, { protein: scale(n.proteins_100g), sugars: scale(n.sugars_100g), fiber: scale(n.fiber_100g) });
      return { p, n, ...m };
    })
    .sort((a, b) => a.score - b.score);
  const best = scored[0];
  const n = best.n;
  const sodium = n.sodium_100g != null ? scale(n.sodium_100g) * 1000 : n.salt_100g != null ? (scale(n.salt_100g) / 2.5) * 1000 : null;
  return guard(
    {
      source: 'open_food_facts',
      matchedName: best.p.product_name,
      matchedBrand: best.p.brands,
      barcode: best.p.code,
      url: `https://world.openfoodfacts.org/product/${best.p.code}`,
      image: best.p.image_front_url || null,
      calories: round(scale(n['energy-kcal_100g']), 5),
      saturatedFat: round(scale(n['saturated-fat_100g']), 0.5),
      transFat: round(scale(n['trans-fat_100g']), 0.5),
      polyunsaturatedFat: round(scale(n['polyunsaturated-fat_100g']), 0.5),
      monounsaturatedFat: round(scale(n['monounsaturated-fat_100g']), 0.5),
      addedSugars: round(scale(n['added-sugars_100g']), 1),
      sodium: sodium == null ? null : Math.round(sodium),
      score: best.score,
      comparedFields: best.compared,
    },
    cereal
  );
}

// --- USDA FoodData Central (Branded) ------------------------------------------
// Two endpoints, two different shapes, and only one of them carries the label:
//   foods/search  -> foodNutrients[]  , keyed by nutrient id, per 100g
//   food/{fdcId}  -> labelNutrients{} , per the product's own serving, as printed
// Search results do NOT include labelNutrients. Reading it there yields undefined
// for every field, which scores every candidate at 999/0-compared and silently
// removes USDA from the running — so rank on the per-100g numbers from search,
// then fetch the winner's detail record for label-accurate values.
const USDA_NUTRIENT_ID = {
  calories: 1008,
  protein: 1003,
  sugars: 2000,
  fiber: 1079,
  sodium: 1093,
  saturatedFat: 1258,
  transFat: 1257,
  addedSugars: 1235,
  polyunsaturatedFat: 1293,
  monounsaturatedFat: 1292,
  // Only the search-by-name flow reads these two — the macro-verified path
  // never fills totalFat/totalCarbs, since those come off the box by hand.
  totalFat: 1004,
  totalCarbs: 1005,
};

// Per-100g values out of a search hit's foodNutrients array.
function usdaPer100(food) {
  const by = new Map((food.foodNutrients || []).map((n) => [n.nutrientId, n.value]));
  const out = {};
  for (const [key, id] of Object.entries(USDA_NUTRIENT_ID)) {
    const v = by.get(id);
    out[key] = v == null ? null : v;
  }
  return out;
}

export async function usdaDetail(fdcId, fdcKey) {
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${fdcKey}`);
  if (res.status === 429) throw new Error('USDA rate limit');
  if (!res.ok) return null;
  return res.json();
}

export async function usdaSearch(cereal, { fdcKey = 'DEMO_KEY' } = {}) {
  const q = encodeURIComponent(`${cereal.brand} ${cereal.name}`);
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${fdcKey}&query=${q}&dataType=Branded&pageSize=5`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('USDA rate limit');
  if (!res.ok) return null;
  const foods = (await res.json()).foods || [];
  if (!foods.length) return null;
  const s = cereal.servingSize || 100;
  const val = (o) => (o && o.value != null ? o.value : null);

  // Rank on per-100g search values, scaled to the serving size Brian recorded.
  const scored = foods
    .map((f) => {
      const per100 = usdaPer100(f);
      const scale = (v) => (v == null ? null : (v * s) / 100);
      const m = macroScore(cereal, {
        protein: scale(per100.protein),
        sugars: scale(per100.sugars),
        fiber: scale(per100.fiber),
      });
      return { f, per100, ...m };
    })
    .sort((a, b) => a.score - b.score);
  const best = scored[0];

  // Prefer the printed label for the winner; fall back to its per-100g figures.
  let ln = null;
  let ss = null;
  try {
    const detail = await usdaDetail(best.f.fdcId, fdcKey);
    if (detail?.labelNutrients) {
      ln = detail.labelNutrients;
      ss = detail.servingSizeUnit === 'g' ? detail.servingSize || null : null;
    }
  } catch (e) {
    if (/rate limit/.test(e.message)) throw e;
  }
  // Label values are per the product's serving; per-100g values are per 100g.
  const scale100 = (v) => (v == null ? null : (v * s) / 100);
  const sc = ln ? (v) => (v == null ? null : ss ? (v * s) / ss : v) : scale100;
  const pick = (labelKey, per100Key) =>
    ln ? val(ln[labelKey]) : best.per100[per100Key ?? labelKey];

  return guard(
    {
      source: 'usda_fdc',
      matchedName: best.f.description,
      matchedBrand: best.f.brandOwner || best.f.brandName || '',
      barcode: best.f.gtinUpc || null,
      url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${best.f.fdcId}/nutrients`,
      image: null,
      basis: ln ? 'label' : 'per100g',
      calories: round(sc(pick('calories')), 5),
      saturatedFat: round(sc(pick('saturatedFat')), 0.5),
      transFat: round(sc(pick('transFat')), 0.5),
      // Poly/mono fat are never on a Nutrition Facts panel, so they only ever
      // come from the per-100g data regardless of which basis won above.
      polyunsaturatedFat: round(scale100(best.per100.polyunsaturatedFat), 0.5),
      monounsaturatedFat: round(scale100(best.per100.monounsaturatedFat), 0.5),
      addedSugars: round(sc(ln ? val(ln.addedSugar ?? ln.addedSugars) : best.per100.addedSugars), 1),
      sodium: (() => {
        const v = sc(pick('sodium'));
        return v == null ? null : Math.round(v); // sodium is mg in both shapes
      })(),
      score: best.score,
      comparedFields: best.compared,
    },
    cereal
  );
}

// --- name-overlap gate: does the match share ≥2 significant tokens? ------------
export function nameMatch(cereal, draft) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const want = new Set([...norm(cereal.brand), ...norm(cereal.name)]);
  const got = norm(`${draft.matchedName} ${draft.matchedBrand}`);
  const overlap = got.filter((w) => want.has(w)).length;
  return overlap >= 2;
}

// --- product-form gate --------------------------------------------------------
// The macro check can't tell a granola *bar* from granola, or breakfast
// *biscuits* from the cereal — same ingredients, same numbers, different SKU.
// So if a candidate's name claims a product form ours never mentions, treat it
// as a different product no matter how well the macros line up. Only one-way:
// "butter" in theirs is fine when ours is a Peanut Butter granola.
const FORM_WORDS = [
  'bar', 'bars', 'biscuit', 'biscuits', 'oatmeal', 'muesli', 'bread', 'juice',
  'drink', 'concentrate', 'spread', 'cup', 'cups', 'snack', 'bites', 'cookie',
  'cookies', 'yogurt', 'smoothie', 'seeds', 'oil', 'flour', 'shake',
];
export function formMismatch(cereal, draft) {
  if (!draft) return null;
  const words = (s) => new Set((s || '').toLowerCase().match(/[a-z]+/g) || []);
  const ours = words(`${cereal.brand} ${cereal.name}`);
  const theirs = words(`${draft.matchedName} ${draft.matchedBrand}`);
  const claimed = FORM_WORDS.filter((w) => theirs.has(w) && !ours.has(w));
  return claimed.length ? claimed.join('/') : null;
}

export function confidence(draft) {
  if (!draft || draft.comparedFields < 2) return 'LOW';
  if (draft.flags && draft.flags.length) return 'LOW';
  return draft.score <= 2.5 ? 'HIGH' : 'LOW';
}

// Pick primary nutrition source: prefer candidates whose product name matches
// (so a macro-closer-but-wrong entry can't displace the right product), then by
// macro closeness. Keep an OFF image if OFF is a confident name match.
export function pickPrimary(cereal, off, usda) {
  const cands = [off, usda].filter(Boolean).filter((d) => d.comparedFields >= 2);
  const named = cands.filter((d) => nameMatch(cereal, d));
  const pool = (named.length ? named : cands).sort((a, b) => a.score - b.score);
  const primary = pool[0] || off || usda || null;
  if (primary && !primary.image && off && off !== primary && off.image && nameMatch(cereal, off)) {
    primary.image = off.image;
    primary.imageUrl = off.url;
  }
  return primary;
}

// Look up one cereal across both sources and pick the best candidate.
// Returns { off, usda, primary, conf, meetsBar, usdaRateLimited }.
// `meetsBar` is true when the match clears the auto-approve threshold (HIGH
// confidence AND a product-name overlap); callers decide whether to act on it.
export async function enrichCereal(cereal, { fdcKey = 'DEMO_KEY', useUsda = true } = {}) {
  let off = null;
  let usda = null;
  let usdaRateLimited = false;
  try {
    off = await offSearch(cereal);
  } catch {
    /* network/parse error — treat as no OFF match */
  }
  if (useUsda) {
    try {
      usda = await usdaSearch(cereal, { fdcKey });
    } catch (e) {
      if (/rate limit/.test(e.message)) usdaRateLimited = true;
    }
  }
  const primary = pickPrimary(cereal, off, usda);
  const conf = confidence(primary);
  const formIssue = formMismatch(cereal, primary);
  const meetsBar = conf === 'HIGH' && !!primary && nameMatch(cereal, primary) && !formIssue;
  return { off, usda, primary, conf, meetsBar, formIssue, usdaRateLimited };
}

// --- search by name (the `npm run find` flow) ---------------------------------
// Everything above scores candidates against macros you already recorded. That
// gate is what makes an unattended auto-apply safe — but it means you can't
// look a product up until you've typed its numbers in.
//
// This path inverts it: search by name, show what came back, and let a person
// pick. Confirming the identity by eye IS the gate, which is why these
// candidates carry the full label (serving size, protein, sugars, fiber and
// all) rather than only the fields the macro path is allowed to fill.

// Rank on how much of the query the product name actually accounts for. With
// no recorded macros there's nothing else to sort on, so a candidate that also
// carries more of the label wins ties — an empty record is never the best hit.
function nameRelevance(query, cand) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const want = norm(query);
  const got = new Set(norm(`${cand.matchedBrand} ${cand.matchedName}`));
  const hits = want.filter((w) => got.has(w)).length;
  const filled = ['calories', 'protein', 'totalSugars', 'dietaryFiber', 'sodium'].filter((k) => cand[k] != null).length;
  return hits + filled / 100;
}

// OFF stores serving size as both a number and a label ("36 g", "3/4 cup").
function offServing(p) {
  const q = p.serving_quantity == null ? null : Number(p.serving_quantity);
  if (Number.isFinite(q) && q > 0) return { grams: q, description: p.serving_size || null };
  const m = String(p.serving_size || '').match(/([\d.]+)\s*g/i);
  const grams = m ? Number(m[1]) : null;
  return { grams: Number.isFinite(grams) && grams > 0 ? grams : null, description: p.serving_size || null };
}

// Every distinct front photo on an OFF product: the default one plus each
// language's selected front. Deliberately only "front" — ingredient and
// nutrition panels are photos too, and neither belongs on a box face.
function frontImagesOf(p) {
  const urls = [];
  if (p.image_front_url) urls.push(p.image_front_url);
  const sel = p.selected_images?.front || {};
  for (const bySize of Object.values(sel)) {
    for (const url of Object.values(bySize || {})) {
      if (typeof url === 'string' && /^https?:\/\//.test(url)) urls.push(url);
    }
  }
  // Same photo at several widths collapses to one entry; the writer upgrades
  // whichever survives to the full-size original anyway.
  const seen = new Map();
  for (const url of urls) {
    const key = url.replace(/\.(\d+)\.(?:\d+|full)\.jpg$/i, '.$1.').replace(/^https?:/, '');
    if (!seen.has(key)) seen.set(key, url);
  }
  return [...seen.values()];
}

export async function offCandidates(query, { limit = 8 } = {}) {
  const fields = [
    'product_name', 'brands', 'code', 'nutriments', 'image_front_url',
    'serving_size', 'serving_quantity', 'ingredients_text', 'labels_tags', 'quantity',
    // Per-language front shots. One product often carries several, and the
    // admin's image picker wants every one of them to choose between.
    'selected_images',
  ].join(',');
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${fields}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const products = (await res.json()).products || [];

  return products
    .filter((p) => p.product_name)
    .map((p) => {
      const n = p.nutriments || {};
      const { grams, description } = offServing(p);
      // Prefer OFF's own per-serving figures; fall back to scaling per-100g.
      const per = (key) => {
        const s = n[`${key}_serving`];
        if (s != null) return Number(s);
        const h = n[`${key}_100g`];
        return h == null || !grams ? null : (Number(h) * grams) / 100;
      };
      const sodiumG = per('sodium');
      const saltG = per('salt');
      const sodium = sodiumG != null ? sodiumG * 1000 : saltG != null ? (saltG / 2.5) * 1000 : null;
      return {
        source: 'open_food_facts',
        sourceLabel: 'Open Food Facts',
        matchedName: p.product_name,
        matchedBrand: p.brands || '',
        barcode: p.code || null,
        url: `https://world.openfoodfacts.org/product/${p.code}`,
        image: p.image_front_url || null,
        frontImages: frontImagesOf(p),
        servingSize: grams,
        servingDescription: description,
        calories: round(per('energy-kcal'), 5),
        totalFat: round(per('fat'), 0.5),
        saturatedFat: round(per('saturated-fat'), 0.5),
        transFat: round(per('trans-fat'), 0.5),
        polyunsaturatedFat: round(per('polyunsaturated-fat'), 0.5),
        monounsaturatedFat: round(per('monounsaturated-fat'), 0.5),
        totalCarbs: round(per('carbohydrates'), 0.5),
        dietaryFiber: round(per('fiber'), 0.5),
        totalSugars: round(per('sugars'), 0.5),
        addedSugars: round(per('added-sugars'), 1),
        protein: round(per('proteins'), 0.5),
        sodium: sodium == null ? null : Math.round(sodium),
        ingredients: p.ingredients_text || null,
        labels: p.labels_tags || [],
      };
    });
}

export async function usdaCandidates(query, { fdcKey = 'DEMO_KEY', limit = 8 } = {}) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${fdcKey}` +
    `&query=${encodeURIComponent(query)}&dataType=Branded&pageSize=${limit}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('USDA rate limit');
  if (!res.ok) return [];
  const foods = (await res.json()).foods || [];

  return foods.map((f) => {
    const per100 = usdaPer100(f);
    const grams = f.servingSizeUnit === 'g' && f.servingSize > 0 ? f.servingSize : null;
    const per = (v) => (v == null || !grams ? null : (v * grams) / 100);
    return {
      source: 'usda_fdc',
      sourceLabel: 'USDA',
      fdcId: f.fdcId,
      matchedName: f.description,
      matchedBrand: f.brandOwner || f.brandName || '',
      barcode: f.gtinUpc || null,
      url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${f.fdcId}/nutrients`,
      image: null, // USDA carries no product photography
      frontImages: [],
      servingSize: grams,
      servingDescription: f.householdServingFullText || null,
      calories: round(per(per100.calories), 5),
      totalFat: round(per(per100.totalFat), 0.5),
      saturatedFat: round(per(per100.saturatedFat), 0.5),
      transFat: round(per(per100.transFat), 0.5),
      polyunsaturatedFat: round(per(per100.polyunsaturatedFat), 0.5),
      monounsaturatedFat: round(per(per100.monounsaturatedFat), 0.5),
      totalCarbs: round(per(per100.totalCarbs), 0.5),
      dietaryFiber: round(per(per100.fiber), 0.5),
      totalSugars: round(per(per100.sugars), 0.5),
      addedSugars: round(per(per100.addedSugars), 1),
      protein: round(per(per100.protein), 0.5),
      sodium: per(per100.sodium) == null ? null : Math.round(per(per100.sodium)),
      ingredients: f.ingredients || null,
      labels: [],
    };
  });
}

// A USDA search hit carries per-100g data only; the printed label lives on the
// detail record (the same split documented above usdaSearch). Once a candidate
// is picked it's worth the extra call to show what's actually on the box.
export async function usdaUpgradeToLabel(cand, { fdcKey = 'DEMO_KEY' } = {}) {
  if (cand.source !== 'usda_fdc' || !cand.fdcId) return cand;
  let detail = null;
  try {
    detail = await usdaDetail(cand.fdcId, fdcKey);
  } catch {
    return cand; // rate-limited or unreachable — the per-100g figures still stand
  }
  const ln = detail?.labelNutrients;
  if (!ln) return cand;
  const val = (o) => (o && o.value != null ? o.value : null);
  const grams = detail.servingSizeUnit === 'g' && detail.servingSize > 0 ? detail.servingSize : cand.servingSize;
  return {
    ...cand,
    basis: 'label',
    servingSize: grams,
    servingDescription: detail.householdServingFullText || cand.servingDescription,
    calories: round(val(ln.calories), 5) ?? cand.calories,
    totalFat: round(val(ln.fat), 0.5) ?? cand.totalFat,
    saturatedFat: round(val(ln.saturatedFat), 0.5) ?? cand.saturatedFat,
    transFat: round(val(ln.transFat), 0.5) ?? cand.transFat,
    totalCarbs: round(val(ln.carbohydrates), 0.5) ?? cand.totalCarbs,
    dietaryFiber: round(val(ln.fiber), 0.5) ?? cand.dietaryFiber,
    totalSugars: round(val(ln.sugars), 0.5) ?? cand.totalSugars,
    addedSugars: round(val(ln.addedSugar ?? ln.addedSugars), 1) ?? cand.addedSugars,
    protein: round(val(ln.protein), 0.5) ?? cand.protein,
    sodium: val(ln.sodium) == null ? cand.sodium : Math.round(val(ln.sodium)),
  };
}

// Search both sources by name and return candidates, best name match first.
// Returns { candidates, errors } — a source being down degrades the list
// instead of failing the search.
export async function searchCandidates(query, { fdcKey = 'DEMO_KEY', useUsda = true, limit = 8 } = {}) {
  const errors = [];
  const [off, usda] = await Promise.all([
    offCandidates(query, { limit }).catch((e) => {
      errors.push(`Open Food Facts: ${e.message}`);
      return [];
    }),
    useUsda
      ? usdaCandidates(query, { fdcKey, limit }).catch((e) => {
          errors.push(`USDA: ${e.message}`);
          return [];
        })
      : Promise.resolve([]),
  ]);

  // Same product from both sources: keep the richer record, prefer the one with
  // a photo, and remember that the other source agreed.
  const seen = new Map();
  for (const c of [...off, ...usda]) {
    const key = (c.barcode || `${c.matchedBrand} ${c.matchedName}`).toLowerCase().replace(/[^a-z0-9]/g, '');
    const prev = seen.get(key);
    if (!prev) seen.set(key, c);
    else {
      const keep = nameRelevance(query, prev) >= nameRelevance(query, c) ? prev : c;
      const other = keep === prev ? c : prev;
      keep.image = keep.image || other.image;
      keep.frontImages = [...new Set([...(keep.frontImages || []), ...(other.frontImages || [])])];
      keep.alsoIn = other.sourceLabel;
      seen.set(key, keep);
    }
  }

  const candidates = [...seen.values()]
    .map((c) => ({ ...c, relevance: nameRelevance(query, c) }))
    .filter((c) => c.relevance >= 1) // nothing in common with the query isn't a hit
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);

  return { candidates, errors };
}

// --- nutrition block writer ---------------------------------------------------
// Field order from the Zod schema in src/content.config.ts, so an inserted key
// lands where it belongs on the label rather than at the end of the block.
export const NUTRITION_ORDER = [
  'servingSize', 'servingDescription', 'calories', 'totalFat', 'saturatedFat',
  'transFat', 'polyunsaturatedFat', 'monounsaturatedFat', 'totalCarbs',
  'dietaryFiber', 'totalSugars', 'addedSugars', 'protein', 'proteinDV', 'sodium',
];

// Fill blank nutrition values, never overwriting one that's already recorded.
// A key that's simply absent from the file counts as blank and gets inserted —
// the migrated entries omit sodium/transFat/carbs entirely, and treating those
// as "nothing to fill" silently threw away every value the sources returned.
export function upsertNutrition(raw, values) {
  const lines = raw.split('\n');
  const start = lines.findIndex((l) => /^nutrition:\s*$/.test(l));
  if (start === -1) return raw; // no block to write into; leave the file alone
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++;

  const indent = (lines[start + 1] || '  x').match(/^\s*/)[0] || '  ';
  const keyAt = (i) => (lines[i].match(/^\s+([A-Za-z]+):/) || [])[1];

  for (const [key, val] of Object.entries(values)) {
    if (val == null) continue;
    const at = lines.slice(start + 1, end).findIndex((l) => new RegExp(`^\\s+${key}:`).test(l));
    if (at !== -1) {
      const i = start + 1 + at;
      // Only a null placeholder is ours to fill; a real value is Brian's.
      if (/:\s*null\s*$/.test(lines[i])) lines[i] = `${indent}${key}: ${val}`;
      continue;
    }
    // Absent — insert after the last present key that precedes it in the schema.
    const rank = NUTRITION_ORDER.indexOf(key);
    let insertAt = start + 1;
    for (let i = start + 1; i < end; i++) {
      const k = keyAt(i);
      const r = k ? NUTRITION_ORDER.indexOf(k) : -1;
      if (r !== -1 && r < rank) insertAt = i + 1;
    }
    lines.splice(insertAt, 0, `${indent}${key}: ${val}`);
    end++;
  }
  return lines.join('\n');
}

// --- apply an approved draft (fill blank fields only) -------------------------
// `withImage` opts in to downloading the Open Food Facts photo. It stays off by
// default: OFF images are crowdsourced snapshots and the 3D box needs a flat
// front (see the header note). `noAutoImage: true` on the cereal vetoes it even
// when the caller asks.
export async function applyDraft(cereal, d, { withImage = false } = {}) {
  let out = upsertNutrition(cereal.raw, {
    calories: d.calories,
    saturatedFat: d.saturatedFat,
    transFat: d.transFat,
    polyunsaturatedFat: d.polyunsaturatedFat,
    monounsaturatedFat: d.monounsaturatedFat,
    addedSugars: d.addedSugars,
    sodium: d.sodium,
  });

  // Download the box photo into the repo (static-host friendly; no remote dep).
  let localImg = null;
  if (d.image && withImage && !cereal.noAutoImage) {
    const dir = join(ROOT, 'public', 'images', 'cereals');
    mkdirSync(dir, { recursive: true });
    try {
      const res = await fetch(d.image, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        writeFileSync(join(dir, `${cereal.slug}.jpg`), Buffer.from(await res.arrayBuffer()));
        localImg = `/images/cereals/${cereal.slug}.jpg`;
      }
    } catch (e) {
      console.error(`  image download failed for ${cereal.slug}: ${e.message}`);
    }
  }

  const adds = [];
  if (d.barcode && !/^barcode:/m.test(out)) adds.push(`barcode: '${d.barcode}'`);
  if (localImg && !/^boxImage:/m.test(out)) adds.push(`boxImage: ${localImg}`);
  if (localImg && !/^imageSource:/m.test(out)) {
    adds.push('imageSource: open_food_facts');
    adds.push(`imageCredit: ${JSON.stringify(`Photo: Open Food Facts contributors, CC-BY-SA — ${d.imageUrl || d.url}`)}`);
  }
  if (adds.length) out = out.replace(/^(boxColor:.*$)/m, `$1\n${adds.join('\n')}`);
  writeFileSync(join(CEREALS, cereal.file), out);
  return { filledImage: !!localImg };
}
