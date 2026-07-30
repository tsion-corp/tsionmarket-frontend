"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAcceptChallenge, useChessLobby, useQuickMatch } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ChessChallenge, ChessTimeControl } from "@/lib/casino/api/types";

function timeControlLabel(tc: string): string {
  return tc === "3+2" || tc === "5+3" ? `${tc} Blitz` : `${tc} Rapid`;
}

// Quick match settles on one time control rather than asking. Anyone who wants
// a different one uses Create a game.
const QUICK_MATCH_TIME_CONTROL: ChessTimeControl = "5+3";

export function LobbySection() {
  const router = useRouter();
  const { challenges, liveMatches, isLoading, error, refetch } = useChessLobby();
  const wallet = useCasinoWallet();
  const accept = useAcceptChallenge();
  const quickMatch = useQuickMatch();

  // Takes the oldest game nobody has joined, or opens one and waits when every
  // seat is taken.
  const onQuickMatch = async () => {
    if (!wallet.connected) {
      toast.error("Connect your wallet to play.");
      return;
    }
    const id = toast.loading("Finding you a game…");
    try {
      const { matchId, waitingOn } = await quickMatch.mutateAsync({
        timeControl: QUICK_MATCH_TIME_CONTROL,
        mode: "auto",
      });
      if (matchId) {
        toast.success("Found you a game. Good luck.", { id });
        router.push(`/casino/chess/play?match=${matchId}`);
        return;
      }
      toast.success("Nobody waiting, so we opened your game.", { id });
      router.push(`/casino/chess/matchmaking?ticket=${waitingOn}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't start a quick match."), { id });
    }
  };

  const onJoin = async (challenge: ChessChallenge) => {
    if (!wallet.connected) {
      toast.error("Connect your wallet to play.");
      return;
    }
    const id = toast.loading("Joining…");
    try {
      const match = await accept.mutateAsync(challenge.id);
      toast.success("You're in. Good luck.", { id });
      router.push(`/casino/chess/play?match=${match.id}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't join that game."), { id });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-20 sm:px-6">
      <div className="mb-8 flex flex-wrap gap-3.5">
        <Link
          href="/casino/chess/create"
          className="text-ink min-w-[260px] flex-1 cursor-pointer rounded-2xl bg-white px-6 py-5 text-left transition-transform hover:-translate-y-0.5"
        >
          <div className="ws-display mb-1 text-[20px]">Create a game</div>
          <div className="text-[12.5px] font-normal opacity-65">
            Pick a time control and invite someone
          </div>
        </Link>
        <div className="ws-glass min-w-[260px] flex-1 rounded-2xl px-6 py-5 text-white">
          <div className="ws-display mb-1 text-[20px]">Quick match</div>
          <div className="mb-3 text-[12.5px] font-normal text-white/55">
            We&apos;ll sit you down against whoever is waiting ·{" "}
            {timeControlLabel(QUICK_MATCH_TIME_CONTROL)}
          </div>
          <button
            onClick={() => void onQuickMatch()}
            disabled={quickMatch.isPending}
            className="text-ink w-full cursor-pointer rounded-lg bg-white px-4 py-2.5 font-sans text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
          >
            {quickMatch.isPending ? "Starting…" : "Find opponent"}
          </button>
        </div>
      </div>

      {error ? (
        <CasinoError error={error} subject="the chess lobby" onRetry={refetch} />
      ) : isLoading ? (
        <CasinoLoading label="Loading the lobby" rows={4} />
      ) : (
        <>
          <div className="ws-display mb-3 text-[18px]">Live now</div>
          {liveMatches.length === 0 ? (
            <CasinoEmpty>No games in play yet. Create one and it shows up here.</CasinoEmpty>
          ) : (
            <div className="flex gap-3.5 overflow-x-auto pb-2">
              {liveMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/casino/chess/watch?match=${m.id}`}
                  className="ws-inset flex-[0_0_290px] cursor-pointer rounded-[14px] p-4 text-left text-white transition-colors hover:border-white/20"
                >
                  <div className="mb-2.5 flex justify-between gap-2 text-[13px]">
                    <span className="truncate">{m.white?.username ?? "Waiting"}</span>
                    <span className="font-normal text-white/50">vs</span>
                    <span className="truncate">{m.black?.username ?? "Waiting"}</span>
                  </div>
                  <div className="tnum text-[12px] font-normal text-white/50">
                    {timeControlLabel(m.timeControl)}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="ws-display mt-9 mb-3 text-[18px]">Open challenges</div>
          {challenges.length === 0 ? (
            <CasinoEmpty>No open challenges. Create one and other players can join it.</CasinoEmpty>
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-white/8">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[2fr_1fr_90px] bg-white/4 px-4.5 py-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
                  <div>Opponent</div>
                  <div>Time control</div>
                  <div />
                </div>
                {challenges.map((c) => (
                  <div
                    key={c.id}
                    className="grid grid-cols-[2fr_1fr_90px] items-center border-t border-white/6 px-4.5 py-3 text-[13px]"
                  >
                    <div className="truncate">{c.creator.username}</div>
                    <div className="font-normal text-white/50">
                      {timeControlLabel(c.timeControl)}
                    </div>
                    <button
                      onClick={() => void onJoin(c)}
                      disabled={accept.isPending}
                      className="bg-up text-up-ink cursor-pointer rounded-full py-1.5 text-center font-sans text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {accept.isPending ? "…" : "Join"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
