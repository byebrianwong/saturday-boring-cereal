import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../lib/auth';
import { usdaUpgradeToLabel } from '../../../scripts/lib/enrich-core.mjs';
import {
  slugify, cerealExists, cerealMarkdown, sanitize, prepareImage, writeCereal, nutritionFrom,
} from '../../../scripts/lib/compose-core.mjs';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthed(request)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const {
    candidate, brand, name, rating, note, imageUrl, imageSource, fit,
    formFactors = [], proteinSources = [], attributes = [],
    emoji, boxColor, dryRun,
  } = body ?? {};

  if (!candidate || typeof candidate !== 'object') return json({ error: 'No product picked.' }, 400);
  if (!brand?.trim() || !name?.trim()) return json({ error: 'Brand and product name are both required.' }, 400);

  const score = rating === '' || rating == null ? null : Number(rating);
  if (score != null && (!Number.isFinite(score) || score < 0 || score > 10)) {
    return json({ error: 'Taste score has to be a number from 0 to 10 (or blank).' }, 400);
  }

  const slug = slugify(brand, name);
  if (!slug) return json({ error: `Couldn't derive a filename from "${brand} ${name}".` }, 400);
  if (cerealExists(slug)) {
    return json({ error: `${slug}.md already exists — edit it in Keystatic, or delete it first.` }, 409);
  }

  // A USDA search hit carries per-100g data only; its printed label lives on the
  // detail record. Same upgrade the CLI does once you've committed to a pick.
  let picked = candidate;
  if (picked.source === 'usda_fdc' && picked.fdcId) {
    try {
      picked = await usdaUpgradeToLabel(picked, { fdcKey: process.env.FDC_API_KEY || 'DEMO_KEY' });
    } catch {
      /* rate-limited or unreachable — the per-100g figures still stand */
    }
  }

  // Picking the right product doesn't make its numbers right.
  const dropped = sanitize(picked);

  if (picked.servingSize == null) {
    return json({
      error: 'That record has no serving size, and the whole label is per-serving without one. ' +
             'Pick a different result, or add it with `npm run add`.',
    }, 422);
  }

  // Fetch the chosen photo before writing anything, so a failed download
  // doesn't leave a file pointing at an image that isn't there.
  let image = null;
  let imageError = null;
  if (imageUrl) {
    try {
      image = await prepareImage(imageUrl, { fit: fit === 'contain' ? 'contain' : 'cover' });
    } catch (e: any) {
      imageError = e.message;
    }
  }

  const fromOff = !imageSource || imageSource === 'open_food_facts';
  const markdown = cerealMarkdown({
    brand: brand.trim(),
    name: name.trim(),
    rating: score,
    note: (note ?? '').trim(),
    picked,
    slug,
    formFactors, proteinSources, attributes,
    emoji: emoji || '🥣',
    boxColor: boxColor || '#c98d4e',
    hasImage: !!image,
    imageSource: imageSource || 'open_food_facts',
    imageCredit: image
      ? fromOff
        ? `Photo: Open Food Facts contributors, CC-BY-SA — ${picked.url}`
        : `Image: ${hostOf(image.url) ?? 'supplied'}`
      : undefined,
  });

  const nutrition = nutritionFrom(picked);
  const blank = Object.entries(nutrition).filter(([k, v]) => v == null && k !== 'proteinDV').map(([k]) => k);

  if (dryRun) {
    return json({ ok: true, dryRun: true, slug, markdown, dropped, imageError, blank, image: imageMeta(image) });
  }

  try {
    writeCereal({ slug, markdown, imageBuffer: image?.out });
  } catch (e: any) {
    return json({ error: `Couldn't write the file: ${e.message}` }, 500);
  }

  return json({
    ok: true,
    slug,
    markdown,
    dropped,
    imageError,
    blank,
    image: imageMeta(image),
    filled: Object.values(nutrition).filter((v) => v != null).length,
    sourceLabel: picked.sourceLabel,
    basis: picked.basis ?? null,
    matchedName: picked.matchedName,
  });
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function imageMeta(image: any) {
  if (!image) return null;
  return {
    width: image.before.width,
    height: image.before.height,
    trimmedWidth: image.trimmed.width,
    trimmedHeight: image.trimmed.height,
    bytes: image.out.length,
    // How much a cover crop threw away — a tall bag losing its top and bottom
    // should be visible, not silent.
    lostPct: image.lost.pct,
    lostAxis: image.lost.axis,
    url: image.url,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
