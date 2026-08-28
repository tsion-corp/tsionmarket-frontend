/**
 * The four engagement glyphs, drawn on ONE baseline.
 *
 * They were four unrelated paths before, each sitting wherever its own artwork
 * happened to fall inside a 24x24 box — so the heart rode low, the bars rode
 * high, and a row of them visibly bounced. Centring the SVG boxes does not fix
 * that: the boxes were already aligned, it is the INK inside them that was not.
 *
 * So every path here is drawn to the same optical bounds — ink spans y≈4 to
 * y≈20, horizontally centred — and they share one stroke weight and cap. That
 * is what makes them sit level, and it is why they live in one module rather
 * than being pasted per card: two copies drift the moment one is tweaked.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconComment({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z"
        {...STROKE}
      />
    </svg>
  );
}

export function IconRepost({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M5 10.5V9a3 3 0 0 1 3-3h8m0 0-2.5-2.5M16 6l-2.5 2.5" {...STROKE} />
      <path d="M19 13.5V15a3 3 0 0 1-3 3H8m0 0 2.5 2.5M8 18l2.5-2.5" {...STROKE} />
    </svg>
  );
}

export function IconLike({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="M12 20c-.3 0-.6-.11-.83-.32C7.47 16.4 4 13.2 4 9.5A4.5 4.5 0 0 1 12 6.75 4.5 4.5 0 0 1 20 9.5c0 3.7-3.47 6.9-7.17 10.18-.23.21-.53.32-.83.32Z"
        {...STROKE}
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

export function IconViews({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M5 20v-5.5M11 20V9M17 20v-8M21 20V4.5" {...STROKE} />
    </svg>
  );
}
