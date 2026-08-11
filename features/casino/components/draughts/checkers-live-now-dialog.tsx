"use client";

import { useRouter } from "next/navigation";
import { ChessDialogFrame } from "@/features/casino/components/chess/chess-dialog-frame";
import { MENU_CARD_BG, MENU_SHADOW } from "@/features/casino/components/game-menu";
import { FlameIcon } from "@/components/ui/icons";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";

function seatLabel(match: DraughtsMatch): string {
  const white = match.white?.username ?? "Open seat";
  const black = match.black?.username ?? "Open seat";
  return `${white} vs ${black}`;
}

/** Games under way right now, offered to watch. */
export function CheckersLiveNowDialog({
  open,
  onClose,
  matches,
}: {
  open: boolean;
  onClose: () => void;
  matches: DraughtsMatch[];
}) {
  const router = useRouter();

  return (
    <ChessDialogFrame open={open} onClose={onClose} title="Live now" icon={<FlameIcon size={18} />}>
      {matches.length === 0 ? (
        <p className="px-1 py-6 text-center font-sans text-[13px] text-white/40">
          No games are running right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {matches.map((match) => (
            <li
              key={match.id}
              className="flex items-center gap-3 rounded-[8px] px-4 py-3"
              style={{ background: MENU_CARD_BG, boxShadow: MENU_SHADOW }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-sans text-[13.5px] font-medium text-white">
                  {seatLabel(match)}
                </div>
                <div className="truncate text-[12px] text-white/64">
                  {match.wager ? `${match.wager.stakeUsdc} USDC · ` : ""}
                  {match.timeControl}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/casino/checkers/play?match=${match.id}`);
                }}
                className="text-ink cursor-pointer rounded-full bg-white px-4 py-2 text-[11.5px] font-medium"
              >
                Watch
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChessDialogFrame>
  );
}
