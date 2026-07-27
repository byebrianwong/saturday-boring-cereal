import type { APIRoute } from 'astro';
import { isAuthed, unauthorized } from '../lib/auth';
import { listCereals } from '../../../scripts/lib/compose-core.mjs';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthed(request)) return unauthorized();
  return new Response(JSON.stringify({ cereals: listCereals() }), {
    headers: { 'content-type': 'application/json' },
  });
};
