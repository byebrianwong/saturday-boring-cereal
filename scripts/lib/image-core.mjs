// Shared box-image normalization, used by both:
//   scripts/image.mjs  — set a photo on an existing cereal from a URL/file
//   scripts/find.mjs   — pull the photo that came with a picked search result
//
// The site renders `boxImage` as the FRONT FACE of a CSS 3D box that already
// applies its own rotateY(-20deg) perspective, so the source must be a flat,
// straight-on package front. Everything here is about getting an arbitrary
// source image into that shape: trim margins → flatten onto white → fit to the
// 240x320 face ratio at 900px wide → JPEG.

import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { UA } from './enrich-core.mjs';

// The box face is 240x320 in the design; 900px wide keeps it crisp on retina.
export const FACE_RATIO = 240 / 320;
export const OUT_WIDTH = 900;
export const OUT_HEIGHT = Math.round(OUT_WIDTH / FACE_RATIO);

// Fetch a URL or read a local path. Throws with a readable message; callers
// decide whether that's fatal (image.mjs) or just skippable (find.mjs).
export async function loadImage(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText} — ${src}`);
    const type = res.headers.get('content-type') || '';
    if (!/^image\//.test(type)) throw new Error(`that URL returned ${type || 'no content-type'}, not an image — ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!existsSync(src)) throw new Error(`no such file: ${src}`);
  return readFileSync(src);
}

// Normalize to the box face. Returns the JPEG plus the measurements callers
// report ("1200x1200 → trimmed 980x1100 → 900x1200"), and how much a cover crop
// would discard so a tall bag losing its top and bottom is visible, not silent.
export async function normalizeBoxImage(input, { trim = true, fit = 'cover' } = {}) {
  let pipe = sharp(input);
  const before = await pipe.metadata();
  if (trim) pipe = pipe.trim();
  // Flatten after trimming: trimming a transparent PNG first keeps the margins
  // tight, and JPEG can't carry alpha anyway.
  pipe = pipe.flatten({ background: '#ffffff' });

  const trimmed = await pipe.toBuffer({ resolveWithObject: true });
  const t = trimmed.info;

  const srcRatio = t.width / t.height;
  const lost = srcRatio > FACE_RATIO
    ? { axis: 'sides', pct: Math.round((1 - FACE_RATIO / srcRatio) * 100) }
    : { axis: 'top and bottom', pct: Math.round((1 - srcRatio / FACE_RATIO) * 100) };

  const out = await sharp(trimmed.data)
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit, position: 'center', background: '#ffffff' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return { out, before, trimmed: t, lost };
}
