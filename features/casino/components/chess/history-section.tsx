"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useChessHistory } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { fetchPgn } from "@/features/casino/lib/api/chess";
import { parseTimeControl } from "@/features/casino/lib/api/chess-wire";
import { CasinoEmpty, CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { toast } from "@/lib/toast";
import type { ChessMatch } from "@/features/casino/lib/api/types";

const DRAW_REASON_KEYS = {
  stalemate: "reasonStalemate",
  agreement: "reasonAgreement",
  repetition: "reasonRepetition",
  insufficient: "reasonInsufficient",
} as const;

// The result of a finished game from this player's side of the board, spelled
// out with the manner it ended ("Checkmate · You won"). Every win/loss/draw
// message carries a variable, so the label is formatted here rather than handed
// back as a bare key; mirrors the play screen so both lists read identically.
function resultLabel(
  match: ChessMatch,
  wallet: string | null,
  t: ReturnType<typeof useTranslations>
): string {
  const r = match.result;
  if (!r) return t("resultAborted");
  if (r.kind === "draw") return t("resultDraw", { reason: t(DRAW_REASON_KEYS[r.reason]) });
  const how =
    r.kind === "checkmate"
      ? t("howCheckmate")
      : r.kind === "resignation"
        ? t("howResignation")
        : t("howTimeout");
  const mine = wallet?.toLowerCase();
  const winner = r.winner === "w" ? match.white : match.black;
  const youWon = winner?.walletAddress?.toLowerCase() === mine;
  return youWon ? t("resultYouWon", { how }) : t("resultYouLost", { how });
}

function opponentName(match: ChessMatch, wallet: string | null): string | null {
  const mine = wallet?.toLowerCase();
  const other = match.white?.walletAddress?.toLowerCase() === mine ? match.black : match.white;
  return other?.username ?? null;
}

// Serves the PGN the service keeps for the game as a plain-text download.
async function downloadPgn(match: ChessMatch): Promise<void> {
  const pgn = await fetchPgn(match.id);
  const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `chess-${match.id}.pgn`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistorySection() {
  const t = useTranslations("casino.chess.common");
  const tPlay = useTranslations("casino.chess.play");
  const tLobby = useTranslations("casino.chess.lobby");
  const wallet = useCasinoWallet();
  const { matches, isLoading, error, refetch } = useChessHistory();
  const [fetchingPgn, setFetchingPgn] = useState<string | null>(null);

  const onDownload = async (match: ChessMatch) => {
    setFetchingPgn(match.id);
    try {
      await downloadPgn(match);
    } catch {
      toast.error(t("pgnFailed"));
    } finally {
      setFetchingPgn(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-20 sm:px-6">
      <div className="ws-display mb-3 text-[18px]">{t("historyTitle")}</div>
      {error ? (
        <CasinoError error={error} subject={t("historyTitle")} onRetry={refetch} />
      ) : isLoading ? (
        <CasinoLoading rows={4} />
      ) : matches.length === 0 ? (
        <CasinoEmpty>{t("historyEmpty")}</CasinoEmpty>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-white/8">
          <div className="min-w-[680px]">
            {matches.map((m) => {
              const finished = m.state === "settled";
              const opponent = opponentName(m, wallet.address);
              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[2fr_1fr_1fr_150px] items-center gap-2 border-t border-white/6 px-4.5 py-3 text-[13px] first:border-t-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/casino/chess/${finished ? "review" : "play"}?match=${m.id}`}
                      className="block truncate text-white hover:underline"
                    >
                      {opponent ?? t("waiting")}
                    </Link>
                    <div className="text-[11.5px] font-normal text-white/45">
                      {new Date(m.createdAt).toLocaleDateString()}
                      {m.stakeUsdc ? (
                        <span className="text-white/60">
                          {" · "}
                          {t("stakedFor", { amount: m.stakeUsdc })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="font-normal text-white/50">
                    {/* Classify by the move budget in seconds so both per-move
                        controls ("30s") and legacy "min+inc" labels read right;
                        a short budget is Blitz, a longer one Rapid. */}
                    {parseTimeControl(m.timeControl).initialSeconds <= 30
                      ? t("blitz", { tc: m.timeControl })
                      : t("rapid", { tc: m.timeControl })}
                  </div>
                  <div className={finished ? "text-white/80" : "text-up font-normal"}>
                    {finished ? resultLabel(m, wallet.address, tPlay) : tLobby("liveNow")}
                  </div>
                  <div className="text-right">
                    {finished ? (
                      <button
                        onClick={() => void onDownload(m)}
                        disabled={fetchingPgn === m.id}
                        className="cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[12px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {fetchingPgn === m.id ? "…" : t("downloadPgn")}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
