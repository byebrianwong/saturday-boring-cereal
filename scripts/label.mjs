// Set a cereal's Nutrition Facts label photo. The detail page shows it,
// collapsed, next to the stored per-serving numbers so they can be checked by eye.
//
//   npm run label natures-path-heritage-flakes                 # from Open Food Facts, by barcode
//   npm run label natures-path-heritage-flakes ./label.jpg     # from a file or URL
//   npm run label -- --all                                     # every cereal with a barcode and no photo yet
//
// Open Food Facts keeps a "selected" nutrition photo per product, already
// cropped and rotated by its contributors. This takes the full-size version,
// fixes EXIF rotation, caps it at 1400px on the long side (enough to read the
// small print) and writes public/images/labels/<slug>.jpg, then sets
// labelImage / labelCredit in the frontmatter.
//
// Flags:
//   --all        fetch from Open Food Facts for every cereal that has a barcode
//                and no labelImage yet
//   --force      with --all, replace existing label photos too
//   --credit "…" credit line for a file or URL you supply
//   --none       remove the label photo from this cereal
//   --dry-run    report what it would do, write nothing

import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT, CEREALS, UA, sleep } from './lib/enrich-core.mjs';
import { loadImage } from './lib/image-core.mjs';
import { offFullSize } from './lib/compose-core.mjs';

const LABELS = join(ROOT, 'public', 'images', 'labels');
const MAX_SIDE = 1400;

// --- args ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const flagsWithValues = new Set(['credit']);
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
const [slugArg, srcArg] = pos;

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

if (!ALL && !slugArg) {
  fail('usage: npm run label <slug> [image-url|file]   (or: npm run label -- --all)');
}

// --- cereals and frontmatter --------------------------------------------------
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
const field = (md, key) => md.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].replace(/^['"]|['"]$/g, '') || null;

// Update keys in place; insert missing ones after `barcode:` (or `boxColor:`
// when there is no barcode), so the label fields sit next to the barcode
// they were looked up by.
function upsertFields(src, pairs) {
  let out = src;
  const missing = [];
  for (const [key, value] of pairs) {
    const re = new RegExp(`^${key}:.*$`, 'm');
    const line = `${key}: ${value}`;
    if (re.test(out)) out = out.replace(re, line);
    else missing.push(line);
  }
  if (missing.length) {
    const anchor = /^barcode:.*$/m.test(out) ? /^(barcode:.*$)/m : /^(boxColor:.*$)/m;
    out = out.replace(anchor, `$1\n${missing.join('\n')}`);
  }
  return out;
}
const removeField = (src, key) => src.replace(new RegExp(`^${key}:.*\\n`, 'm'), '');

// --- Open Food Facts ----------------------------------------------------------
// Returns the selected nutrition photo's URL, or null when the product has none.
// Retries the "busy" statuses: OFF rate-limits bursts of product lookups.
async function offNutritionImage(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,image_nutrition_url`;
  const RETRYABLE = new Set([429, 502, 503, 504]);
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok || !RETRYABLE.has(res.status)) break;
  }
  if (res.status === 404) return { image: null, page: null };
  if (!res.ok) throw new Error(`Open Food Facts HTTP ${res.status}`);
  const j = await res.json();
  return {
    image: j.product?.image_nutrition_url || null,
    page: `https://world.openfoodfacts.org/product/${barcode}`,
  };
}

// --- image --------------------------------------------------------------------
// No trimming or cropping: a label photo is evidence, so keep all of it.
async function prepareLabel(src) {
  const tries = /^https?:\/\//.test(src) ? [...new Set([offFullSize(src), src])] : [src];
  let lastErr;
  for (const candidate of tries) {
    try {
      const input = await loadImage(candidate);
      const out = await sharp(input)
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const meta = await sharp(out).metadata();
      return { out, width: meta.width, height: meta.height, url: candidate };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function setLabel(slug, src, credit) {
  const file = fileOf(slug);
  const md = readFileSync(file, 'utf8');
  const { out, width, height } = await prepareLabel(src);
  const rel = `/images/labels/${slug}.jpg`;
  if (DRY) {
    console.log(`[dry-run] ${slug}: ${width}x${height}, ${(out.length / 1024).toFixed(0)}KB → public${rel}`);
    return;
  }
  mkdirSync(LABELS, { recursive: true });
  writeFileSync(join(LABELS, `${slug}.jpg`), out);
  const fields = [['labelImage', rel]];
  if (credit) fields.push(['labelCredit', JSON.stringify(credit)]);
  let next = upsertFields(md, fields);
  if (!credit) next = removeField(next, 'labelCredit');
  writeFileSync(file, next);
  console.log(`✓ ${slug}: ${width}x${height}, ${(out.length / 1024).toFixed(0)}KB`);
}

async function fromOff(slug) {
  const md = readFileSync(fileOf(slug), 'utf8');
  const barcode = field(md, 'barcode');
  if (!barcode) return 'no barcode';
  const { image, page } = await offNutritionImage(barcode);
  if (!image) return `Open Food Facts has no label photo for ${barcode}`;
  await setLabel(slug, image, `Label photo: Open Food Facts contributors, CC-BY-SA — ${page}`);
  return null;
}

// --- run ----------------------------------------------------------------------
if (ALL) {
  const skipped = [];
  for (const slug of slugs) {
    const md = readFileSync(fileOf(slug), 'utf8');
    if (!FORCE && field(md, 'labelImage')) continue;
    try {
      const why = await fromOff(slug);
      if (why) skipped.push(`${slug}: ${why}`);
    } catch (e) {
      skipped.push(`${slug}: ${e.message}`);
    }
    await sleep(700); // stay under OFF's burst limit
  }
  if (skipped.length) console.log(`\nNo label photo set for ${skipped.length}:\n  ${skipped.join('\n  ')}`);
  process.exit(0);
}

const slug = resolveSlug(slugArg);

if (CLEAR) {
  if (DRY) {
    console.log(`[dry-run] ${slug}: would remove labelImage/labelCredit and the photo`);
    process.exit(0);
  }
  writeFileSync(fileOf(slug), removeField(removeField(readFileSync(fileOf(slug), 'utf8'), 'labelImage'), 'labelCredit'));
  const img = join(LABELS, `${slug}.jpg`);
  if (existsSync(img)) unlinkSync(img);
  console.log(`✓ ${slug}: removed label photo`);
  process.exit(0);
}

try {
  if (srcArg) {
    const host = /^https?:\/\//.test(srcArg) ? new URL(srcArg).hostname.replace(/^www\./, '') : null;
    await setLabel(slug, srcArg, flag('credit') || (host ? `Label photo: ${host}` : null));
  } else {
    const why = await fromOff(slug);
    if (why) fail(`${slug}: ${why}. Pass a photo: npm run label ${slug} <url|file>`);
  }
} catch (e) {
  fail(e.message);
}
