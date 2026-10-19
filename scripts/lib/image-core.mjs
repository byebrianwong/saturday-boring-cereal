// Shared box-image normalization, used by both:
//   scripts/image.mjs  — set a photo on an existing cereal from a URL/file
//   scripts/find.mjs   — pull the photo that came with a picked search result
//
// The site renders `boxImage` as the FRONT FACE of a CSS 3D box that already
// applies its own rotateY(-20deg) perspective, so the source must be a flat,
// straight-on package front. Everything here is about getting an arbitrary
// source image into that shape: trim margins → flatten onto white → fit to the
// 240x320 face ratio at 900px wide → JPEG.
//
// Bars are the exception. A bar comes in a wrapper, which is wide, so a bar's
// photo is fitted to a 5:2 wrapper instead and shown flat. 5:2 is what real
// wrappers measure: three clean Open Food Facts fronts (Barebells Salty Peanut,
// Barebells Caramel Cashew, KIND Dark Chocolate Nuts & Sea Salt) came out at
// 2.43, 2.72 and 2.50 after trimming, measured 2026-10-18.

import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { UA } from './enrich-core.mjs';

// The box face is 240x320 in the design; 900px wide keeps it crisp on retina.
export const FACE_RATIO = 240 / 320;
export const OUT_WIDTH = 900;
export const OUT_HEIGHT = Math.round(OUT_WIDTH / FACE_RATIO);

// Output shape per kind of package. `box` is every cereal and snack; `wrapper`
// is a bar. The wrapper is 1000px wide because it's shown wider than a box.
export const SHAPES = {
  box: { ratio: FACE_RATIO, width: OUT_WIDTH, height: OUT_HEIGHT },
  wrapper: { ratio: 5 / 2, width: 1000, height: 400 },
};

/** The photo shape for a product category: bars get the wrapper. */
export function shapeFor(category) {
  return category === 'bar' ? 'wrapper' : 'box';
}

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

// Normalize to the box face (or, with shape 'wrapper', a bar's wrapper).
// Returns the JPEG plus the measurements callers report ("1200x1200 → trimmed
// 980x1100 → 900x1200"), and how much a cover crop would discard so a tall bag
// losing its top and bottom is visible, not silent.
export async function normalizeBoxImage(input, { trim = true, fit = 'cover', shape = 'box' } = {}) {
  const { ratio, width, height } = SHAPES[shape] ?? SHAPES.box;
  let pipe = sharp(input);
  const before = await pipe.metadata();
  if (trim) pipe = pipe.trim();
  // Flatten after trimming: trimming a transparent PNG first keeps the margins
  // tight, and JPEG can't carry alpha anyway.
  pipe = pipe.flatten({ background: '#ffffff' });

  const trimmed = await pipe.toBuffer({ resolveWithObject: true });
  const t = trimmed.info;

  const srcRatio = t.width / t.height;
  const lost = srcRatio > ratio
    ? { axis: 'sides', pct: Math.round((1 - ratio / srcRatio) * 100) }
    : { axis: 'top and bottom', pct: Math.round((1 - srcRatio / ratio) * 100) };

  const out = await sharp(trimmed.data)
    .resize(width, height, { fit, position: 'center', background: '#ffffff' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return { out, before, trimmed: t, lost, size: { width, height } };
}
