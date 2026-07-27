import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../lib/auth';
import { readTaxonomy, NUTRITION_ORDER } from '../../../scripts/lib/enrich-core.mjs';
import {
  parseCereal, readCerealRaw, writeCerealRaw, updateFrontmatter, cerealExists,
  prepareImage, writeBoxImage, removeBoxImage,
} from '../../../scripts/lib/compose-core.mjs';

export const prerender = false;

// Fields the edit form owns. Anything else in the file (a body, a key this tool
// doesn't model) is never touched — updateFrontmatter only rewrites what's
// named here, and only when it actually differs.
const TEXT_FIELDS = ['name', 'brand', 'shortNote', 'emoji', 'boxColor'] as const;
const LIST_FIELDS = ['formFactors', 'proteinSources', 'attributes'] as const;

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthed(request)) return unauthorized();

  const body = (await request.json().catch(() => ({}))) ?? {};
  const { slug, fields = {}, nutrition = {}, imageUrl, removeImage, fit, dryRun } = body;

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Bad slug.' }, 400);
  if (!cerealExists(slug)) return json({ error: `No cereal called ${slug}.` }, 404);

  const raw = readCerealRaw(slug);
  const current = parseCereal(raw);

  // --- validate --------------------------------------------------------------
  if (!String(fields.name ?? '').trim() || !String(fields.brand ?? '').trim()) {
    return json({ error: 'Brand and product name are both required.' }, 400);
  }
  const rating = fields.rating === '' || fields.rating == null ? null : Number(fields.rating);
  if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 10)) {
    return json({ error: 'Taste score has to be a number from 0 to 10 (or blank).' }, 400);
  }

  const serving = nutrition.servingSize === '' || nutrition.servingSize == null
    ? null : Number(nutrition.servingSize);
  if (serving == null || !Number.isFinite(serving) || serving <= 0) {
    return json({ error: 'Serving size is required, in grams — the whole label is per-serving.' }, 400);
  }

  const taxonomy = readTaxonomy();
  const allowed: Record<string, string[] | null> = {
    formFactors: taxonomy.FORM_FACTORS,
    proteinSources: taxonomy.PROTEIN_SOURCES,
    attributes: taxonomy.ATTRIBUTES,
  };
  for (const key of LIST_FIELDS) {
    const values = fields[key] ?? [];
    if (!Array.isArray(values)) return json({ error: `${key} must be a list.` }, 400);
    const ok = allowed[key];
    const bad = ok ? values.filter((v: string) => !ok.includes(v)) : [];
    if (bad.length) return json({ error: `Unknown ${key}: ${bad.join(', ')}` }, 400);
  }

  // --- work out what actually changed ---------------------------------------
  const top: Record<string, any> = {};
  const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  for (const key of TEXT_FIELDS) {
    const next = String(fields[key] ?? '').trim();
    // shortNote is optional: emptying it removes the key rather than writing "".
    const value = next === '' ? (key === 'shortNote' ? null : undefined) : next;
    if (value === undefined) continue;
    if (!same(value, current[key])) top[key] = value;
  }
  if (!same(rating, current.rating ?? null)) top.rating = rating;
  for (const key of LIST_FIELDS) {
    const next = fields[key] ?? [];
    if (!same(next, current[key] ?? [])) top[key] = next;
  }

  const nut: Record<string, any> = {};
  for (const key of NUTRITION_ORDER) {
    if (!(key in nutrition)) continue;
    if (key === 'servingDescription') {
      const next = String(nutrition[key] ?? '').trim();
      const value = next === '' ? null : next;
      if (!same(value, current.nutrition?.[key] ?? null)) nut[key] = value;
      continue;
    }
    const rawValue = nutrition[key];
    const value = rawValue === '' || rawValue == null ? null : Number(rawValue);
    if (value != null && !Number.isFinite(value)) {
      return json({ error: `${key} has to be a number, or blank for "not listed".` }, 400);
    }
    if (!same(value, current.nutrition?.[key] ?? null)) nut[key] = value;
  }

  // --- the box photo ---------------------------------------------------------
  let image = null;
  let imageError = null;
  if (removeImage) {
    top.boxImage = null;
    top.imageSource = null;
    top.imageCredit = null;
    // Same marker `npm run image --none` sets, so enrichment can't put an
    // angled photo back on a product that hasn't got a usable front.
    top.noAutoImage = true;
  } else if (imageUrl) {
    try {
      image = await prepareImage(imageUrl, { fit: fit === 'contain' ? 'contain' : 'cover' });
      const host = hostOf(image.url);
      const fromOff = /openfoodfacts/.test(host ?? '');
      top.boxImage = `/images/cereals/${slug}.jpg`;
      top.imageSource = fromOff ? 'open_food_facts' : 'manufacturer';
      top.imageCredit = fromOff
        ? `Photo: Open Food Facts contributors, CC-BY-SA — ${image.url}`
        : `Image: ${host ?? 'supplied'}`;
      // It has a real front now, so the "no usable front" marker no longer holds.
      if (current.noAutoImage) top.noAutoImage = null;
    } catch (e: any) {
      imageError = e.message;
    }
  }

  // --- stamp dateUpdated -----------------------------------------------------
  // Matches rate.mjs: a re-rate or a rewritten note is an update; dateReviewed
  // stays the original review date. Fixing a nutrition typo isn't a re-review.
  const reviewChanged = 'rating' in top || 'shortNote' in top;
  const today = new Date().toISOString().slice(0, 10);
  if (reviewChanged && current.dateUpdated !== today) top.dateUpdated = today;

  const changed = [...Object.keys(top), ...Object.keys(nut).map((k) => `nutrition.${k}`)];
  if (!changed.length && !image) {
    return json({ ok: true, slug, changed: [], unchanged: true, imageError });
  }

  const next = updateFrontmatter(raw, { top, nutrition: nut });

  if (dryRun) {
    return json({ ok: true, dryRun: true, slug, changed, markdown: next, imageError, image: imageMeta(image) });
  }

  try {
    if (image) writeBoxImage(slug, image.out);
    if (removeImage) removeBoxImage(slug);
    writeCerealRaw(slug, next);
  } catch (e: any) {
    return json({ error: `Couldn't write: ${e.message}` }, 500);
  }

  return json({ ok: true, slug, changed, imageError, image: imageMeta(image), markdown: next });
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
    lostPct: image.lost.pct,
    lostAxis: image.lost.axis,
    url: image.url,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
