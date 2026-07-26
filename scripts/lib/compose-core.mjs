// Turning a picked search result into a cereal file. Shared by:
//   scripts/find.mjs   — the CLI search-and-add flow
//   src/admin/         — the dev-only web admin, same flow in a browser
//
// Everything here is the part that happens AFTER a human has confirmed which
// product they're looking at: splitting the brand off the product name,
// guessing tags, and composing the markdown. The lookup itself lives in
// enrich-core.mjs and the image pipeline in image-core.mjs.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CEREALS, readTaxonomy, guard } from './enrich-core.mjs';
import { loadImage, normalizeBoxImage } from './image-core.mjs';

export const IMAGES = join(ROOT, 'public', 'images', 'cereals');

// --- brand / product split ----------------------------------------------------
// OFF keeps the brand in its own field but often repeats it in the product name
// ("Magic Spoon Peanut Butter"); USDA jams both into one uppercase description
// as "BRAND, PRODUCT". Split it so the site's brand line and box label read
// properly.

// Short all-caps tokens are acronyms the catalog keeps as-is (KIND, IKEA);
// longer shouty ones are just USDA's formatting.
export function titleCase(s) {
  return s.replace(/[\w’']+/g, (w) =>
    (w === w.toUpperCase() && w.length <= 4 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())
  );
}

const LEGAL_SUFFIX = /[\s,]+(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|co|co\.|company|ltd|ltd\.|limited|plc|gmbh|s\.a\.)$/i;

export function splitBrandName(picked) {
  let brand = (picked.matchedBrand || '').split(',')[0].trim();
  while (LEGAL_SUFFIX.test(brand)) brand = brand.replace(LEGAL_SUFFIX, '').trim();
  if (brand === brand.toUpperCase()) brand = titleCase(brand);

  let name = picked.matchedName || '';
  if (name === name.toUpperCase()) name = titleCase(name);

  // "BRAND, PRODUCT NAME" — drop the leading segment when it's the brand
  // rather than part of the product's actual name.
  const brandWords = new Set(brand.toLowerCase().match(/[a-z0-9]+/g) || []);
  const comma = name.indexOf(',');
  if (comma > 0) {
    const head = name.slice(0, comma).toLowerCase().match(/[a-z0-9]+/g) || [];
    if (head.length && head.every((w) => brandWords.has(w))) name = name.slice(comma + 1).trim();
  }
  if (brand) {
    name = name.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,-]+`, 'i'), '').trim();
  }
  // Every product here is a cereal, and the catalog names read "Peanut Butter",
  // not "Peanut Butter Cereal" — drop the redundant tail unless it's the name.
  name = name.replace(/\s+cereal\s*$/i, '').trim() || name;
  name = name.replace(/\s*,\s*$/, '').replace(/\s+/g, ' ').trim() || picked.matchedName;

  return { brand, name };
}

// --- tag inference ------------------------------------------------------------
// Best-effort only. Callers surface the result so a wrong guess is visible and
// editable rather than silently baked into the file.
export function inferTags(picked, brand, name) {
  const { FORM_FACTORS, PROTEIN_SOURCES, ATTRIBUTES } = readTaxonomy();
  const keep = (vals, allowed) => (allowed ? vals.filter((v) => allowed.includes(v)) : vals);
  const haystack = `${brand} ${name} ${picked.ingredients || ''} ${(picked.labels || []).join(' ')}`.toLowerCase();
  const hasLabel = (frag) => (picked.labels || []).some((l) => l.includes(frag));

  const formMap = {
    granola: /granola/, flakes: /flake/, clusters: /cluster/, puffs: /puff/,
    squares: /square/, shredded: /shredded/, biscuits: /biscuit/, muesli: /muesli/,
    oats: /\boat(meal|s)?\b/, crisps: /crisp/, os: /\b(o's|os|cheerio|loops|rings)\b/,
  };
  const formFactors = keep(
    Object.entries(formMap).filter(([, re]) => re.test(haystack)).map(([k]) => k),
    FORM_FACTORS
  );

  const sources = [];
  if (/pea protein/.test(haystack)) sources.push('pea-protein');
  if (/milk protein|casein/.test(haystack)) sources.push('milk-protein');
  if (/whey/.test(haystack)) sources.push('whey');
  if (/soy protein/.test(haystack)) sources.push('soy');
  if (/almond|peanut|cashew|pecan|walnut|hemp|chia|flax|pumpkin seed|sunflower seed/.test(haystack)) sources.push('nut-seed');
  const proteinSources = keep(sources, PROTEIN_SOURCES);

  const attrs = [];
  if (picked.protein != null && picked.protein >= 10) attrs.push('high-protein');
  if (picked.dietaryFiber != null && picked.dietaryFiber >= 5) attrs.push('high-fiber');
  if (picked.totalSugars != null && picked.totalSugars <= 5) attrs.push('low-sugar');
  if (picked.addedSugars === 0 || /no added sugar/.test(haystack)) attrs.push('no-added-sugar');
  if (/\borganic\b/.test(haystack) || hasLabel('organic')) attrs.push('organic');
  if (/gluten[\s-]?free/.test(haystack) || hasLabel('gluten-free')) attrs.push('gluten-free');
  if (hasLabel('vegan')) attrs.push('vegan');
  if (/grain[\s-]?free/.test(haystack)) attrs.push('grain-free');
  if (/\bketo\b/.test(haystack)) attrs.push('keto');
  const attributes = keep([...new Set(attrs)], ATTRIBUTES);

  return { formFactors, proteinSources, attributes };
}

// --- file composition ---------------------------------------------------------
// Same slug rule as add.mjs / migrate-notion.mjs, so filenames stay consistent.
export function slugify(brand, name) {
  return `${brand} ${name}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Quote a YAML scalar only when needed (mirrors migrate-notion.mjs `q`).
export function yamlQuote(s) {
  const str = String(s);
  if (/^[\u{1F000}-\u{1FFFF}☀-➿]/u.test(str)) return `'${str}'`;
  if (/[:#'"[\]{}&*!|>%@`]/.test(str) || /^\s|\s$/.test(str) || str === '') return JSON.stringify(str);
  return str;
}

export function cerealExists(slug) {
  return existsSync(join(CEREALS, `${slug}.md`));
}

// The per-serving fields a picked candidate contributes, in schema order.
// proteinDV is deliberately absent: it's only on a label when a protein claim
// is made, so it stays "not listed" rather than being inferred.
export function nutritionFrom(picked) {
  return {
    calories: picked.calories ?? null,
    totalFat: picked.totalFat ?? null,
    saturatedFat: picked.saturatedFat ?? null,
    transFat: picked.transFat ?? null,
    polyunsaturatedFat: picked.polyunsaturatedFat ?? null,
    monounsaturatedFat: picked.monounsaturatedFat ?? null,
    totalCarbs: picked.totalCarbs ?? null,
    dietaryFiber: picked.dietaryFiber ?? null,
    totalSugars: picked.totalSugars ?? null,
    addedSugars: picked.addedSugars ?? null,
    protein: picked.protein ?? null,
    proteinDV: null,
    sodium: picked.sodium ?? null,
  };
}

// Drop implausible (per-container) values. Picking the right product doesn't
// make its numbers right, so this runs on the web path too.
export function sanitize(picked) {
  guard(picked, { servingSize: picked.servingSize, totalSugars: picked.totalSugars });
  return picked.flags || [];
}

// Compose the markdown. Key order matches the existing catalog:
// name, brand, rating, shortNote, dates, emoji, boxColor, barcode, image keys,
// tags, then the nutrition block.
/**
 * @param {{
 *   brand: string,
 *   name: string,
 *   rating?: number | null,
 *   note?: string,
 *   picked: any,
 *   slug: string,
 *   formFactors?: string[],
 *   proteinSources?: string[],
 *   attributes?: string[],
 *   emoji?: string,
 *   boxColor?: string,
 *   hasImage?: boolean,
 *   imageSource?: string,
 *   imageCredit?: string,
 *   date?: string,
 * }} opts
 */
export function cerealMarkdown({
  brand, name, rating = null, note = '', picked, slug,
  formFactors = [], proteinSources = [], attributes = [],
  emoji = '🥣', boxColor = '#c98d4e', hasImage = false, imageSource, imageCredit,
  date = new Date().toISOString().slice(0, 10),
}) {
  const lines = ['---'];
  lines.push(`name: ${yamlQuote(name)}`);
  lines.push(`brand: ${yamlQuote(brand)}`);
  lines.push(`rating: ${rating == null ? 'null' : rating}`);
  if (note) lines.push(`shortNote: ${yamlQuote(note)}`);
  lines.push(`dateReviewed: ${date}`);
  lines.push(`emoji: ${yamlQuote(emoji)}`);
  lines.push(`boxColor: ${yamlQuote(boxColor)}`);
  if (picked.barcode) lines.push(`barcode: '${picked.barcode}'`);
  if (hasImage) {
    lines.push(`boxImage: /images/cereals/${slug}.jpg`);
    lines.push(`imageSource: ${imageSource || 'open_food_facts'}`);
    if (imageCredit) lines.push(`imageCredit: ${JSON.stringify(imageCredit)}`);
  }
  lines.push(`formFactors: [${formFactors.join(', ')}]`);
  lines.push(`proteinSources: [${proteinSources.join(', ')}]`);
  lines.push(`attributes: [${attributes.join(', ')}]`);
  lines.push('nutrition:');
  lines.push(`  servingSize: ${picked.servingSize}`);
  if (picked.servingDescription) lines.push(`  servingDescription: ${yamlQuote(picked.servingDescription)}`);
  for (const [k, v] of Object.entries(nutritionFrom(picked))) {
    lines.push(`  ${k}: ${v == null ? 'null' : v}`);
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n') + '\n';
}

// --- images -------------------------------------------------------------------
// OFF serves a downscaled front by default (…front_en.4.400.jpg). The full-size
// original is the same path with `full` in place of the pixel width, and it's
// what we want before trimming and re-encoding.
export function offFullSize(url) {
  return typeof url === 'string' ? url.replace(/\.(\d+)\.(\d+)\.jpg$/i, '.$1.full.jpg') : url;
}

// Fetch and normalize a box photo, preferring the full-size original and
// falling back to whatever URL was given.
export async function prepareImage(url, { fit = 'cover' } = {}) {
  const tries = [...new Set([offFullSize(url), url])];
  let lastErr;
  for (const candidate of tries) {
    try {
      const input = await loadImage(candidate);
      const result = await normalizeBoxImage(input, { trim: true, fit });
      return { ...result, url: candidate };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`could not load ${url}`);
}

export function writeCereal({ slug, markdown, imageBuffer }) {
  mkdirSync(CEREALS, { recursive: true });
  writeFileSync(join(CEREALS, `${slug}.md`), markdown);
  if (imageBuffer) {
    mkdirSync(IMAGES, { recursive: true });
    writeFileSync(join(IMAGES, `${slug}.jpg`), imageBuffer);
  }
}
