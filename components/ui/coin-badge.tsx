interface CoinBadgeProps {
  sym: string;
  bg: string;
  size?: number;
}

export function CoinBadge({ sym, bg, size = 36 }: CoinBadgeProps) {
  const round = size > 24 ? 11 : 999;
  const font = size > 24 ? 12 : 10;
  return (
    <span
      className="grid shrink-0 place-items-center font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: round,
        fontSize: font,
        background: bg,
      }}
    >
      {sym}
    </span>
  );
}
