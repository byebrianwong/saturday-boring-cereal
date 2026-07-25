// Change a cereal's taste rating (and optionally its note) from the terminal.
//
//   npm run rate natures-path-heritage-flakes 8.5
//   npm run rate "heritage flakes" 8.5 --note "Better than I remembered."
//   npm run rate magic-spoon-peanut-butter --unrated
//
// Ratings are the historical Notion 0–10 Taste scale, decimals allowed. Writing
// one stamps `dateUpdated` so the site can tell a re-rate from the original
// review — `dateReviewed` is never touched.
//
// Flags:
//   --note "…"    replace the short tasting note
//   --unrated     clear the rating (rating: null) — for cereals you've delisted
//                 an opinion on rather than scored
//   --date <YYYY-MM-DD>  override the dateUpdated stamp (default: today)
//   --dry-run     print the change, write nothing

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CEREALS } from './lib/enrich-core.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const flagsWithValues = new Set(['note', 'date']);
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (flagsWithValues.has(a.slice(2))) i++;
    continue;
  }
  pos.push(a);
}

const UNRATED = has('--unrated');
const DRY = has('--dry-run');
const note = flag('note');
const [slugArg, scoreArg] = pos;

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

if (!slugArg) fail('usage: npm run rate <slug> <score 0–10> [--note "…"]');
if (!UNRATED && scoreArg === undefined) fail('missing the score (or pass --unrated to clear it)');

// --- resolve the cereal -------------------------------------------------------
// Accept an exact slug, or anything that uniquely identifies one.
function resolveSlug(input) {
  const slugs = readdirSync(CEREALS).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
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

// --- validate -----------------------------------------------------------------
let rating = 'null';
if (!UNRATED) {
  const n = Number(scoreArg);
  if (!Number.isFinite(n)) fail(`"${scoreArg}" isn't a number — the scale is 0–10, decimals allowed`);
  if (n < 0 || n > 10) fail(`rating ${n} is outside the 0–10 scale`);
  rating = String(n);
}

const date = flag('date') || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date must be YYYY-MM-DD (got "${date}")`);

// --- edit ---------------------------------------------------------------------
const was = (md.match(/^rating:\s*(.+)$/m) || [])[1]?.trim() ?? 'null';
if (!/^rating:/m.test(md)) fail(`${slug}.md has no rating field — is it a valid cereal file?`);

let out = md.replace(/^rating:.*$/m, `rating: ${rating}`);

// dateUpdated sits right after dateReviewed when it exists; add it if it doesn't.
if (/^dateUpdated:/m.test(out)) out = out.replace(/^dateUpdated:.*$/m, `dateUpdated: ${date}`);
else out = out.replace(/^(dateReviewed:.*$)/m, `$1\ndateUpdated: ${date}`);

if (note !== undefined) {
  // Quote the same way the rest of the frontmatter does: only when needed.
  const q = /[:#'"[\]{}&*!|>%@`]/.test(note) || /^\s|\s$/.test(note) ? JSON.stringify(note) : note;
  if (/^shortNote:/m.test(out)) out = out.replace(/^shortNote:.*$/m, `shortNote: ${q}`);
  else out = out.replace(/^(rating:.*$)/m, `$1\nshortNote: ${q}`);
}

const shown = (v) => (v === 'null' ? 'unrated' : `${v}/10`);
if (DRY) {
  console.log(`[dry-run] ${slug}: ${shown(was)} → ${shown(rating)} · dateUpdated ${date}`);
  if (note !== undefined) console.log(`  shortNote: ${note}`);
  process.exit(0);
}

writeFileSync(file, out);
console.log(`✓ ${slug}: ${shown(was)} → ${shown(rating)}`);
console.log(`  dateUpdated: ${date}${note !== undefined ? `\n  shortNote: ${note}` : ''}`);
