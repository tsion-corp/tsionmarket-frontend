"use client";

import { useRouter } from "next/navigation";
import { FlameIcon } from "@/components/ui/icons";
import { ChessDialogFrame } from "@/features/casino/components/chess/chess-dialog-frame";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PRIMARY_BUTTON_CLASS,
} from "@/features/casino/lib/chess/ui";
import { truncateAddress } from "@/lib/format";
import type { ChessMatch } from "@/features/casino/lib/api/types";

function publicLabel(
  name: string | null | undefined,
  wallet: string | null | undefined,
  fallback = "Player"
) {
  if (name && name !== "Account" && name !== "World Street user") return name;
  return wallet ? truncateAddress(wallet) : fallback;
}

function liveMatchLabel(match: ChessMatch): string {
  return `${publicLabel(match.white?.username, match.white?.walletAddress)} vs ${publicLabel(
    match.black?.username,
    match.black?.walletAddress
  )}`;
}

interface ChessLiveNowDialogProps {
  open: boolean;
  onClose: () => void;
  myMatches: ChessMatch[];
  matches: ChessMatch[];
}

export function ChessLiveNowDialog({ open, onClose, myMatches, matches }: ChessLiveNowDialogProps) {
  const router = useRouter();

  const onWatch = (matchId: string) => {
    onClose();
    router.push(`/casino/chess/watch?match=${matchId}`);
  };
  const onResume = (matchId: string) => {
    onClose();
    router.push(`/casino/chess/play?match=${matchId}`);
  };

  const hasAnyLive = myMatches.length > 0 || matches.length > 0;

  return (
    <ChessDialogFrame open={open} onClose={onClose} title="Live Now" icon={<FlameIcon size={20} />}>
      <div className="space-y-4">
        <div className="text-[13px] leading-6 text-white/60">
          Watch games that are already live, then open the market to spectate and bet from your
          chess balance.
        </div>

        {!hasAnyLive ? (
          <div
            className="rounded-[18px] border border-white/8 px-5 py-5 text-[14px] text-white/60"
            style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
          >
            No live chess games right now.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {myMatches.map((match) => (
              <div
                key={match.id}
                className="rounded-[18px] border border-white/8 px-5 py-5"
                style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
              >
                <div className="mb-2 font-sans text-[16px] leading-none font-semibold tracking-[-0.03em] text-white">
                  {liveMatchLabel(match)}
                </div>
                <div className="mb-4 text-[13px] leading-6 text-white/62">
                  {match.timeControl}
                  {match.stakeUsdc ? ` · Staked ${match.stakeUsdc} USDC` : " · Your live game"}
                </div>
                <button
                  type="button"
                  onClick={() => onResume(match.id)}
                  className={`${CHESS_PRIMARY_BUTTON_CLASS} px-4 py-2.5 font-sans text-[13px] font-medium`}
                >
                  Resume
                </button>
              </div>
            ))}
            {matches.map((match) => (
              <div
                key={match.id}
                className="rounded-[18px] border border-white/8 px-5 py-5"
                style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
              >
                <div className="mb-2 font-sans text-[16px] leading-none font-semibold tracking-[-0.03em] text-white">
                  {liveMatchLabel(match)}
                </div>
                <div className="mb-4 text-[13px] leading-6 text-white/62">
                  {match.timeControl}
                  {match.stakeUsdc ? ` · Staked ${match.stakeUsdc} USDC` : " · Casual game"}
                </div>
                <button
                  type="button"
                  onClick={() => onWatch(match.id)}
                  className={`${CHESS_PRIMARY_BUTTON_CLASS} px-4 py-2.5 font-sans text-[13px] font-medium`}
                >
                  Watch
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ChessDialogFrame>
  );
}
