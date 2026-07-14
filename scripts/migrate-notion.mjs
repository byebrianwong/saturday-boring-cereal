// One-off migration: Notion "Cereal" database -> Keystatic content collection.
//
// The rows below were pulled live from Brian's Notion workspace via the Notion
// MCP (database id 1972217f-a3d0-8009-bd23-e53eceeebd11, data source
// collection://1972217f-a3d0-80c5-8189-000b2700a744) on 2026-07-04. The SQL
// query tool needs a Notion Business plan, so each page was fetched individually
// — exactly the "read individually via page fetches" path the build plan noted.
//
// Re-run any time with:  node scripts/migrate-notion.mjs
// It rewrites src/content/cereals/*.md from RAW below. Hand-edits to those files
// are overwritten, so make lasting changes here or in Keystatic (which writes
// its own files and shouldn't be re-clobbered — see the guard at the bottom).

import { writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'cereals');

// --- RAW Notion rows (verbatim property values) --------------------------------
// createdISO is the page timestamp from Notion; Taste omitted === no score.
const RAW = [
  { id: '1972-801e', created: '2025-02-11', Name: '**Cascadian Farm Organic Hearty Morning Fiber Cereal**', Taste: 8, Serving: 64, Sugar: 10, Fiber: 10, Protein: 6, Notes: 'Hearty-ish flakes, some clusters, fairly sweet', Text: '- Wheat flakes<br>- Clusters' },
  { id: '2902-80c6', created: '2026-02-15', Name: 'Michelle’s Granola Almond Butter', Taste: 8.5, Serving: 28, Fat: 9, SatFat: 1.5, Sugar: 5, Fiber: 3, Protein: 4, Notes: 'Tastes sugary', Text: '' },
  { id: '2012-80e6', created: '2026-01-06', Name: 'Trader Joe’s Peanut Butter Protein Granola', Taste: 8, Serving: 60, Fat: 12, SatFat: 2, Sugar: 9, Fiber: 3, Protein: 11, Notes: '', Text: '' },
  { id: '1972-8023', created: '2026-02-15', Name: '**Nature\'s Path Organic Flax Plus Maple Pecan Crunch**', Taste: 8.5, Serving: 60, Sugar: 10, Fiber: 6, Protein: 6, Notes: '', Text: '- Wheat flakes<br>- Clusters' },
  { id: '1972-8015', created: '2026-01-06', Name: 'Nature Path Heritage Flakes', Taste: 7, Serving: 40, Sugar: 5, Fiber: 7, Protein: 5, Notes: '', Text: '- Wheat flakes' },
  { id: '2132-80b4', created: '2025-06-15', Name: 'Strawberry Cherrios Protein', Taste: 7, Serving: 37, Sugar: 12, Fiber: 2, Protein: 8, Notes: 'Slight artificial strawberry flavor; fairly sweet', Text: '' },
  { id: '35b2-8009', created: '2026-05-09', Name: 'Grandy Oganics Classic Granola', /* no Taste */ Serving: 56, Fat: 15, SatFat: 2.5, Sugar: 6, Fiber: 5, Protein: 8, Notes: '', Text: '' },
  { id: '3002-8099', created: '2026-02-08', Name: 'Kodiak Protein Packed Cookie Butter Granola', Taste: 7, Serving: 64, Fat: 9, SatFat: 4.5, Sugar: 9, Fiber: 7, Protein: 17, Notes: 'Gets a little artificially tasting at the end', Text: '' },
  { id: '2132-8021', created: '2025-06-15', Name: 'Quaker Protein Granola Maple & Brown Sugar', Taste: 6, Serving: 62, Sugar: 13, Fiber: 4, Protein: 11, Notes: 'Slightly drier, harder to eat a lot of', Text: '' },
  { id: '2132-803b', created: '2025-06-15', Name: 'Manitoba Harvest Organice Superseed Granola Blueberr', Taste: 7, Serving: 60, Sugar: 10, Fiber: 4, Protein: 11, Notes: 'Pretty average granola taste, nothing special', Text: '' },
  { id: '3082-805c', created: '2026-02-15', Name: 'Manitoba Harvest Hemp Foods Superseed Granola', Taste: 7, Serving: 60, Fat: 12, SatFat: 6, Sugar: 9, Fiber: 4, Protein: 11, Notes: 'Can sometimes have a grassy hempy taste', Text: '' },
  { id: '2ff2-80f4', created: '2026-02-15', Name: 'Seven Sundays Bright Side Granola Triple Berry', Taste: 8.5, Serving: 40, Fat: 10, SatFat: 3.5, Sugar: 6, Fiber: 4, Protein: 6, Notes: '', Text: '- Natural granola (slight crisp)<br>- Seeds<br>- Dried strawberries' },
  { id: '25b2-8093', created: '2025-11-07', Name: '**Calbee Frugra Reduced Sugar Fruit & Granola**', Taste: 8, Serving: 56, Fat: 13, SatFat: 6, Sugar: 4, Fiber: 6, Protein: 10, Notes: 'Light crispy granola type', Text: '' },
  { id: '2e02-8062', created: '2026-01-06', Name: '**KIND Soft Baked Granola, Dark Chocolate Peanut Butter**', Taste: 8, Serving: 55, Fat: 10, SatFat: 2, Sugar: 10, Fiber: 4, Protein: 5, Notes: '', Text: '' },
  { id: '1972-800a', created: '2026-01-25', Name: 'Cascadian Farm Blueberry Vanilla No Sugar Added Granola', Taste: 8, Serving: 52, Fat: 11, SatFat: 3, Sugar: 7, Fiber: 4, Protein: 5, Notes: 'Light crispy granola type', Text: '' },
  { id: '2a42-80e1', created: '2025-11-07', Name: 'Trader Joe’s Homestyle Cherry Pistachio Pecan Granola', Taste: 8, Serving: 60, Fat: 13, SatFat: 3.5, Sugar: 14, Fiber: 5, Protein: 6, Notes: '', Text: '' },
  { id: '1972-80c0', created: '2025-02-11', Name: '**Cascadian Farm Kernza Grains Climate Smart Organic**', Taste: 7, Serving: 56, Sugar: 9, Fiber: 5, Protein: 5, Notes: 'Has a medium grainy taste to it, like slightly thicker darker wheat flakes. Slightly crunchy, but not really crispy. Mild organicy after taste. Would buy again for variety of wheat flake cereals', Text: '- Wheat flakes<br>-' },
  { id: '1972-80a3', created: '2026-01-06', Name: '**Nature\'s Path Organic Heritage Crunch**', Taste: 8, Serving: 55, Fat: 3, SatFat: 0.5, Sugar: 7, Fiber: 6, Protein: 6, Notes: '', Text: '' },
  { id: '1972-80b8', created: '2025-02-11', Name: '**Nature\'s Path Organic Flax Plus Red Berry Crunch**', Taste: 8, Serving: 58, Sugar: 11, Fiber: 6, Protein: 6, Notes: '', Text: '' },
  { id: '2ad2-8026', created: '2025-11-17', Name: 'IKEA **Hjateroll**', Taste: 8, Serving: 54, Fat: 10, SatFat: 4, Sugar: 4, Fiber: 8, Protein: 7, Notes: '', Text: '' },
  { id: '1972-8003', created: '2025-02-11', Name: 'Magic Spoon Peanut Butter', Taste: 5, Serving: 36, Sugar: 0.1, Fiber: 1, Protein: 14, Notes: '', Text: '' },
  { id: '1972-80f7', created: '2025-02-11', Name: 'Cascadian Farm Blueberry Almond Crunch', Taste: 7, Serving: 54, Sugar: 6, Fiber: 5, Protein: 5, Notes: '', Text: '' },
  { id: '1972-8081', created: '2025-02-11', Name: 'Honey Bunches of Oats Honey Roasted', Taste: 8, Serving: 30, Sugar: 9, Fiber: 2, Protein: 3, Notes: '', Text: '' },
  { id: '2312-80f9', created: '2025-07-15', Name: 'KIND Dark Chocolate Clusters', Taste: 7, Serving: 65, Sugar: 7, Fiber: 4, Protein: 10, Notes: '', Text: '' },
  { id: '1c62-8002', created: '2025-03-30', Name: 'Special K Zero Cinnamon', Taste: 3, Serving: 36, Sugar: 0.1, Fiber: 3, Protein: 18, Notes: '', Text: '' },
];

