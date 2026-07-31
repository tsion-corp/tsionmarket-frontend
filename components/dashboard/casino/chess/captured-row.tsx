import { PIECE_GLYPHS } from "@/components/dashboard/casino/chess/piece-art";
import type { PieceType } from "@/lib/casino/chess/engine";

// The pieces a player has captured, with a material lead (+N pawns) when they
// are ahead. Renders nothing before the first capture, so player rows stay clean
// at the start of a game. Shared by the play and spectate boards.
export function CapturedRow({ pieces, lead }: { pieces: PieceType[]; lead: number }) {
  if (pieces.length === 0 && lead <= 0) return null;
  return (
    <div className="mt-0.5 flex items-center gap-px text-[13px] leading-none text-white/40">
      {pieces.map((piece, i) => (
        <span key={i}>{PIECE_GLYPHS[piece]}</span>
      ))}
      {lead > 0 ? (
        <span className="ml-1 text-[10.5px] font-semibold text-white/55">+{lead}</span>
      ) : null}
    </div>
  );
}
