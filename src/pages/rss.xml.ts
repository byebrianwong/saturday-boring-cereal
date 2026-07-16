import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

// Hand-rolled RSS (no dependency). Reviews, newest first.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(context: APIContext) {
  const site = context.site?.href ?? 'http://localhost:4321/';
  const cereals = await getCollection('cereals');
  const items = [...cereals]
    .sort((a, b) => b.data.dateReviewed.getTime() - a.data.dateReviewed.getTime())
    .map((c) => {
      const link = new URL(`cereals/${c.id}/`, site).href;
      const score = c.data.rating == null ? 'unrated' : `${c.data.rating.toFixed(1)}/10`;
      const title = `${c.data.brand} ${c.data.name} — ${score}`;
      const desc = c.data.shortNote ?? 'Ranked and measured. No long-form note on file.';
      return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${c.data.dateReviewed.toUTCString()}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Saturday Boring Cereal — Receipts</title>
    <link>${esc(site)}</link>
    <description>One man's rankings of granolas and healthier cereals, printed at the register.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
