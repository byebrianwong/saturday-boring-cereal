// Turning a picked search result into a cereal file. Shared by:
//   scripts/find.mjs   — the CLI search-and-add flow
//   src/admin/         — the dev-only web admin, same flow in a browser
//
// Everything here is the part that happens AFTER a human has confirmed which
// product they're looking at: splitting the brand off the product name,
// guessing tags, and composing the markdown. The lookup itself lives in
// enrich-core.mjs and the image pipeline in image-core.mjs.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CEREALS, readTaxonomy, guard, NUTRITION_ORDER } from './enrich-core.mjs';
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

// --- editing an existing cereal -----------------------------------------------
// The add path composes a whole file; editing has to do the opposite — change
// the handful of lines you touched and leave everything else byte-for-byte
// alone, including the review body and any key this tool doesn't know about.
// That rules out parse-then-reserialize (which silently drops what it didn't
// model) in favour of a line-level edit, the same approach upsertNutrition and
// image.mjs already take.

// Frontmatter key order, matching what the catalog already uses. Only consulted
// when a key is absent and has to be inserted.
const TOP_ORDER = [
  'name', 'brand', 'rating', 'shortNote', 'dateReviewed', 'dateUpdated',
  'emoji', 'boxColor', 'barcode', 'boxImage', 'imageSource', 'imageCredit',
  'noAutoImage', 'purchaseLocation', 'price', 'formFactors', 'proteinSources',
  'attributes',
];

// Keys that vanish from the file when cleared, rather than being written as
// `null`. `rating` is deliberately NOT one of them: the schema is .nullable()
// and an unrated cereal is a real state the site renders as "unrated".
const OPTIONAL_TOP = new Set([
  'shortNote', 'dateUpdated', 'barcode', 'boxImage', 'imageSource',
  'imageCredit', 'noAutoImage', 'purchaseLocation', 'price',
]);

const ALWAYS_QUOTED = new Set(['barcode']); // a leading zero must survive YAML

function serializeValue(key, value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (ALWAYS_QUOTED.has(key)) return `'${String(value).replace(/'/g, "''")}'`;
  return yamlQuote(value);
}

function splitFile(raw) {
  const lines = raw.split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  return { head: lines.slice(1, end), body: lines.slice(end + 1) };
}

/**
 * Rewrite selected frontmatter keys, leaving every other line untouched.
 *
 * `top` and `nutrition` map key → new value. A key you don't mention is not
 * touched. For `top`, `null` removes an OPTIONAL_TOP key and writes `null` for
 * the rest; for `nutrition`, `null` always writes `null`, since those fields
 * are nullable by design and "not listed" is a value the UI renders.
 *
 * @param {string} raw
 * @param {{ top?: Record<string, any>, nutrition?: Record<string, any> }} changes
 */
export function updateFrontmatter(raw, { top = {}, nutrition = {} } = {}) {
  const split = splitFile(raw);
  if (!split) throw new Error('file has no frontmatter block');
  let { head, body } = split;

  const nutStart = head.findIndex((l) => /^nutrition:\s*$/.test(l));
  let nutEnd = nutStart === -1 ? -1 : nutStart + 1;
  if (nutStart !== -1) while (nutEnd < head.length && /^\s+\S/.test(head[nutEnd])) nutEnd++;

  // --- top-level keys ---
  for (const [key, value] of Object.entries(top)) {
    if (value === undefined) continue;
    const at = head.findIndex((l, i) =>
      new RegExp(`^${key}:`).test(l) && (nutStart === -1 || i < nutStart || i >= nutEnd));

    if (value === null && OPTIONAL_TOP.has(key)) {
      if (at !== -1) {
        head.splice(at, 1);
        if (nutStart !== -1 && at < nutStart) nutEnd--;
      }
      continue;
    }
    const line = `${key}: ${serializeValue(key, value)}`;
    if (at !== -1) {
      head[at] = line;
      continue;
    }
    // Absent — insert after the last present key that precedes it in the order.
    const rank = TOP_ORDER.indexOf(key);
    let insertAt = 0;
    for (let i = 0; i < (nutStart === -1 ? head.length : nutStart); i++) {
      const k = (head[i].match(/^([A-Za-z]+):/) || [])[1];
      const r = k ? TOP_ORDER.indexOf(k) : -1;
      if (r !== -1 && r < rank) insertAt = i + 1;
    }
    head.splice(insertAt, 0, line);
    if (nutStart !== -1 && insertAt <= nutStart) nutEnd++;
  }

  // --- nutrition block ---
  // Recompute: the top-level pass may have shifted it.
  const nStart = head.findIndex((l) => /^nutrition:\s*$/.test(l));
  if (nStart !== -1 && Object.keys(nutrition).length) {
    let nEnd = nStart + 1;
    while (nEnd < head.length && /^\s+\S/.test(head[nEnd])) nEnd++;
    const indent = (head[nStart + 1] || '  x').match(/^\s*/)[0] || '  ';

    for (const [key, value] of Object.entries(nutrition)) {
      if (value === undefined) continue;
      const rel = head.slice(nStart + 1, nEnd).findIndex((l) => new RegExp(`^\\s+${key}:`).test(l));
      const line = `${indent}${key}: ${serializeValue(key, value)}`;
      if (rel !== -1) {
        head[nStart + 1 + rel] = line;
        continue;
      }
      const rank = NUTRITION_ORDER.indexOf(key);
      let insertAt = nStart + 1;
      for (let i = nStart + 1; i < nEnd; i++) {
        const k = (head[i].match(/^\s+([A-Za-z]+):/) || [])[1];
        const r = k ? NUTRITION_ORDER.indexOf(k) : -1;
        if (r !== -1 && r < rank) insertAt = i + 1;
      }
      head.splice(insertAt, 0, line);
      nEnd++;
    }
  }

  return ['---', ...head, '---', ...body].join('\n');
}

