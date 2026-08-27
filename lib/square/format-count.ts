/**
 * Compact tallies for the action row: 1247 → "1.2K".
 *
 * Feeds show four numbers per post; rendered in full they become the widest
 * thing in the row and push the controls apart at exactly the sizes where
 * space is tightest. Rounding is DOWN, so a count never claims to be larger
 * than it is — "1.9K" for 1999 rather than the "2K" that rounding would give.
 *
 * Pure and dependency-free so it can be pinned without a renderer.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const n = Math.floor(value);
  if (n < 1_000) return String(n);

  for (const [size, suffix] of [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ] as const) {
    if (n < size) continue;
    // One decimal below ten of the unit (1.2K), none above (12K) — the extra
    // digit stops being informative once the leading number is two digits.
    const scaled = n / size;
    const shown = scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled);
    return `${shown}${suffix}`;
  }
  return String(n);
}
