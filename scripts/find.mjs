// Search for a cereal by name, pick it off a list, and get everything filled in
// — nutrition, box photo, tags — so all you write is the score and the note.
//
//   npm run find "magic spoon peanut butter"
//   npm run find                                 # asks for the name
//
// How this differs from `npm run add`: that one makes you type the serving size
// and macros FIRST, because cross-checking them against the source is what lets
// it apply a match nobody looked at. Here you look at the match yourself — you
// pick it out of the search results — so confirming the identity by eye is the
// safety gate, and the whole label can come down from the source, serving size
// and macros included.
//
// Use `npm run add` when the box is in your hand and the databases don't have
// it; use this when the product exists in the databases and you don't want to
// transcribe a label.
//
// Flags:
//   --pick <n>       take result n without asking (scriptable; 1-based)
//   --rating <0-10>  taste score, else prompted (blank = unrated)
//   --note "…"       the one-line tasting note, else prompted
//   --brand / --name override the brand/product split taken from the match
//   --no-image       don't pull the photo, keep the emoji placeholder
//   --no-usda        Open Food Facts only
//   --no-infer       don't guess formFactors/attributes/proteinSources
//   --fit contain    pad the photo onto white instead of cropping to fill
//   --dry-run        show what it would write, write nothing
//   --yes            never prompt (needs --pick; for scripts)

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  ROOT, CEREALS, readTaxonomy, searchCandidates, usdaUpgradeToLabel, guard,
} from './lib/enrich-core.mjs';
import { loadImage, normalizeBoxImage, OUT_WIDTH, OUT_HEIGHT } from './lib/image-core.mjs';

const { FORM_FACTORS, PROTEIN_SOURCES, ATTRIBUTES } = readTaxonomy();
const IMAGES = join(ROOT, 'public', 'images', 'cereals');

// --- args ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const flagsWithValues = new Set(['pick', 'rating', 'note', 'brand', 'name', 'fit', 'emoji', 'color']);
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (flagsWithValues.has(a.slice(2))) i++;
    continue;
  }
  pos.push(a);
}

const NO_IMAGE = has('--no-image');
const USE_USDA = !has('--no-usda');
const INFER = !has('--no-infer');
const DRY = has('--dry-run');
const FIT = flag('fit') || 'cover';
const NONINTERACTIVE = has('--yes') || !stdin.isTTY;
const FDC_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}
if (!['cover', 'contain'].includes(FIT)) fail(`--fit must be cover or contain (got "${FIT}")`);

const rl = NONINTERACTIVE ? null : createInterface({ input: stdin, output: stdout });
const ask = async (q, def) => {
  if (!rl) return def ?? '';
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  return a || def || '';
};

// --- 1. the query -------------------------------------------------------------
let query = pos.join(' ').trim();
if (!query) {
  if (!rl) fail('give a name to search for: npm run find "magic spoon peanut butter"');
  query = (await ask('Search for')).trim();
}
if (!query) fail('no search term given');

// --- 2. search ----------------------------------------------------------------
console.log(`\nSearching Open Food Facts${USE_USDA ? ' + USDA' : ''} for “${query}”…`);
const { candidates, errors } = await searchCandidates(query, { fdcKey: FDC_KEY, useUsda: USE_USDA });
for (const e of errors) console.log(`  (${e})`);

if (!candidates.length) {
  rl?.close();
  // "Nothing matched" and "nothing answered" call for different next steps.
  if (errors.length === (USE_USDA ? 2 : 1)) {
    console.log('\nEvery source errored, so this says nothing about whether the product is listed.');
    console.log('Check your connection and try again.');
    process.exit(1);
  }
  console.log(
    '\nNothing matched.\n' +
    '  · Try fewer words — brand plus one flavour word works best ("kodiak cookie butter").\n' +
    '  · Small and store brands are often missing from both databases. For those,\n' +
    '    `npm run add` takes the numbers off the box by hand.'
  );
  process.exit(0);
}

