import { BRAND } from "@/lib/brand";

interface ArkMarkProps {
  // The Ark logo is a wide wordmark (186x37), so it is sized by height and
  // keeps its aspect ratio, unlike the old square icon.
  height?: number;
  className?: string;
}

// The Ark brand mark. A plain img from public/ so the SVG needs no inlining
// and can repeat on a page without id collisions.
export function ArkMark({ height = 22, className }: ArkMarkProps) {
  const width = Math.round(height * (186 / 37));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ark-logo.svg"
      alt={BRAND}
      width={width}
      height={height}
      className={className}
      style={{ width, height }}
    />
  );
}