// --- reading for the edit form ------------------------------------------------
const unquote = (s) => {
  const t = String(s).trim();
  if (/^".*"$/.test(t)) {
    try { return JSON.parse(t); } catch { /* fall through */ }
  }
  if (/^'.*'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  return t;
};

function parseScalar(rawValue) {
  const t = String(rawValue).trim();
  if (t === 'null' || t === '') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^\[.*\]$/.test(t)) {
    return t.slice(1, -1).split(',').map((s) => unquote(s)).filter((s) => s !== '');
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return unquote(t);
}

/**
 * Every frontmatter key of one cereal, plus its review body.
 *
 * The index signature is deliberate: a file may carry keys this tool doesn't
 * model, and callers iterate the schema's field lists rather than hard-coding.
 *
 * @returns {{
 *   name?: string,
 *   brand?: string,
 *   rating?: number | null,
 *   shortNote?: string,
 *   dateReviewed?: string,
 *   dateUpdated?: string,
 *   emoji?: string,
 *   boxColor?: string,
 *   barcode?: string,
 *   boxImage?: string,
 *   imageSource?: string,
 *   imageCredit?: string,
 *   noAutoImage?: boolean,
 *   purchaseLocation?: string,
 *   price?: number,
 *   formFactors?: string[],
 *   proteinSources?: string[],
 *   attributes?: string[],
 *   nutrition: Record<string, any>,
 *   body: string,
 * } & Record<string, any>}
 */
export function parseCereal(raw) {
  const split = splitFile(raw);
  if (!split) throw new Error('file has no frontmatter block');
  const { head, body } = split;
  const top = {};
  const nutrition = {};
  let inNutrition = false;

  for (const line of head) {
    if (/^nutrition:\s*$/.test(line)) { inNutrition = true; continue; }
    const nested = line.match(/^\s+([A-Za-z]+):\s*(.*)$/);
    if (inNutrition && nested) { nutrition[nested[1]] = parseScalar(nested[2]); continue; }
    const flat = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (flat) { inNutrition = false; top[flat[1]] = parseScalar(flat[2]); }
  }
  return { ...top, nutrition, body: body.join('\n') };
}

export function cerealPath(slug) {
  return join(CEREALS, `${slug}.md`);
}

export function readCerealRaw(slug) {
  return readFileSync(cerealPath(slug), 'utf8');
}

/** The catalog, for the admin's browse list. */
export function listCereals() {
  return readdirSync(CEREALS)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const c = parseCereal(readFileSync(join(CEREALS, f), 'utf8'));
      return {
        slug,
        brand: c.brand ?? '',
        name: c.name ?? '',
        rating: c.rating ?? null,
        emoji: c.emoji ?? '🥣',
        boxImage: c.boxImage ?? null,
        dateReviewed: c.dateReviewed ?? null,
        dateUpdated: c.dateUpdated ?? null,
      };
    })
    .sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`));
}

export function writeCerealRaw(slug, markdown) {
  writeFileSync(cerealPath(slug), markdown);
}

/** Remove a box photo from disk. Mirrors `npm run image <slug> --none`. */
export function removeBoxImage(slug) {
  const file = join(IMAGES, `${slug}.jpg`);
  if (existsSync(file)) unlinkSync(file);
}

export function writeBoxImage(slug, buffer) {
  mkdirSync(IMAGES, { recursive: true });
  writeFileSync(join(IMAGES, `${slug}.jpg`), buffer);
}

export function writeCereal({ slug, markdown, imageBuffer }) {
  mkdirSync(CEREALS, { recursive: true });
  writeFileSync(join(CEREALS, `${slug}.md`), markdown);
  if (imageBuffer) {
    mkdirSync(IMAGES, { recursive: true });
    writeFileSync(join(IMAGES, `${slug}.jpg`), imageBuffer);
  }
}