// --- 3. show what came back ---------------------------------------------------
const g = (v, unit = 'g') => (v == null ? '—' : `${v}${unit}`);
console.log(`\nFound ${candidates.length}:\n`);
candidates.forEach((c, i) => {
  const tags = [c.sourceLabel, c.alsoIn ? `+${c.alsoIn}` : null, c.image ? 'has photo' : null]
    .filter(Boolean).join(' · ');
  console.log(`  ${String(i + 1).padStart(2)}  ${c.matchedBrand ? c.matchedBrand + ' — ' : ''}${c.matchedName}`);
  console.log(`      ${tags}`);
  console.log(
    `      ${c.servingSize ? c.servingSize + 'g serving' : 'serving size not listed'} · ` +
    `${g(c.calories, ' kcal')} · ${g(c.protein)} protein · ${g(c.totalSugars)} sugar · ${g(c.dietaryFiber)} fiber`
  );
  console.log(`      ${c.url}`);
  console.log('');
});

// --- 4. pick ------------------------------------------------------------------
let index;
if (flag('pick') != null) {
  index = Number(flag('pick')) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
    fail(`--pick must be 1–${candidates.length} (got "${flag('pick')}")`);
  }
} else if (!rl) {
  fail('running non-interactively — pass --pick <n> to choose a result');
} else {
  const a = await ask(`Which one? 1–${candidates.length}, or q to quit`, '1');
  if (/^q/i.test(a)) {
    rl?.close();
    console.log('Nothing written.');
    process.exit(0);
  }
  index = Number(a) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
    rl?.close();
    fail(`"${a}" isn't one of 1–${candidates.length}`);
  }
}

// USDA search hits carry per-100g data; the printed label is on the detail
// record, so fetch it now that we know which one we want.
let picked = candidates[index];
if (picked.source === 'usda_fdc') {
  process.stdout.write('Fetching the printed label from USDA… ');
  picked = await usdaUpgradeToLabel(picked, { fdcKey: FDC_KEY });
  console.log(picked.basis === 'label' ? 'ok' : 'unavailable, using per-100g figures');
}

// The same sanity guards the unattended path uses: OFF sometimes stores
// per-container rather than per-serving values, and picking the right product
// doesn't make those numbers right.
guard(picked, { servingSize: picked.servingSize, totalSugars: picked.totalSugars });
if (picked.flags?.length) {
  console.log('\n  Dropped as implausible:');
  for (const f of picked.flags) console.log(`    · ${f}`);
}

if (picked.servingSize == null) {
  rl?.close();
  fail(
    `that record has no serving size, and the whole label is per-serving without one.\n` +
    `  Pick another result, or use: npm run add`
  );
}

