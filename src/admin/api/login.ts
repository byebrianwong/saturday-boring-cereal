import type { APIRoute } from 'astro';
import { COOKIE, passwordMatches, issueToken } from '../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { password } = await request.json().catch(() => ({ password: '' }));

  if (!passwordMatches(password ?? '')) {
    return new Response(JSON.stringify({ error: 'Wrong password.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Session cookie, HttpOnly so page scripts can't read it. Not `Secure`:
      // this only ever runs on http://localhost during `astro dev`.
      'set-cookie': `${COOKIE}=${issueToken()}; Path=/; HttpOnly; SameSite=Strict`,
    },
  });
};
