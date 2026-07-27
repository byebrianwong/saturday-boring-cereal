// Password gate for the dev-only admin.
//
// This whole section is injected only during `astro dev` (see astro.config.mjs),
// so it's reachable at localhost and never ships in `dist/`. The gate exists to
// stop someone on the same network — or a stray browser tab — from writing to
// your content directory, not to survive the public internet. If this ever gets
// promoted to a deployed host, the password becomes the only thing between the
// world and write access to the repo, and it needs to be a real secret plus a
// rate limit; see the note in README under "Web admin".

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const COOKIE = 'sbc_admin';
const DEFAULT_PASSWORD = 'cereal';

// A per-process secret: restarting the dev server invalidates old cookies,
// which is the right lifetime for a local admin session.
const SECRET = randomBytes(32);

export function configuredPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

export function usingDefaultPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex');
}

// Constant-time compare that doesn't leak length via an early return.
export function passwordMatches(attempt: string): boolean {
  const a = createHmac('sha256', SECRET).update(String(attempt)).digest();
  const b = createHmac('sha256', SECRET).update(configuredPassword()).digest();
  return timingSafeEqual(a, b);
}

export function issueToken(): string {
  return `v1.${sign('ok')}`;
}

export function tokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const expected = issueToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthed(request: Request): boolean {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return tokenValid(match?.[1]);
}

// Shared 401 for the API routes.
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Not signed in.' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
