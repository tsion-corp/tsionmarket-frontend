import type { PieceColor, PieceType } from "@/features/casino/lib/chess/engine";

// The neo piece set (public/piece/neo/). See its NOTICE.txt on licensing.
function pieceSrc(color: PieceColor, type: PieceType): string {
  return `/piece/neo/${color}${type}.png`;
}

// Captured pieces read left-to-right cheapest first, the way a board lines them
// up, and pieces of the same type nest so a fistful of pawns stays compact.
const ORDER: Record<PieceType, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

// The pieces a player has captured, shown as small icons in the captured
// pieces' own colour, with a material lead (+N) when the player is ahead.
// Renders nothing before the first capture, so player rows stay clean at the
// start. `color` is the colour of the captured pieces themselves.
export function CapturedRow({
  pieces,
  lead,
  color,
}: {
  pieces: PieceType[];
  lead: number;
  color: PieceColor;
}) {
  if (pieces.length === 0 && lead <= 0) return null;
  const sorted = [...pieces].sort((a, b) => ORDER[a] - ORDER[b]);
  return (
    <div className="mt-0.5 flex items-center leading-none">
      <span className="flex items-center">
        {sorted.map((type, i) => {
          // Nest a run of the same piece; step out again at each new type.
          const startsGroup = i === 0 || sorted[i - 1] !== type;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={pieceSrc(color, type)}
              alt=""
              draggable={false}
              className={`h-[15px] w-[15px] opacity-80 select-none ${startsGroup ? "" : "-ml-[9px]"}`}
            />
          );
        })}
      </span>
      {lead > 0 ? (
        <span className="ml-1 text-[10.5px] font-semibold text-white/55">+{lead}</span>
      ) : null}
    </div>
  );
}
