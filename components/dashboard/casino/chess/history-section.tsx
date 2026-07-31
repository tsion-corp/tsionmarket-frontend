"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useChessHistory } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { fetchPgn } from "@/lib/casino/api/chess";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { toast } from "@/lib/toast";
import type { ChessMatch } from "@/lib/casino/api/types";

// The result of a finished game from this player's side of the board: won,
// lost, drawn, or aborted before it counted.
function resultKey(
  match: ChessMatch,
  wallet: string | null
): "resultYouWon" | "resultYouLost" | "resultDraw" | "resultAborted" {
  if (!match.result) return "resultAborted";
  if (match.result.kind === "draw") return "resultDraw";
  const mine = wallet?.toLowerCase();
  const winner = match.result.winner === "w" ? match.white : match.black;
  return winner?.walletAddress?.toLowerCase() === mine ? "resultYouWon" : "resultYouLost";
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
                      href={`/casino/chess/play?match=${m.id}`}
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
                    {m.timeControl === "3+2" || m.timeControl === "5+3"
                      ? t("blitz", { tc: m.timeControl })
                      : t("rapid", { tc: m.timeControl })}
                  </div>
                  <div className={finished ? "text-white/80" : "text-up font-normal"}>
                    {finished ? tPlay(resultKey(m, wallet.address)) : tLobby("liveNow")}
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
