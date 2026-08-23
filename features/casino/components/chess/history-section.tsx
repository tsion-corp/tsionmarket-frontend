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
import { cn } from "@/lib/utils";
import type { ChessMatch } from "@/features/casino/lib/api/types";
import { ChessRatingPanel } from "@/features/casino/components/chess/chess-rating-panel";

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
    <section className="min-h-[calc(100svh-60px)] bg-black text-white">
      <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-20 sm:px-6">
        {wallet.connected ? <ChessRatingPanel /> : null}
        <div className="mb-3 flex items-center gap-3">
          <div className="ws-display text-[18px] text-[#f0f1f2]">{t("historyTitle")}</div>
          <div className="h-px flex-1 bg-[#2f3336]" />
        </div>
        {error ? (
          <CasinoError error={error} subject={t("historyTitle")} onRetry={refetch} />
        ) : isLoading ? (
          <CasinoLoading rows={4} />
        ) : matches.length === 0 ? (
          <CasinoEmpty>{t("historyEmpty")}</CasinoEmpty>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border border-[#292b2d] bg-[#0b0c0d] shadow-[0_26px_80px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div className="min-w-[680px]">
              {matches.map((m) => {
                const finished = m.state === "settled";
                const opponent = opponentName(m, wallet.address);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "grid grid-cols-[2fr_1fr_1fr_150px] items-center gap-2 border-t border-[#292e32] px-4.5 py-3 text-[13px] transition-colors first:border-t-0 hover:bg-[#1b1f22]",
                      !finished && "bg-[#111214]"
                    )}
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/casino/chess/${finished ? "review" : "play"}?match=${m.id}`}
                        className="block truncate font-medium text-[#eef0f1] transition-colors hover:text-white"
                      >
                        {opponent ?? t("waiting")}
                      </Link>
                      <div className="text-[11.5px] font-normal text-[#767d82]">
                        {new Date(m.createdAt).toLocaleDateString()}
                        {m.stakeUsdc ? (
                          <span className="text-[#aeb3b7]">
                            {" · "}
                            {t("stakedFor", { amount: m.stakeUsdc })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="font-normal text-[#a2a8ac]">
                      {m.clockMode === "unlimited"
                        ? m.timeControl
                        : parseTimeControl(m.timeControl).initialSeconds <= 30
                          ? t("blitz", { tc: m.timeControl })
                          : t("rapid", { tc: m.timeControl })}
                    </div>
                    <div className="font-normal text-[#c7cbce]">
                      {finished ? (
                        resultLabel(m, wallet.address, tPlay)
                      ) : (
                        <span className="inline-flex rounded-full border border-[#343638] bg-[#08090a] px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.03em] text-[#b9c0c4]">
                          {tLobby("liveNow")}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      {finished ? (
                        <button
                          onClick={() => void onDownload(m)}
                          disabled={fetchingPgn === m.id}
                          className="cursor-pointer rounded-full border border-[#454c52] bg-[#171a1d] px-3.5 py-1.5 font-sans text-[12px] font-semibold text-[#bfc4c7] transition-colors hover:border-[#737c83] hover:bg-[#282d31] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
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
    </section>
  );
}