// --- 5. brand / product split -------------------------------------------------
// OFF puts the brand in its own field but often repeats it in the product name
// ("Magic Spoon Peanut Butter"); USDA jams both into one uppercase description.
// Split it here so the site's brand line and box label read properly.
// Short all-caps tokens are acronyms the catalog keeps as-is (KIND, IKEA);
// longer shouty ones are just USDA's formatting.
function titleCase(s) {
  return s.replace(/[\w’']+/g, (w) =>
    (w === w.toUpperCase() && w.length <= 4 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())
  );
}
const LEGAL_SUFFIX = /[\s,]+(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|co|co\.|company|ltd|ltd\.|limited|plc|gmbh|s\.a\.)$/i;

let brandGuess = (picked.matchedBrand || '').split(',')[0].trim();
while (LEGAL_SUFFIX.test(brandGuess)) brandGuess = brandGuess.replace(LEGAL_SUFFIX, '').trim();
if (brandGuess === brandGuess.toUpperCase()) brandGuess = titleCase(brandGuess);

let nameGuess = picked.matchedName;
if (nameGuess === nameGuess.toUpperCase()) nameGuess = titleCase(nameGuess);
// USDA writes descriptions as "BRAND, PRODUCT NAME" — drop that leading segment
// when it's the brand rather than part of the product's actual name.
const brandWords = new Set(brandGuess.toLowerCase().match(/[a-z0-9]+/g) || []);
const comma = nameGuess.indexOf(',');
if (comma > 0) {
  const head = nameGuess.slice(0, comma).toLowerCase().match(/[a-z0-9]+/g) || [];
  if (head.length && head.every((w) => brandWords.has(w))) nameGuess = nameGuess.slice(comma + 1).trim();
}
if (brandGuess) {
  // strip a plain leading brand repeat ("Magic Spoon Peanut Butter")
  nameGuess = nameGuess.replace(new RegExp(`^${brandGuess.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,-]+`, 'i'), '').trim();
}
// Every product here is a cereal, and the catalog names read "Peanut Butter",
// not "Peanut Butter Cereal" — drop the redundant tail unless it's the whole name.
nameGuess = nameGuess.replace(/\s+cereal\s*$/i, '').trim() || nameGuess;
nameGuess = nameGuess.replace(/\s*,\s*$/, '').replace(/\s+/g, ' ').trim() || picked.matchedName;

console.log('');
const brand = flag('brand') || (await ask('Brand', brandGuess)) || brandGuess;
const name = flag('name') || (await ask('Product name (without brand)', nameGuess)) || nameGuess;
if (!brand || !name) {
  rl?.close();
  fail('need both a brand and a product name');
}

// --- 6. the part only you can supply ------------------------------------------
const ratingRaw = flag('rating') ?? (await ask('Taste score 0–10 (blank = unrated)'));
const rating = ratingRaw === '' || ratingRaw == null ? null : Number(ratingRaw);
if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 10)) {
  rl?.close();
  fail(`rating "${ratingRaw}" must be a number 0–10 (or blank)`);
}
const note = flag('note') ?? (await ask('Short tasting note'));
rl?.close();

// --- 7. infer the tags --------------------------------------------------------
// Best-effort only, and printed back so a wrong guess is obvious and editable.
const keep = (vals, allowed) => (allowed ? vals.filter((v) => allowed.includes(v)) : vals);
const haystack = `${brand} ${name} ${picked.ingredients || ''} ${(picked.labels || []).join(' ')}`.toLowerCase();
const hasLabel = (frag) => (picked.labels || []).some((l) => l.includes(frag));

function inferForms() {
  const map = {
    granola: /granola/, flakes: /flake/, clusters: /cluster/, puffs: /puff/,
    squares: /square/, shredded: /shredded/, biscuits: /biscuit/, muesli: /muesli/,
    oats: /\boat(meal|s)?\b/, crisps: /crisp/, os: /\b(o's|os|cheerio|loops|rings)\b/,
  };
  return keep(Object.entries(map).filter(([, re]) => re.test(haystack)).map(([k]) => k), FORM_FACTORS);
}
function inferProteinSources() {
  const out = [];
  if (/pea protein/.test(haystack)) out.push('pea-protein');
  if (/milk protein|casein/.test(haystack)) out.push('milk-protein');
  if (/whey/.test(haystack)) out.push('whey');
  if (/soy protein/.test(haystack)) out.push('soy');
  if (/almond|peanut|cashew|pecan|walnut|hemp|chia|flax|pumpkin seed|sunflower seed/.test(haystack)) out.push('nut-seed');
  return keep(out, PROTEIN_SOURCES);
}
function inferAttributes() {
  const out = [];
  const n = picked;
  if (n.protein != null && n.protein >= 10) out.push('high-protein');
  if (n.dietaryFiber != null && n.dietaryFiber >= 5) out.push('high-fiber');
  if (n.totalSugars != null && n.totalSugars <= 5) out.push('low-sugar');
  if (n.addedSugars === 0 || /no added sugar/.test(haystack)) out.push('no-added-sugar');
  if (/\borganic\b/.test(haystack) || hasLabel('organic')) out.push('organic');
  if (/gluten[\s-]?free/.test(haystack) || hasLabel('gluten-free')) out.push('gluten-free');
  if (hasLabel('vegan')) out.push('vegan');
  if (/grain[\s-]?free/.test(haystack)) out.push('grain-free');
  if (/\bketo\b/.test(haystack)) out.push('keto');
  return keep([...new Set(out)], ATTRIBUTES);
}
const formFactors = INFER ? inferForms() : [];
const proteinSources = INFER ? inferProteinSources() : [];
const attributes = INFER ? inferAttributes() : [];

// --- 8. write it --------------------------------------------------------------
// Same slug rule as add.mjs / migrate-notion.mjs, so filenames stay consistent.
function slugify(b, n) {
  return `${b} ${n}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function q(s) {
  const str = String(s);
  if (/^[\u{1F000}-\u{1FFFF}☀-➿]/u.test(str)) return `'${str}'`;
  if (/[:#'"[\]{}&*!|>%@`]/.test(str) || /^\s|\s$/.test(str) || str === '') return JSON.stringify(str);
  return str;
}

