"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChessDialogFrame } from "@/features/casino/components/chess/chess-dialog-frame";
import { MENU_CARD_BG, MENU_SHADOW } from "@/features/casino/components/game-menu";
import { FlameIcon } from "@/components/ui/icons";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import {
  DRAUGHTS_VARIANT_OPTIONS,
  variantOption,
  type PlayableDraughtsVariant,
} from "@/features/casino/lib/draughts/variants";

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
  const [variant, setVariant] = useState<PlayableDraughtsVariant | "all">("all");
  const visible =
    variant === "all" ? matches : matches.filter((match) => match.variant === variant);

  return (
    <ChessDialogFrame open={open} onClose={onClose} title="Live now" icon={<FlameIcon size={18} />}>
      <label className="mb-3 block">
        <span className="sr-only">Filter games by variant</span>
        <select
          value={variant}
          onChange={(event) => setVariant(event.target.value as PlayableDraughtsVariant | "all")}
          className="h-10 w-full rounded-[6px] border border-white/12 bg-[#171819] px-3 text-[12.5px] text-white/75 outline-none focus:border-white/30"
        >
          <option value="all">All variants</option>
          {DRAUGHTS_VARIANT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {visible.length === 0 ? (
        <p className="px-1 py-6 text-center font-sans text-[13px] text-white/40">
          No {variant === "all" ? "games are" : "games in this variant are"} running right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((match) => (
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
                  {variantOption(match.variant).shortLabel} · {match.timeControl}
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
