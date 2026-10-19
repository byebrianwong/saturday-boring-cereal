// Set a cereal's ingredient list. The detail page prints it under the
// Nutrition Facts panel, with the source in small print.
//
//   npm run ingredients -- --all                       # every cereal with a barcode and no list yet
//   npm run ingredients natures-path-heritage-flakes   # one cereal, from Open Food Facts by barcode
//   npm run ingredients kodiak --text "Oats, ..." --source "kodiakcakes.com — https://..."
//
// Open Food Facts lists are typed in by volunteers from the box, so they are
// credited and linked for checking. A cereal Open Food Facts has no list for
// stays unset, and the page says "not listed". Copy the list from the maker's
// page by hand with --text and --source.
//
// Flags:
//   --all          look up every cereal that has a barcode and no ingredients yet
//   --force        replace a list that is already set
//   --text "…"     the list, copied as printed
//   --source "…"   where it was copied from (required with --text)
//   --none         remove the list from this cereal
//   --dry-run      report what it would do, write nothing

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CEREALS, UA, sleep } from './lib/enrich-core.mjs';
import { cleanIngredients, parseCereal, updateFrontmatter } from './lib/compose-core.mjs';

// --- args ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const flagsWithValues = new Set(['text', 'source']);
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (flagsWithValues.has(a.slice(2))) i++;
    continue;
  }
  pos.push(a);
}

const ALL = has('--all');
const FORCE = has('--force');
const CLEAR = has('--none');
const DRY = has('--dry-run');
const TEXT = flag('text');
const SOURCE = flag('source');

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

if (!ALL && !pos[0]) fail('usage: npm run ingredients <slug> [--text "…" --source "…"]   (or: npm run ingredients -- --all)');
if (TEXT && !SOURCE) fail('--text needs --source, so the page can say where the list came from');

// --- cereals ------------------------------------------------------------------
const slugs = readdirSync(CEREALS).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));

function resolveSlug(input) {
  if (slugs.includes(input)) return input;
  const needle = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hits = slugs.filter((s) => s.includes(needle));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`"${input}" matches ${hits.length} cereals:\n  ${hits.join('\n  ')}`);
  fail(`no cereal matches "${input}". Slugs live in src/content/cereals/.`);
}

const fileOf = (slug) => join(CEREALS, `${slug}.md`);

function write(slug, ingredients, source) {
  const raw = readFileSync(fileOf(slug), 'utf8');
  const next = updateFrontmatter(raw, { top: { ingredients, ingredientsSource: source } });
  if (DRY) {
    console.log(`[dry-run] ${slug}: ${ingredients == null ? 'would remove the list' : ingredients.slice(0, 90) + '…'}`);
    return;
  }
  writeFileSync(fileOf(slug), next);
  console.log(`✓ ${slug}${ingredients == null ? ': list removed' : ''}`);
}

// --- Open Food Facts ----------------------------------------------------------
// The English list when there is one, else whatever language the product has.
// Retries the "busy" statuses: OFF rate-limits bursts of product lookups.
async function offIngredients(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,ingredients_text,ingredients_text_en`;
  const RETRYABLE = new Set([429, 502, 503, 504]);
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok || !RETRYABLE.has(res.status)) break;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts HTTP ${res.status}`);
  const p = (await res.json()).product || {};
  return cleanIngredients(p.ingredients_text_en || p.ingredients_text);
}

async function fromOff(slug) {
  const { barcode } = parseCereal(readFileSync(fileOf(slug), 'utf8'));
  if (!barcode) return 'no barcode';
  const text = await offIngredients(barcode);
  if (!text) return `Open Food Facts has no ingredient list for ${barcode}`;
  write(slug, text, `Open Food Facts contributors, CC-BY-SA — https://world.openfoodfacts.org/product/${barcode}`);
  return null;
}

// --- run ----------------------------------------------------------------------
if (ALL) {
  const skipped = [];
  for (const slug of slugs) {
    if (!FORCE && parseCereal(readFileSync(fileOf(slug), 'utf8')).ingredients) continue;
    try {
      const why = await fromOff(slug);
      if (why) skipped.push(`${slug}: ${why}`);
    } catch (e) {
      skipped.push(`${slug}: ${e.message}`);
    }
    await sleep(700); // stay under OFF's burst limit
  }
  if (skipped.length) console.log(`\nNo list set for ${skipped.length}:\n  ${skipped.join('\n  ')}`);
  process.exit(0);
}

const slug = resolveSlug(pos[0]);

if (CLEAR) {
  write(slug, null, null);
} else if (TEXT) {
  const text = cleanIngredients(TEXT);
  if (!text) fail('--text is empty');
  write(slug, text, SOURCE);
} else {
  const current = parseCereal(readFileSync(fileOf(slug), 'utf8')).ingredients;
  if (current && !FORCE) fail(`${slug} already has a list. Add --force to replace it.`);
  const why = await fromOff(slug);
  if (why) fail(`${why}. Copy it from the maker's page with --text and --source.`);
}