const slug = slugify(brand, name);
if (!slug) fail(`could not derive a filename from "${brand} ${name}"`);
const file = `${slug}.md`;
if (existsSync(join(CEREALS, file))) {
  fail(`${file} already exists — edit it in Keystatic, or delete it first`);
}

const today = new Date().toISOString().slice(0, 10);
const emoji = flag('emoji') || '🥣';
const boxColor = flag('color') || '#c98d4e';

const lines = ['---'];
lines.push(`name: ${q(name)}`);
lines.push(`brand: ${q(brand)}`);
lines.push(`rating: ${rating == null ? 'null' : rating}`);
if (note) lines.push(`shortNote: ${q(note)}`);
lines.push(`dateReviewed: ${today}`);
lines.push(`emoji: ${q(emoji)}`);
lines.push(`boxColor: ${q(boxColor)}`);
if (picked.barcode) lines.push(`barcode: '${picked.barcode}'`);
lines.push(`formFactors: [${formFactors.join(', ')}]`);
lines.push(`proteinSources: [${proteinSources.join(', ')}]`);
lines.push(`attributes: [${attributes.join(', ')}]`);
lines.push('nutrition:');
lines.push(`  servingSize: ${picked.servingSize}`);
if (picked.servingDescription) lines.push(`  servingDescription: ${q(picked.servingDescription)}`);
const nutRows = {
  calories: picked.calories,
  totalFat: picked.totalFat,
  saturatedFat: picked.saturatedFat,
  transFat: picked.transFat,
  polyunsaturatedFat: picked.polyunsaturatedFat,
  monounsaturatedFat: picked.monounsaturatedFat,
  totalCarbs: picked.totalCarbs,
  dietaryFiber: picked.dietaryFiber,
  totalSugars: picked.totalSugars,
  addedSugars: picked.addedSugars,
  protein: picked.protein,
  // proteinDV is only on a label when a protein claim is made — never inferred.
  proteinDV: null,
  sodium: picked.sodium,
};
for (const [k, v] of Object.entries(nutRows)) lines.push(`  ${k}: ${v == null ? 'null' : v}`);
lines.push('---');
lines.push('');

// --- 9. the box photo ---------------------------------------------------------
// Off by default everywhere else in this repo, because OFF photos are
// crowdsourced snapshots and boxImage is the front face of a CSS 3D box that
// already applies its own rotation — an angled shot reads as a box in a box.
// Here it's on, since you can see from the summary whether it landed, and
// `npm run image <slug> <url>` replaces it in one line if it didn't.
let imageResult = null;
if (!NO_IMAGE && picked.image) {
  try {
    const input = await loadImage(picked.image);
    const { out, before, trimmed, lost } = await normalizeBoxImage(input, { trim: true, fit: FIT });
    imageResult = { out, before, trimmed, lost };
  } catch (e) {
    console.log(`\n  (photo download failed: ${e.message} — keeping the ${emoji} placeholder)`);
  }
}
if (imageResult) {
  // Anchor on formFactors so the image keys land after barcode, matching the
  // order the rest of the catalog uses (boxColor, barcode, boxImage, …).
  const at = lines.findIndex((l) => l.startsWith('formFactors:'));
  lines.splice(at, 0,
    `boxImage: /images/cereals/${slug}.jpg`,
    'imageSource: open_food_facts',
    `imageCredit: ${JSON.stringify(`Photo: Open Food Facts contributors, CC-BY-SA — ${picked.url}`)}`
  );
}

