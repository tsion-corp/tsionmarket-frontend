interface CoinBadgeProps {
  sym: string;
  bg: string;
  size?: number;
}

// The lettered disc an asset gets when it has no icon and no logo. A ticker
// can be nine characters ("syrupUSDC") and the disc is 36px, so the badge keeps
// the first four letters at row size and three at chip size, upper case, and
// clips its box; a short ticker prints whole, as it always did.
export function CoinBadge({ sym, bg, size = 36 }: CoinBadgeProps) {
  const round = size > 24 ? 11 : 999;
  const font = size > 24 ? 12 : 10;
  const letters = size > 24 ? 4 : 3;
  const label = sym.length > letters ? sym.slice(0, letters).toUpperCase() : sym;
  return (
    <span
      title={sym.length > letters ? sym : undefined}
      className="grid shrink-0 place-items-center overflow-hidden leading-none font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: round,
        fontSize: font,
        background: bg,
      }}
    >
      {label}
    </span>
  );
}
