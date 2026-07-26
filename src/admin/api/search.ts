import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../lib/auth';
// The lookup is the same code `npm run find` uses — this route is a transport,
// not a second implementation.
import { searchCandidates } from '../../../scripts/lib/enrich-core.mjs';
import { splitBrandName, inferTags, slugify, cerealExists } from '../../../scripts/lib/compose-core.mjs';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthed(request)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const query = String(body.query ?? '').trim();
  const useUsda = body.useUsda !== false;
  if (!query) {
    return json({ error: 'Type something to search for.' }, 400);
  }

  const fdcKey = process.env.FDC_API_KEY || 'DEMO_KEY';
  let candidates: any[] = [];
  let errors: string[] = [];
  try {
    ({ candidates, errors } = await searchCandidates(query, { fdcKey, useUsda }));
  } catch (e: any) {
    return json({ error: `Search failed: ${e.message}` }, 502);
  }

  // "Nothing matched" and "nothing answered" need different next steps, so the
  // UI has to be able to tell them apart.
  const allSourcesFailed = errors.length === (useUsda ? 2 : 1);

  // Annotate each candidate with what the UI needs to decide: the brand/name
  // split it would get, and whether that slug is already in the catalog.
  const annotated = candidates.map((c, i) => {
    const { brand, name } = splitBrandName(c);
    const slug = slugify(brand, name);
    // Pre-checked in the form, so a wrong guess is visible and one click away
    // from being fixed rather than silently baked into the file.
    const tags = inferTags(c, brand, name);
    return {
      index: i,
      source: c.source,
      sourceLabel: c.sourceLabel,
      alsoIn: c.alsoIn ?? null,
      matchedName: c.matchedName,
      matchedBrand: c.matchedBrand,
      url: c.url,
      barcode: c.barcode,
      servingSize: c.servingSize,
      servingDescription: c.servingDescription,
      calories: c.calories,
      protein: c.protein,
      totalSugars: c.totalSugars,
      dietaryFiber: c.dietaryFiber,
      sodium: c.sodium,
      brand,
      name,
      slug,
      exists: slug ? cerealExists(slug) : false,
      tags,
      // A record with no serving size can't be used: the whole label is
      // per-serving and meaningless without one.
      usable: c.servingSize != null,
      imageCount: (c.frontImages || []).length,
      // The full record goes back so /create doesn't have to search again —
      // the client returns whichever one you picked, verbatim.
      raw: c,
    };
  });

  // One pooled gallery across every match: the same product often has several
  // OFF entries, each with its own photo, and any of them might be the good one.
  const images: { url: string; from: string }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    for (const url of c.frontImages || []) {
      if (seen.has(url)) continue;
      seen.add(url);
      images.push({ url, from: `${c.matchedBrand || ''} ${c.matchedName}`.trim() });
    }
  }

  return json({ candidates: annotated, images, errors, allSourcesFailed });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