const md = lines.join('\n') + '\n';

if (DRY) {
  console.log(`\n[dry-run] would write src/content/cereals/${file}\n`);
  console.log(md.replace(/^/gm, '  '));
  if (imageResult) {
    const { before, trimmed, out } = imageResult;
    console.log(`  [dry-run] would write public/images/cereals/${slug}.jpg`);
    console.log(`    ${before.width}x${before.height} → trimmed ${trimmed.width}x${trimmed.height} → ${OUT_WIDTH}x${OUT_HEIGHT} (${(out.length / 1024).toFixed(0)}KB)`);
  }
  process.exit(0);
}

mkdirSync(CEREALS, { recursive: true });
writeFileSync(join(CEREALS, file), md);
if (imageResult) {
  mkdirSync(IMAGES, { recursive: true });
  writeFileSync(join(IMAGES, `${slug}.jpg`), imageResult.out);
}

// --- 10. report ---------------------------------------------------------------
const filled = Object.entries(nutRows).filter(([, v]) => v != null).length;
const blank = Object.entries(nutRows).filter(([k, v]) => v == null && k !== 'proteinDV').map(([k]) => k);

console.log(`\n✓ Created src/content/cereals/${file}`);
console.log(`  ${brand} ${name} · ${rating == null ? 'unrated' : rating + '/10'} · ${picked.servingSize}g serving`);
console.log(`  ${filled} nutrition fields from ${picked.sourceLabel}${picked.basis === 'label' ? ' (printed label)' : ''}: “${picked.matchedName}”`);
if (blank.length) console.log(`  still blank: ${blank.join(', ')} — renders as “not listed”`);

if (INFER && (formFactors.length || proteinSources.length || attributes.length)) {
  console.log('\n  Tags guessed from the name and ingredients — correct any that are wrong:');
  if (formFactors.length) console.log(`    formFactors:    ${formFactors.join(', ')}`);
  if (proteinSources.length) console.log(`    proteinSources: ${proteinSources.join(', ')}`);
  if (attributes.length) console.log(`    attributes:     ${attributes.join(', ')}`);
}

if (imageResult) {
  const { before, trimmed, out, lost } = imageResult;
  console.log(`\n  Box photo: public/images/cereals/${slug}.jpg (${(out.length / 1024).toFixed(0)}KB)`);
  console.log(`    ${before.width}x${before.height} → trimmed ${trimmed.width}x${trimmed.height} → ${OUT_WIDTH}x${OUT_HEIGHT}, fit=${FIT}`);
  if (FIT === 'cover' && lost.pct >= 25) {
    console.log(`    ⚠ the crop discarded ~${lost.pct}% off the ${lost.axis} — re-run with --fit contain to pad instead`);
  }
  console.log('    Open Food Facts photos are crowdsourced, so check it\'s a flat, straight-on');
  console.log(`    front. If it's angled or shot on a table, replace it with:`);
  console.log(`      npm run image ${slug} <url-to-a-flat-front>`);
} else if (!NO_IMAGE) {
  console.log(`\n  No photo on that record — the ${emoji} placeholder stays. To add one:`);
  console.log(`      npm run image ${slug} <url-to-a-flat-front>`);
}

console.log('\n  Check it: npm run dev → /keystatic (or the markdown file)');
console.log(`  Change the score later: npm run rate ${slug} <0-10>`);
