// Identicon-style fallback for assets with no real logo: the symbol hashes to
// a stable pair of hues and a gradient angle, so every unknown asset gets a
// distinct, recognisable circle instead of a text badge — and the same asset
// always renders the same colours.

function hashSymbol(sym: string): number {
  let h = 0;
  for (const ch of sym) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

interface GradientCoinProps {
  sym: string;
  size?: number;
}

export function GradientCoin({ sym, size = 36 }: GradientCoinProps) {
  const h = hashSymbol(sym.toUpperCase());
  const hueA = h % 360;
  const hueB = (hueA + 60 + ((h >> 3) % 160)) % 360;
  const angle = (h >> 5) % 360;
  return (
    <span
      aria-label={sym}
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(${angle}deg, hsl(${hueA} 65% 55%), hsl(${hueB} 70% 38%))`,
      }}
    />
  );
}
