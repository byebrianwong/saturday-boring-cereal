// Add one cereal and pull its nutrition in the same step.
//
//   npm run add                      # interactive — asks brand, product, score, macros
//   npm run add -- --brand "Magic Spoon" --name "Peanut Butter" --rating 5 \
//                  --serving 36 --protein 14 --sugars 0.1 --fiber 1
//
// It scaffolds src/content/cereals/<slug>.md from what you enter, then looks the
// product up on Open Food Facts + USDA and, when the match is confident (macros
// cross-check AND product name overlaps), fills in the blanks — calories, added
// sugars, sodium, sat/trans fat — and downloads a real box photo. Anything it
// isn't sure about is left for you to confirm (a draft in enrichment/<slug>.json,
// same review flow as `npm run enrich`); nothing wrong ever gets written.
//
// Your recorded numbers (protein / sugar / fiber / serving / rating) are never
// overwritten — only blank fields get filled. Flags:
//   --no-enrich   just scaffold the file, skip the lookup
//   --review      look up, but never auto-apply — always hold for confirmation
//   --no-usda     skip USDA (Open Food Facts only)
//   --yes         don't prompt for anything missing (fail instead) — for scripts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ROOT, CEREALS, DRAFTS, readCereal, nameMatch, applyDraft, enrichCereal } from './lib/enrich-core.mjs';

// The allowed form factors / protein sources / attributes live in
// src/content.config.ts (the Zod schema, single source of truth). It's a
// TypeScript file that imports the virtual `astro:content` module, so we can't
// `import` it from plain Node — read the enum arrays out of its text instead.
// If that ever fails to parse, we simply skip validation rather than block a add.
function readTaxonomy() {
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
const { FORM_FACTORS, PROTEIN_SOURCES, ATTRIBUTES } = readTaxonomy();

// --- args ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const NO_ENRICH = has('--no-enrich');
const REVIEW = has('--review');
const USE_USDA = !has('--no-usda');
const NONINTERACTIVE = has('--yes') || !stdin.isTTY;
const FDC_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';

// --- helpers ------------------------------------------------------------------
// Same slug rule as scripts/migrate-notion.mjs, so filenames stay consistent.
function slugify(brand, name) {
  return `${brand} ${name}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics: ä -> a
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Quote a YAML scalar only when needed (mirrors migrate-notion.mjs `q`).
function q(s) {
  const str = String(s);
  if (/^[\u{1F000}-\u{1FFFF}☀-➿]/u.test(str)) return `'${str}'`;
  if (/[:#'"[\]{}&*!|>%@`]/.test(str) || /^\s|\s$/.test(str) || str === '') return JSON.stringify(str);
  return str;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse a comma/space separated list and keep only values in `allowed`.
// `allowed` may be null if the taxonomy couldn't be read — then accept as-is.
function pickList(v, allowed, label) {
  if (!v) return [];
  const items = String(v).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!allowed) return items;
  const set = new Set(allowed);
  const chosen = [];
  const bad = [];
  for (const raw of items) {
    if (set.has(raw)) chosen.push(raw);
    else bad.push(raw);
  }
  if (bad.length) console.warn(`  note: ignored unknown ${label}: ${bad.join(', ')} (valid: ${allowed.join(', ')})`);
  return chosen;
}

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

// --- gather input (flags first, then prompt for what's missing) ---------------
const rl = NONINTERACTIVE ? null : createInterface({ input: stdin, output: stdout });
async function ask(prompt, { required = false, def } = {}) {
  const fromFlag = def;
  if (fromFlag != null && fromFlag !== '') return fromFlag;
  if (!rl) {
    if (required) fail(`missing --${prompt.flag} (running non-interactively)`);
    return undefined;
  }
  const suffix = prompt.hint ? ` ${prompt.hint}` : '';
  while (true) {
    const a = (await rl.question(`${prompt.q}${suffix}: `)).trim();
    if (a) return a;
    if (!required) return undefined;
    console.log('  (required)');
  }
}

const brand = await ask({ q: 'Brand', flag: 'brand', hint: 'e.g. Magic Spoon' }, { required: true, def: flag('brand') });
const name = await ask({ q: 'Product name (without brand)', flag: 'name', hint: 'e.g. Peanut Butter' }, { required: true, def: flag('name') });
const ratingRaw = await ask({ q: 'Taste score 0–10', flag: 'rating', hint: '(blank = unrated)' }, { def: flag('rating') });
const servingRaw = await ask({ q: 'Serving size in grams', flag: 'serving', hint: 'e.g. 36' }, { required: true, def: flag('serving') });
// Recorded macros power the safety cross-check — enter what the box lists.
const proteinRaw = await ask({ q: 'Protein (g)', flag: 'protein', hint: '(recommended — used to verify the match)' }, { def: flag('protein') });
const sugarsRaw = await ask({ q: 'Total sugars (g)', flag: 'sugars', hint: '(recommended)' }, { def: flag('sugars') });
const fiberRaw = await ask({ q: 'Dietary fiber (g)', flag: 'fiber', hint: '(recommended)' }, { def: flag('fiber') });
const fatRaw = flag('fat');
const satFatRaw = flag('satfat');
const note = await ask({ q: 'Short tasting note', flag: 'note' }, { def: flag('note') });
const servingDesc = flag('serving-desc');
const emoji = flag('emoji') || '🥣';
const boxColor = flag('color') || '#c98d4e';
const formFactors = pickList(flag('form'), FORM_FACTORS, 'form factor');
const proteinSources = pickList(flag('protein-src'), PROTEIN_SOURCES, 'protein source');
const attributes = pickList(flag('attrs'), ATTRIBUTES, 'attribute');
rl?.close();