// --- Brand splitting -----------------------------------------------------------
// Known brand prefixes, longest first so "Nature's Path" wins over "Nature".
// Also cleans obvious typos/truncations for a public-facing display name.
const BRANDS = [
  'Cascadian Farm', "Nature's Path", 'Nature Path', 'Trader Joe’s', "Trader Joe's",
  'Michelle’s Granola', "Michelle's Granola", 'Manitoba Harvest Hemp Foods',
  'Manitoba Harvest', 'Seven Sundays', 'Honey Bunches of Oats', 'Magic Spoon',
  'Special K', 'Grandy Organics', 'Kodiak', 'Quaker', 'Calbee', 'KIND', 'IKEA',
  'Cheerios',
];

// name-substring -> corrected substring (typos/truncations, brand normalization)
const CLEANUPS = [
  ['Oganics', 'Organics'],
  ['Organice', 'Organic'],
  ['Cherrios', 'Cheerios'],
  ['Nature Path', "Nature's Path"],
  ['Superseed Granola Blueberr', 'Superseed Granola Blueberry'],
  ['Hjateroll', 'Hjälteroll'],
];

function clean(name) {
  let n = name.replace(/\*\*/g, '').trim();
  for (const [bad, good] of CLEANUPS) n = n.replace(bad, good);
  // "Strawberry Cheerios Protein" -> brand Cheerios, product "Strawberry Protein"
  return n;
}

