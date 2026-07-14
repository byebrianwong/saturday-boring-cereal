// Reviewable nutrition + image enrichment for the cereal catalog.
//
// Sources: USDA FoodData Central (label-derived, public domain; preferred) and
// Open Food Facts (crowdsourced, free — and the one source of reusable images).
// Each candidate is scored by comparing its protein/sugar/fiber (scaled to
// Brian's serving size) against the numbers he already recorded. Sanity guards
// drop values that look per-container rather than per-serving.
//
// Modes:
//   node scripts/enrich.mjs                 # fetch -> enrichment/<slug>.json + REVIEW.md
//   node scripts/enrich.mjs --auto-approve  # same, but approve matches that pass BOTH
//                                           #   (macro cross-check HIGH) AND (name overlap)
//   node scripts/enrich.mjs --apply         # write ONLY approved drafts, null fields only
//
// USDA uses DEMO_KEY by default (30 req/hr shared limit). Set FDC_API_KEY for a
// personal free key. `node scripts/enrich.mjs --no-usda` to skip USDA entirely.
//
// It NEVER overwrites Brian's recorded fields (protein/sugar/fiber/serving/rating)
// and only fills what's currently blank (calories, sat/trans/poly/mono fat,
// added sugars, sodium) plus barcode + a CC-BY-SA image credit.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CEREALS = join(ROOT, 'src', 'content', 'cereals');
const DRAFTS = join(ROOT, 'enrichment');
const UA = 'SaturdayBoringCereal/0.1 (beamer408@gmail.com)';
const USE_USDA = !process.argv.includes('--no-usda');
const FDC_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
const APPLY = process.argv.includes('--apply');
const AUTO = process.argv.includes('--auto-approve');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v, step) => (v == null || Number.isNaN(v) ? null : Math.round(v / step) * step);

// --- minimal frontmatter read (we control the format) -------------------------
function readCereal(file) {
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
function macroScore(cereal, cand) {
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
function guard(d, cereal) {
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
async function offSearch(cereal) {
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
async function usdaSearch(cereal) {
  const q = encodeURIComponent(`${cereal.brand} ${cereal.name}`);
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${FDC_KEY}&query=${q}&dataType=Branded&pageSize=5`;
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
function nameMatch(cereal, draft) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const want = new Set([...norm(cereal.brand), ...norm(cereal.name)]);
  const got = norm(`${draft.matchedName} ${draft.matchedBrand}`);
  const overlap = got.filter((w) => want.has(w)).length;
  return overlap >= 2;
}

function confidence(draft) {
  if (!draft || draft.comparedFields < 2) return 'LOW';
  if (draft.flags && draft.flags.length) return 'LOW';
  return draft.score <= 2.5 ? 'HIGH' : 'LOW';
}

// --- apply approved drafts (fill null fields only) ----------------------------
async function applyDraft(cereal, d) {
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
}

// --- run ----------------------------------------------------------------------
mkdirSync(DRAFTS, { recursive: true });
const files = readdirSync(CEREALS).filter((f) => f.endsWith('.md'));

if (APPLY) {
  let applied = 0;
  for (const file of files) {
    const cereal = readCereal(file);
    const p = join(DRAFTS, `${cereal.slug}.json`);
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (j.approved === true && j.draft) {
      await applyDraft(cereal, j.draft);
      applied++;
      console.log(`applied: ${cereal.slug} (${j.draft.source})`);
    }
  }
  console.log(`\nApplied ${applied} approved draft(s).`);
} else {
  const rows = [];
  let usdaRateLimited = false;
  for (const file of files) {
    const cereal = readCereal(file);
    let off = null;
    let usda = null;
    try {
      off = await offSearch(cereal);
    } catch (e) {
      /* ignore */
    }
    if (USE_USDA && !usdaRateLimited) {
      try {
        usda = await usdaSearch(cereal);
      } catch (e) {
        if (/rate limit/.test(e.message)) {
          usdaRateLimited = true;
          console.error('! USDA rate limit hit — continuing with Open Food Facts only. Set FDC_API_KEY for a personal key.');
        }
      }
    }
    // Pick primary nutrition source: prefer candidates whose product name matches
    // (so a macro-closer-but-wrong entry can't displace the right product), then
    // by macro closeness. Keep an OFF image if OFF is a confident name match.
    const cands = [off, usda].filter(Boolean).filter((d) => d.comparedFields >= 2);
    const named = cands.filter((d) => nameMatch(cereal, d));
    const pool = (named.length ? named : cands).sort((a, b) => a.score - b.score);
    let primary = pool[0] || off || usda || null;
    if (primary && !primary.image && off && off !== primary && off.image && nameMatch(cereal, off)) {
      primary.image = off.image;
      primary.imageUrl = off.url;
    }
    const conf = confidence(primary);
    const approved = AUTO && conf === 'HIGH' && primary && nameMatch(cereal, primary);
    writeFileSync(
      join(DRAFTS, `${cereal.slug}.json`),
      JSON.stringify(
        {
          slug: cereal.slug,
          recorded: { protein: cereal.protein, totalSugars: cereal.totalSugars, dietaryFiber: cereal.dietaryFiber, servingSize: cereal.servingSize },
          confidence: conf,
          nameMatch: primary ? nameMatch(cereal, primary) : false,
          approved,
          draft: primary,
        },
        null,
        2
      )
    );
    rows.push({ slug: cereal.slug, conf, approved, draft: primary });
    console.log(`${(approved ? 'APPROVE' : conf).padEnd(7)} ${cereal.slug} -> ${primary ? `[${primary.source}] ${primary.matchedName}` : 'no match'}`);
    await sleep(300);
  }

  const md = [
    '# Enrichment review',
    '',
    `Sources: USDA FoodData Central${usdaRateLimited ? ' (rate-limited this run)' : ''} + Open Food Facts. VERIFY against the box.`,
    '',
    'Auto-approved rows passed BOTH a macro cross-check and a product-name overlap.',
    'To accept more: open the link, confirm, set `"approved": true`, then `node scripts/enrich.mjs --apply`.',
    '',
    '| State | Cereal | Source | Match | kcal | satF | +sug | Na | img |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const d = r.draft;
      if (!d) return `| — | ${r.slug} | | no match | | | | | |`;
      const state = r.approved ? '✅ approved' : r.conf === 'HIGH' ? '☑︎ high' : '⚠️ low';
      const src = d.source === 'usda_fdc' ? 'USDA' : 'OFF';
      return `| ${state} | ${r.slug} | ${src} | [${d.matchedName || '?'}](${d.url}) | ${d.calories ?? ''} | ${d.saturatedFat ?? ''} | ${d.addedSugars ?? ''} | ${d.sodium ?? ''} | ${d.image ? 'y' : ''} |`;
    }),
  ].join('\n');
  writeFileSync(join(DRAFTS, 'REVIEW.md'), md);
  const approvedCount = rows.filter((r) => r.approved).length;
  console.log(`\nWrote ${rows.length} drafts + REVIEW.md · ${approvedCount} auto-approved`);
}