// --- validate -----------------------------------------------------------------
const rating = num(ratingRaw);
if (ratingRaw && (rating == null || rating < 0 || rating > 10)) fail(`rating "${ratingRaw}" must be a number 0–10 (or blank)`);
const serving = num(servingRaw);
if (serving == null || serving <= 0) fail(`serving size "${servingRaw}" must be a positive number of grams`);

const slug = slugify(brand, name);
if (!slug) fail(`could not derive a filename from "${brand} ${name}"`);
const file = `${slug}.md`;
if (existsSync(join(CEREALS, file))) fail(`${file} already exists — edit it in Keystatic, or delete it first`);

// --- write the markdown -------------------------------------------------------
// Full nutrition field set (nulls where unknown) so enrichment can fill each blank.
const today = new Date().toISOString().slice(0, 10);
const lines = ['---'];
lines.push(`name: ${q(name)}`);
lines.push(`brand: ${q(brand)}`);
lines.push(`rating: ${rating == null ? 'null' : rating}`);
if (note) lines.push(`shortNote: ${q(note)}`);
lines.push(`dateReviewed: ${today}`);
lines.push(`emoji: ${q(emoji)}`);
lines.push(`boxColor: ${q(boxColor)}`);
lines.push(`formFactors: [${formFactors.join(', ')}]`);
lines.push(`proteinSources: [${proteinSources.join(', ')}]`);
lines.push(`attributes: [${attributes.join(', ')}]`);
lines.push('nutrition:');
lines.push(`  servingSize: ${serving}`);
if (servingDesc) lines.push(`  servingDescription: ${q(servingDesc)}`);
const nutRows = {
  calories: null,
  totalFat: num(fatRaw),
  saturatedFat: num(satFatRaw),
  transFat: null,
  polyunsaturatedFat: null,
  monounsaturatedFat: null,
  totalCarbs: null,
  dietaryFiber: num(fiberRaw),
  totalSugars: num(sugarsRaw),
  addedSugars: null,
  protein: num(proteinRaw),
  proteinDV: null,
  sodium: null,
};
for (const [k, v] of Object.entries(nutRows)) lines.push(`  ${k}: ${v == null ? 'null' : v}`);
lines.push('---');
lines.push('');

mkdirSync(CEREALS, { recursive: true });
writeFileSync(join(CEREALS, file), lines.join('\n') + '\n');
console.log(`\n✓ Created src/content/cereals/${file}`);
console.log(`  ${brand} ${name} · ${rating == null ? 'unrated' : rating + '/10'} · ${serving}g serving`);

// --- pull nutrition -----------------------------------------------------------
if (NO_ENRICH) {
  console.log('\nSkipped nutrition lookup (--no-enrich). Run `npm run enrich` later to backfill.');
  process.exit(0);
}

const cereal = readCereal(file);
const recorded = [cereal.protein, cereal.totalSugars, cereal.dietaryFiber].filter((v) => v != null).length;
if (recorded < 2) {
  console.log(
    '\n⚠ Only ' + recorded + ' of protein/sugar/fiber recorded — not enough to safely verify an\n' +
    '  automatic match, so nutrition was left blank. Add those numbers and run\n' +
    '  `npm run enrich` to backfill once it can cross-check the source.'
  );
  process.exit(0);
}

console.log('\nLooking up nutrition on Open Food Facts' + (USE_USDA ? ' + USDA' : '') + '…');
const { primary, conf, meetsBar } = await enrichCereal(cereal, { fdcKey: FDC_KEY, useUsda: USE_USDA });

if (!primary) {
  console.log(
    '  No match found (the exact product may not be in the databases, or the\n' +
    '  sources were unreachable). The cereal was still added with your numbers —\n' +
    '  try `npm run enrich` again later.'
  );
  process.exit(0);
}

const srcLabel = primary.source === 'usda_fdc' ? 'USDA' : 'Open Food Facts';
if (meetsBar && !REVIEW) {
  const { filledImage } = await applyDraft(cereal, primary);
  console.log(`\n✓ Auto-filled from ${srcLabel}: “${primary.matchedName}”`);
  const filled = ['calories', 'saturatedFat', 'transFat', 'addedSugars', 'sodium']
    .filter((k) => primary[k] != null)
    .map((k) => `${k}=${primary[k]}`);
  if (filled.length) console.log(`  ${filled.join('  ')}`);
  console.log(`  box photo: ${filledImage ? 'downloaded ✓' : 'none available'}`);
  console.log('\nDone. Review it in Keystatic (npm run dev) or the markdown file if you like.');
} else {
  // Not confident enough to auto-apply — leave a draft for the confirm step.
  mkdirSync(DRAFTS, { recursive: true });
  writeFileSync(
    join(DRAFTS, `${slug}.json`),
    JSON.stringify(
      {
        slug,
        recorded: { protein: cereal.protein, totalSugars: cereal.totalSugars, dietaryFiber: cereal.dietaryFiber, servingSize: cereal.servingSize },
        confidence: conf,
        nameMatch: nameMatch(cereal, primary),
        approved: false,
        draft: primary,
      },
      null,
      2
    )
  );
  const why = REVIEW ? 'held for review (--review)' : `not confident enough to auto-apply (${conf})`;
  console.log(`\n⚠ Found a possible match on ${srcLabel} but ${why}:`);
  console.log(`  “${primary.matchedName}” — ${primary.url}`);
  console.log(`  Draft saved to enrichment/${slug}.json.`);
  console.log('  If it’s right: set "approved": true in that file, then `npm run enrich:apply`.');
}