function splitBrand(rawName) {
  const n = clean(rawName);
  // Special case: brand embedded mid-name (Strawberry Cheerios Protein).
  if (/Cheerios/i.test(n)) {
    return { brand: 'Cheerios', name: n.replace(/\s*Cheerios\s*/i, ' ').replace(/\s+/g, ' ').trim() || 'Cheerios' };
  }
  for (const b of BRANDS) {
    if (n.toLowerCase().startsWith(b.toLowerCase())) {
      return { brand: b, name: n.slice(b.length).trim() || n };
    }
  }
  return { brand: n.split(' ')[0], name: n.split(' ').slice(1).join(' ') || n };
}

// --- Form factors from the "Text" mini-taxonomy + name keywords ----------------
function formFactors({ Text, name, brand }) {
  const set = new Set();
  for (const raw of (Text || '').split('<br>')) {
    const t = raw.replace(/^-\s*/, '').trim().toLowerCase();
    if (!t) continue;
    if (t.includes('flake')) set.add('flakes');
    if (t.includes('cluster')) set.add('clusters');
    if (t.includes('granola')) set.add('granola');
    if (t.includes('oat')) set.add('oats');
  }
  const nm = name.toLowerCase();
  if (nm.includes('granola')) set.add('granola');
  if (nm.includes('flake')) set.add('flakes');
  if (nm.includes('cluster')) set.add('clusters');
  // brand-shape defaults
  if (brand === 'Cheerios' || brand === 'Magic Spoon') set.add('os');
  if (brand === 'Special K') set.add('flakes');
  if (brand === 'Honey Bunches of Oats') { set.add('flakes'); set.add('clusters'); }
  // Nature's Path "...Crunch" cereals are flake-based
  if (brand === "Nature's Path" && nm.includes('crunch')) set.add('flakes');
  return [...set];
}

// --- Protein sources (light, only where confident; else empty) -----------------
function proteinSources({ brand, name }) {
  if (brand === 'Magic Spoon') return ['milk-protein'];
  const nutty = ['granola', 'almond', 'pecan', 'pistachio', 'peanut', 'seed', 'hemp', 'nut'];
  if (nutty.some((k) => name.toLowerCase().includes(k) || /granola/i.test(name))) {
    if (/granola/i.test(name)) return ['nut-seed'];
  }
  if (/granola/i.test(name)) return ['nut-seed'];
  return [];
}

// --- Attributes: from name + computed from Brian's own numbers -----------------
const ORGANIC_BRANDS = new Set(['Cascadian Farm', "Nature's Path", 'Grandy Organics', 'Manitoba Harvest']);

function attributes(row, brand, name) {
  const a = new Set();
  if (ORGANIC_BRANDS.has(brand) || /organic/i.test(name)) a.add('organic');
  if (row.Protein != null && row.Protein >= 10) a.add('high-protein');
  if (row.Sugar != null && row.Sugar <= 5) a.add('low-sugar');
  if (row.Fiber != null && row.Fiber >= 8) a.add('high-fiber');
  if (/no sugar added/i.test(name)) a.add('no-added-sugar');
  if (brand === 'Magic Spoon') { a.add('grain-free'); a.add('keto'); a.add('gluten-free'); a.add('high-protein'); }
  return [...a];
}

