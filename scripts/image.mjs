// Set a cereal's box photo from a URL (or a local file) and normalize it for
// the 3D box.
//
//   npm run image natures-path-heritage-flakes https://…/front.png
//   npm run image "heritage flakes" ./downloads/box.png --source manufacturer
//
// The site renders `boxImage` as the FRONT FACE of a CSS 3D box that already
// applies its own rotateY(-20deg) perspective. So the source must be a flat,
// straight-on, dead-center package front — not a 3/4 "packshot" render (which
// reads as a box inside a box) and not an Open Food Facts user snapshot (hands,
// tables, tilt). Manufacturer sites are the best source; most run Shopify, so
//   …/cdn/shop/files/<name>.png?width=2000
// gives a transparent flat front. Retailer fallbacks: Kroger
// product/images/xlarge/front/<upc>, Amazon _SL1600_. Avoid Target's main image
// (angled).
//
// Pipeline: download → trim margins → flatten onto white → fit to the 240x320
// face ratio → 900px wide JPEG → public/images/cereals/<slug>.jpg, then write
// boxImage / imageSource / imageCredit into the frontmatter.
//
// Flags:
//   --source <manufacturer|other|own_photo|open_food_facts>   default: other
//   --credit "Image: Nature's Path (naturespath.com)"         default: from the host
//   --fit <cover|contain>   cover (default) crops to fill the face; contain pads
//                           onto white so a tall bag keeps its top and bottom
//   --no-trim               keep the original margins
//   --none                  no good front exists: clear boxImage and set
//                           noAutoImage so enrichment can't add an angled one
//   --dry-run               report what it would do, write nothing

import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT, CEREALS, UA } from './lib/enrich-core.mjs';

// The box face is 240x320 in the design; 900px wide keeps it crisp on retina.
const FACE_RATIO = 240 / 320;
const OUT_WIDTH = 900;
const OUT_HEIGHT = Math.round(OUT_WIDTH / FACE_RATIO);
const IMAGES = join(ROOT, 'public', 'images', 'cereals');

// --- args ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
// Positionals are the non-flag args that aren't some flag's value.
const flagsWithValues = new Set(['source', 'credit', 'fit']);
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (flagsWithValues.has(a.slice(2))) i++; // skip its value
    continue;
  }
  pos.push(a);
}

const CLEAR = has('--none');
const DRY = has('--dry-run');
const TRIM = !has('--no-trim');
const FIT = flag('fit') || 'cover';
const [slugArg, srcArg] = pos;

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

if (!slugArg) {
  fail('usage: npm run image <slug> <image-url|file>   (or: npm run image <slug> --none)');
}
if (!['cover', 'contain'].includes(FIT)) fail(`--fit must be cover or contain (got "${FIT}")`);
if (!CLEAR && !srcArg) fail('missing the image URL or file path (or pass --none if no good front exists)');

// --- resolve the cereal -------------------------------------------------------
// Accept an exact slug, or anything that uniquely identifies one ("heritage flakes").
function resolveSlug(input) {
  const files = readdirSync(CEREALS).filter((f) => f.endsWith('.md'));
  const slugs = files.map((f) => f.replace(/\.md$/, ''));
  if (slugs.includes(input)) return input;
  const needle = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hits = slugs.filter((s) => s.includes(needle));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`"${input}" matches ${hits.length} cereals:\n  ${hits.join('\n  ')}`);
  fail(`no cereal matches "${input}". Slugs live in src/content/cereals/.`);
}

const slug = resolveSlug(slugArg);
const file = join(CEREALS, `${slug}.md`);
const md = readFileSync(file, 'utf8');
const outFile = join(IMAGES, `${slug}.jpg`);

// --- frontmatter editing ------------------------------------------------------
// Update the keys that already exist in place, and insert the rest as one block
// after boxColor — the same anchor the enrichment writer uses, so field order
// stays consistent across the catalog. Takes them together rather than one at a
// time so inserted keys keep the order they're listed in, not reversed.
function upsertFields(src, pairs) {
  let out = src;
  const missing = [];
  for (const [key, value] of pairs) {
    const re = new RegExp(`^${key}:.*$`, 'm');
    const line = `${key}: ${value}`;
    if (re.test(out)) out = out.replace(re, line);
    else missing.push(line);
  }
  if (missing.length) out = out.replace(/^(boxColor:.*$)/m, `$1\n${missing.join('\n')}`);
  return out;
}
function removeField(src, key) {
  return src.replace(new RegExp(`^${key}:.*\\n`, 'm'), '');
}

