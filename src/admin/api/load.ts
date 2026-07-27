import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../lib/auth';
import { parseCereal, readCerealRaw, cerealExists } from '../../../scripts/lib/compose-core.mjs';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthed(request)) return unauthorized();

  const { slug } = (await request.json().catch(() => ({}))) ?? {};
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return json({ error: 'Bad slug.' }, 400);
  }
  if (!cerealExists(slug)) return json({ error: `No cereal called ${slug}.` }, 404);

  const cereal = parseCereal(readCerealRaw(slug));
  return json({ slug, cereal });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
