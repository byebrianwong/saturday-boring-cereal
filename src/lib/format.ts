/** "4g" for numbers, "not listed" for null/undefined. */
export function grams(v: number | null | undefined): string {
  return v == null ? 'not listed' : `${v}g`;
}

/** Short form for price tags: "PRO 4g" style, hiding missing values. */
export function gramsShort(v: number | null | undefined): string | null {
  return v == null ? null : `${v}g`;
}

export function percent(v: number | null | undefined): string {
  return v == null ? 'not listed' : `${v}%`;
}

export function milligrams(v: number | null | undefined): string {
  return v == null ? 'not listed' : `${v}mg`;
}

export function plain(v: number | null | undefined): string {
  return v == null ? 'not listed' : String(v);
}

// Frontmatter dates parse as UTC midnight; format in UTC so the day never shifts.
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function receiptDate(d: Date): string {
  return d
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      timeZone: 'UTC',
    })
    .toUpperCase();
}

/** Ratings render with one decimal: 8 -> "8.0"; null (no Taste score) -> "—" */
export function rating(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1);
}
