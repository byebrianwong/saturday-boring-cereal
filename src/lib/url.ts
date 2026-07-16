// Prefix internal links/assets with Astro's configured base path.
// BASE_URL is "/" for normal (root) builds and "/saturday-boring-cereal/" for
// the GitHub Pages build — so u('/cereals/') works in both without change.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function u(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path; // leave absolute URLs alone
  return base + (path.startsWith('/') ? path : `/${path}`);
}
