// Guards the frontmatter editor that /admin's edit form writes through.
//
//   npm test
//
// Editing has one hard requirement: change the lines you meant to change and
// leave every other byte alone — including the review body, and including keys
// this tool doesn't model (purchaseLocation, price, anything added later).
// That's why updateFrontmatter is a line-level edit rather than a
// parse-then-reserialize, and this is what holds it to that.
//
// The headline check runs against the real catalog: parse each file, feed every
// parsed value straight back in, and require the output to be byte-identical.
// A lossy quote style or a dropped key shows up here instead of in a commit.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CEREALS } from './lib/enrich-core.mjs';
import { parseCereal, updateFrontmatter } from './lib/compose-core.mjs';

let failures = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const fail = (name, detail) => {
  failures++;
  console.log(`  ✗ ${name}\n      ${detail}`);
};
function eq(name, actual, expected) {
  if (actual === expected) ok(name);
  else fail(name, `expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}

// --- 1. the real catalog round-trips byte-identical ---------------------------
console.log('\nround-trip over the catalog');
const files = readdirSync(CEREALS).filter((f) => f.endsWith('.md'));
if (!files.length) fail('catalog is not empty', 'no .md files found');
let identical = 0;
for (const f of files) {
  const raw = readFileSync(join(CEREALS, f), 'utf8');
  const { nutrition, body, ...top } = parseCereal(raw);
  const out = updateFrontmatter(raw, { top, nutrition });
  if (out === raw) {
    identical++;
    continue;
  }
  const a = raw.split('\n');
  const b = out.split('\n');
  const at = a.findIndex((l, i) => l !== b[i]);
  fail(f, `first difference at line ${at + 1}:\n      was ${JSON.stringify(a[at])}\n      got ${JSON.stringify(b[at])}`);
}
if (identical === files.length) ok(`all ${files.length} files identical after a no-op edit`);

// --- 2. a change with no keys is a no-op --------------------------------------
console.log('\nno-op');
const sample = readFileSync(join(CEREALS, files[0]), 'utf8');
eq('empty changes leave the file alone', updateFrontmatter(sample, {}), sample);

// --- 3. targeted edits ---------------------------------------------------------
console.log('\ntargeted edits');
const FIXTURE = [
  '---',
  'name: Heritage Flakes',
  'brand: "Nature\'s Path"',
  'rating: 7',
  'dateReviewed: 2026-01-06',
  'emoji: \'🌾\'',
  'boxColor: "#6fae57"',
  'barcode: \'0058449770206\'',
  'boxImage: /images/cereals/x.jpg',
  'imageSource: manufacturer',
  'imageCredit: "Image: Nature\'s Path"',
  'purchaseLocation: Whole Foods',
  'formFactors: [flakes]',
  'proteinSources: []',
  'attributes: [organic, low-sugar]',
  'nutrition:',
  '  servingSize: 40',
  '  calories: 160',
  '  totalFat: null',
  '  totalSugars: 5',
  '  protein: 5',
  '---',
  '',
  'A review body. It must survive untouched.',
  '',
].join('\n');

const lineOf = (src, key) => src.split('\n').find((l) => l.startsWith(`${key}:`));
const nutLineOf = (src, key) => src.split('\n').find((l) => l.trim().startsWith(`${key}:`));

eq('rating changes in place',
  lineOf(updateFrontmatter(FIXTURE, { top: { rating: 8.5 } }), 'rating'), 'rating: 8.5');

eq('clearing a rating writes null rather than removing it (schema is nullable)',
  lineOf(updateFrontmatter(FIXTURE, { top: { rating: null } }), 'rating'), 'rating: null');

eq('an absent optional key is inserted in schema order',
  updateFrontmatter(FIXTURE, { top: { dateUpdated: '2026-07-27' } }).split('\n')[5],
  'dateUpdated: 2026-07-27');

eq('clearing an optional key removes its line',
  lineOf(updateFrontmatter(FIXTURE, { top: { shortNote: null } }), 'shortNote'), undefined);

eq('a string needing quotes gets them',
  lineOf(updateFrontmatter(FIXTURE, { top: { name: 'Flakes: Redux' } }), 'name'),
  'name: "Flakes: Redux"');

eq('a barcode stays quoted so a leading zero survives',
  lineOf(updateFrontmatter(FIXTURE, { top: { barcode: '0123456789012' } }), 'barcode'),
  "barcode: '0123456789012'");

eq('lists serialize inline',
  lineOf(updateFrontmatter(FIXTURE, { top: { attributes: ['organic', 'keto'] } }), 'attributes'),
  'attributes: [organic, keto]');

eq('a nutrition value changes in place',
  nutLineOf(updateFrontmatter(FIXTURE, { nutrition: { totalSugars: 6 } }), 'totalSugars'),
  '  totalSugars: 6');

eq('a blank nutrition value stays an explicit null, never removed',
  nutLineOf(updateFrontmatter(FIXTURE, { nutrition: { calories: null } }), 'calories'),
  '  calories: null');

{
  // sodium is absent here and sorts last in the schema
  const out = updateFrontmatter(FIXTURE, { nutrition: { sodium: 140 } });
  const nut = out.split('\n').filter((l) => /^ {2}\w+:/.test(l));
  eq('an absent nutrition key is inserted in schema order', nut[nut.length - 1], '  sodium: 140');
}

{
  const out = updateFrontmatter(FIXTURE, { top: { rating: 9 }, nutrition: { protein: 6 } });
  eq('the review body survives an edit', out.endsWith('\nA review body. It must survive untouched.\n'), true);
  eq('an unmodelled key survives an edit', lineOf(out, 'purchaseLocation'), 'purchaseLocation: Whole Foods');
}

// --- 4. parsing ----------------------------------------------------------------
console.log('\nparsing');
const parsed = parseCereal(FIXTURE);
eq('unquotes a double-quoted string', parsed.brand, "Nature's Path");
eq('reads a number', parsed.rating, 7);
eq('reads a list', JSON.stringify(parsed.attributes), '["organic","low-sugar"]');
eq('reads an empty list', JSON.stringify(parsed.proteinSources), '[]');
eq('reads null as null', parsed.nutrition.totalFat, null);
eq('keeps a quoted barcode a string', parsed.barcode, '0058449770206');
eq('separates the nutrition block', parsed.nutrition.servingSize, 40);
eq('captures the body', parsed.body.includes('A review body.'), true);

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
