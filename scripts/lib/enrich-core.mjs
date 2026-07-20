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
// added sugars, sodium) plus barcode + a CC-BY-SA image credit.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CEREALS = join(ROOT, 'src', 'content', 'cereals');
export const DRAFTS = join(ROOT, 'enrichment');
export const UA = 'SaturdayBoringCereal/0.1 (beamer408@gmail.com)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const round = (v, step) => (v == null || Number.isNaN(v) ? null : Math.round(v / step) * step);

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
  const scored = foods
    .map((f) => {
      const ss = f.servingSizeUnit === 'g' ? f.servingSize || null : null;
      const ln = f.labelNutrients || {};
      const sc = (v) => (v == null ? null : ss ? (v * s) / ss : v); // USDA label is per its serving
      const m = macroScore(cereal, { protein: sc(val(ln.protein)), sugars: sc(val(ln.sugars)), fiber: sc(val(ln.fiber)) });
      return { f, ln, ss, ...m };
    })
    .sort((a, b) => a.score - b.score);
  const best = scored[0];
  const ln = best.ln;
  const ss = best.ss;
  const sc = (v) => (v == null ? null : ss ? (v * s) / ss : v);
  return guard(
    {
      source: 'usda_fdc',
      matchedName: best.f.description,
      matchedBrand: best.f.brandOwner || best.f.brandName || '',
      barcode: best.f.gtinUpc || null,
      url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${best.f.fdcId}/nutrients`,
      image: null,
      calories: round(sc(val(ln.calories)), 5),
      saturatedFat: round(sc(val(ln.saturatedFat)), 0.5),
      transFat: round(sc(val(ln.transFat)), 0.5),
      polyunsaturatedFat: null,
      monounsaturatedFat: null,
      addedSugars: round(sc(val(ln.addedSugar ?? ln.addedSugars)), 1),
      sodium: (() => {
        const v = sc(val(ln.sodium));
        return v == null ? null : Math.round(v); // USDA sodium label is mg
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
  const meetsBar = conf === 'HIGH' && !!primary && nameMatch(cereal, primary);
  return { off, usda, primary, conf, meetsBar, usdaRateLimited };
}

// --- apply an approved draft (fill null fields only) --------------------------
export async function applyDraft(cereal, d) {
  let out = cereal.raw;
  const setNull = (key, val) => {
    if (val == null) return;
    out = out.replace(new RegExp(`^(\\s+${key}:)\\s*null\\s*$`, 'm'), `$1 ${val}`);
  };
  setNull('calories', d.calories);
  setNull('saturatedFat', d.saturatedFat);
  setNull('transFat', d.transFat);
  setNull('polyunsaturatedFat', d.polyunsaturatedFat);
  setNull('monounsaturatedFat', d.monounsaturatedFat);
  setNull('addedSugars', d.addedSugars);
  setNull('sodium', d.sodium);

  // Download the box photo into the repo (static-host friendly; no remote dep).
  let localImg = null;
  if (d.image) {
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