// --- --none: clear the image and lock out auto-added ones ---------------------
if (CLEAR) {
  let out = removeField(removeField(removeField(md, 'boxImage'), 'imageSource'), 'imageCredit');
  out = upsertFields(out, [['noAutoImage', 'true']]);
  if (DRY) {
    console.log(`[dry-run] ${slug}: would clear boxImage/imageSource/imageCredit and set noAutoImage: true`);
    process.exit(0);
  }
  writeFileSync(file, out);
  if (existsSync(outFile)) unlinkSync(outFile);
  console.log(`✓ ${slug}: cleared box photo, set noAutoImage: true (emoji placeholder stays)`);
  process.exit(0);
}

// --- fetch --------------------------------------------------------------------
async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { 'User-Agent': UA } });
    if (!res.ok) fail(`fetch failed: ${res.status} ${res.statusText} — ${src}`);
    const type = res.headers.get('content-type') || '';
    if (!/^image\//.test(type)) fail(`that URL returned ${type || 'no content-type'}, not an image — ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!existsSync(src)) fail(`no such file: ${src}`);
  return readFileSync(src);
}

const input = await load(srcArg);

// --- normalize ----------------------------------------------------------------
let pipe = sharp(input);
const before = await pipe.metadata();
if (TRIM) pipe = pipe.trim();
// Flatten first: trimming a transparent PNG then flattening keeps the margins
// tight, and JPEG can't carry alpha anyway.
pipe = pipe.flatten({ background: '#ffffff' });

const trimmed = await pipe.toBuffer({ resolveWithObject: true });
const t = trimmed.info;

// How much would a cover crop discard? A tall bag loses its top and bottom.
const srcRatio = t.width / t.height;
const lost = srcRatio > FACE_RATIO
  ? { axis: 'sides', pct: Math.round((1 - FACE_RATIO / srcRatio) * 100) }
  : { axis: 'top and bottom', pct: Math.round((1 - srcRatio / FACE_RATIO) * 100) };

const out = await sharp(trimmed.data)
  .resize(OUT_WIDTH, OUT_HEIGHT, { fit: FIT, position: 'center', background: '#ffffff' })
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();

// --- credit -------------------------------------------------------------------
const host = /^https?:\/\//.test(srcArg) ? new URL(srcArg).hostname.replace(/^www\./, '') : null;
const source = flag('source') || (host && /openfoodfacts/.test(host) ? 'open_food_facts' : host ? 'other' : 'own_photo');
if (!['manufacturer', 'other', 'own_photo', 'open_food_facts'].includes(source)) {
  fail(`--source must be manufacturer, other, own_photo or open_food_facts (got "${source}")`);
}
const credit = flag('credit') || (host ? `Image: ${host}` : null);

if (DRY) {
  console.log(`[dry-run] ${slug}`);
  console.log(`  source     ${before.width}x${before.height} ${before.format}`);
  console.log(`  trimmed    ${t.width}x${t.height}${TRIM ? '' : ' (--no-trim)'}`);
  console.log(`  output     ${OUT_WIDTH}x${OUT_HEIGHT} jpeg, fit=${FIT}, ${(out.length / 1024).toFixed(0)}KB`);
  if (FIT === 'cover' && lost.pct > 0) console.log(`  cover crop discards ~${lost.pct}% off the ${lost.axis}`);
  console.log(`  would write ${outFile.replace(ROOT + '/', '')}`);
  console.log(`  imageSource: ${source}${credit ? `\n  imageCredit: ${credit}` : ''}`);
  process.exit(0);
}

mkdirSync(IMAGES, { recursive: true });
const replaced = existsSync(outFile);
writeFileSync(outFile, out);

const fields = [
  ['boxImage', `/images/cereals/${slug}.jpg`],
  ['imageSource', source],
];
if (credit) fields.push(['imageCredit', JSON.stringify(credit)]);
let next = upsertFields(md, fields);
// It has a real front now, so the "no good front exists" marker no longer holds.
next = removeField(next, 'noAutoImage');
writeFileSync(file, next);

console.log(`✓ ${slug}: ${replaced ? 'replaced' : 'added'} box photo`);
console.log(`  ${before.width}x${before.height} → trimmed ${t.width}x${t.height} → ${OUT_WIDTH}x${OUT_HEIGHT} (${(out.length / 1024).toFixed(0)}KB, fit=${FIT})`);
console.log(`  public/images/cereals/${slug}.jpg · imageSource: ${source}`);
if (FIT === 'cover' && lost.pct >= 25) {
  console.log(`\n⚠ The cover crop discarded ~${lost.pct}% off the ${lost.axis} — tall bags lose their`);
  console.log('  top and bottom this way. Re-run with --fit contain to pad onto white instead.');
}
if (source === 'other' && host) {
  console.log(`\n  Credited as "${credit}". If ${host} is the brand's own site, re-run with`);
  console.log('  --source manufacturer (or set it in Keystatic) so the credit is accurate.');
}
