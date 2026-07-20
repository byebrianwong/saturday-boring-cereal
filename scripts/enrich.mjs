// Reviewable nutrition + image enrichment for the whole cereal catalog.
//
// This is the BATCH tool — it sweeps every cereal at once. To add a single new
// cereal and pull its nutrition in the same step, use `node scripts/add.mjs`
// (or `npm run add`), which shares the same lookup + safety code from
// scripts/lib/enrich-core.mjs.
//
// Modes:
//   node scripts/enrich.mjs                 # fetch -> enrichment/<slug>.json + REVIEW.md
//   node scripts/enrich.mjs --auto-approve  # same, but approve matches that pass BOTH
//                                           #   (macro cross-check HIGH) AND (name overlap)
//   node scripts/enrich.mjs --apply         # write ONLY approved drafts, null fields only
//
// USDA uses DEMO_KEY by default (30 req/hr shared limit). Set FDC_API_KEY for a
// personal free key. `node scripts/enrich.mjs --no-usda` to skip USDA entirely.
//
// It NEVER overwrites your recorded fields (protein/sugar/fiber/serving/rating)
// and only fills what's currently blank (calories, sat/trans/poly/mono fat,
// added sugars, sodium) plus barcode + a CC-BY-SA image credit.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CEREALS, DRAFTS, readCereal, nameMatch, applyDraft, enrichCereal, sleep } from './lib/enrich-core.mjs';

const USE_USDA = !process.argv.includes('--no-usda');
const FDC_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
const APPLY = process.argv.includes('--apply');
const AUTO = process.argv.includes('--auto-approve');

mkdirSync(DRAFTS, { recursive: true });
const files = readdirSync(CEREALS).filter((f) => f.endsWith('.md'));

if (APPLY) {
  let applied = 0;
  for (const file of files) {
    const cereal = readCereal(file);
    const p = join(DRAFTS, `${cereal.slug}.json`);
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (j.approved === true && j.draft) {
      await applyDraft(cereal, j.draft);
      applied++;
      console.log(`applied: ${cereal.slug} (${j.draft.source})`);
    }
  }
  console.log(`\nApplied ${applied} approved draft(s).`);
} else {
  const rows = [];
  let usdaRateLimited = false;
  for (const file of files) {
    const cereal = readCereal(file);
    const { primary, conf, meetsBar, usdaRateLimited: hit } = await enrichCereal(cereal, {
      fdcKey: FDC_KEY,
      useUsda: USE_USDA && !usdaRateLimited,
    });
    if (hit && !usdaRateLimited) {
      usdaRateLimited = true;
      console.error('! USDA rate limit hit — continuing with Open Food Facts only. Set FDC_API_KEY for a personal key.');
    }
    const approved = AUTO && meetsBar;
    writeFileSync(
      join(DRAFTS, `${cereal.slug}.json`),
      JSON.stringify(
        {
          slug: cereal.slug,
          recorded: { protein: cereal.protein, totalSugars: cereal.totalSugars, dietaryFiber: cereal.dietaryFiber, servingSize: cereal.servingSize },
          confidence: conf,
          nameMatch: primary ? nameMatch(cereal, primary) : false,
          approved,
          draft: primary,
        },
        null,
        2
      )
    );
    rows.push({ slug: cereal.slug, conf, approved, draft: primary });
    console.log(`${(approved ? 'APPROVE' : conf).padEnd(7)} ${cereal.slug} -> ${primary ? `[${primary.source}] ${primary.matchedName}` : 'no match'}`);
    await sleep(300);
  }

  const md = [
    '# Enrichment review',
    '',
    `Sources: USDA FoodData Central${usdaRateLimited ? ' (rate-limited this run)' : ''} + Open Food Facts. VERIFY against the box.`,
    '',
    'Auto-approved rows passed BOTH a macro cross-check and a product-name overlap.',
    'To accept more: open the link, confirm, set `"approved": true`, then `node scripts/enrich.mjs --apply`.',
    '',
    '| State | Cereal | Source | Match | kcal | satF | +sug | Na | img |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const d = r.draft;
      if (!d) return `| — | ${r.slug} | | no match | | | | | |`;
      const state = r.approved ? '✅ approved' : r.conf === 'HIGH' ? '☑︎ high' : '⚠️ low';
      const src = d.source === 'usda_fdc' ? 'USDA' : 'OFF';
      return `| ${state} | ${r.slug} | ${src} | [${d.matchedName || '?'}](${d.url}) | ${d.calories ?? ''} | ${d.saturatedFat ?? ''} | ${d.addedSugars ?? ''} | ${d.sodium ?? ''} | ${d.image ? 'y' : ''} |`;
    }),
  ].join('\n');
  writeFileSync(join(DRAFTS, 'REVIEW.md'), md);
  const approvedCount = rows.filter((r) => r.approved).length;
  console.log(`\nWrote ${rows.length} drafts + REVIEW.md · ${approvedCount} auto-approved`);
}