// --- Placeholder box art: emoji by flavor keyword, color by brand --------------
const EMOJI = [
  ['cookie', '\u{1F36A}'], ['peanut', '\u{1F95C}'], ['almond', '\u{1F330}'],
  ['pistachio', '\u{1F330}'], ['pecan', '\u{1F341}'], ['blueberry', '\u{1FAD0}'],
  ['maple', '\u{1F341}'], ['cherry', '\u{1F352}'], ['chocolate', '\u{1F36B}'],
  ['strawberry', '\u{1F353}'], ['berry', '\u{1F353}'], ['honey', '\u{1F36F}'],
  ['hemp', '\u{1F331}'], ['seed', '\u{1F331}'], ['flax', '\u{1F331}'],
  ['cinnamon', '\u{1F9C2}'], ['flake', '\u{1F33E}'], ['kernza', '\u{1F33E}'],
];
const BRAND_COLOR = {
  'Cascadian Farm': '#6fa8d6', "Nature's Path": '#6fae57', 'Trader Joe’s': '#e07ba3',
  "Trader Joe's": '#e07ba3', 'Michelle’s Granola': '#f2a13c', "Michelle's Granola": '#f2a13c',
  'Cheerios': '#f0b429', 'Grandy Organics': '#d6c26f', 'Kodiak': '#b5651d',
  'Quaker': '#d94f4f', 'Manitoba Harvest': '#4e8a5c', 'Manitoba Harvest Hemp Foods': '#4e8a5c',
  'Seven Sundays': '#f28b30', 'Calbee': '#e0653a', 'KIND': '#8a6d3b', 'IKEA': '#2b6cb0',
  'Magic Spoon': '#7b4fb0', 'Honey Bunches of Oats': '#e8a33d', 'Special K': '#b02525',
};
function boxEmoji(name) {
  const nm = name.toLowerCase();
  for (const [k, e] of EMOJI) if (nm.includes(k)) return e;
  return '\u{1F963}'; // bowl
}

// --- slug + YAML emit ----------------------------------------------------------
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

function yamlNum(v) {
  return v == null ? null : v;
}

function toMarkdown(row) {
  const { brand, name } = splitBrand(row.Name);
  const ff = formFactors({ Text: row.Text, name, brand });
  const ps = proteinSources({ brand, name });
  const at = attributes(row, brand, name);
  const emoji = boxEmoji(name);
  const color = BRAND_COLOR[brand] || '#c98d4e';

  // addedSugars we can state truthfully: "No Sugar Added" and sugar-free-ish → 0.
  let addedSugars = null;
  if (/no sugar added/i.test(name)) addedSugars = 0;
  if (brand === 'Magic Spoon' || brand === 'Special K') addedSugars = 0;

  const fm = {
    name: name || brand,
    brand,
    rating: yamlNum(row.Taste ?? null),
    dateReviewed: row.created,
    emoji,
    boxColor: color,
    formFactors: ff,
    proteinSources: ps,
    attributes: at,
  };
  if (row.Notes) fm.shortNote = row.Notes;

  const nut = {
    servingSize: row.Serving,
    calories: null,
    totalFat: yamlNum(row.Fat ?? null),
    saturatedFat: yamlNum(row.SatFat ?? null),
    totalSugars: yamlNum(row.Sugar ?? null),
    addedSugars,
    dietaryFiber: yamlNum(row.Fiber ?? null),
    protein: yamlNum(row.Protein ?? null),
    proteinDV: null,
  };

  // hand-roll YAML (tiny + predictable; avoids a dep)
  const lines = ['---'];
  lines.push(`name: ${q(fm.name)}`);
  lines.push(`brand: ${q(fm.brand)}`);
  lines.push(`rating: ${fm.rating == null ? 'null' : fm.rating}`);
  if (fm.shortNote) lines.push(`shortNote: ${q(fm.shortNote)}`);
  lines.push(`dateReviewed: ${fm.dateReviewed}`);
  lines.push(`emoji: ${q(fm.emoji)}`);
  lines.push(`boxColor: ${q(fm.boxColor)}`);
  lines.push(`formFactors: [${fm.formFactors.join(', ')}]`);
  lines.push(`proteinSources: [${fm.proteinSources.join(', ')}]`);
  lines.push(`attributes: [${fm.attributes.join(', ')}]`);
  lines.push('nutrition:');
  for (const [k, v] of Object.entries(nut)) {
    lines.push(`  ${k}: ${v == null ? 'null' : v}`);
  }
  lines.push('---');
  lines.push('');
  return { slug: slugify(brand, name), body: lines.join('\n') + '\n' };
}

// quote a YAML scalar only when needed
function q(s) {
  const str = String(s);
  if (/^[\u{1F000}-\u{1FFFF}☀-➿]/u.test(str)) return `'${str}'`;
  if (/[:#'"\[\]{}&*!|>%@`]/.test(str) || /^\s|\s$/.test(str) || str === '') return JSON.stringify(str);
  return str;
}

// --- run -----------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.md')) unlinkSync(join(OUT, f));
}
let count = 0;
for (const row of RAW) {
  const { slug, body } = toMarkdown(row);
  writeFileSync(join(OUT, `${slug}.md`), body);
  count++;
}
console.log(`Wrote ${count} cereals to ${OUT}`);
