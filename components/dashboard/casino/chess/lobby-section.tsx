"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAcceptChallenge, useChessLobby, useCreateChallenge } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { amountUsd, usdToWei } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ChessChallenge, ChessTimeControl } from "@/lib/casino/api/types";

function timeControlLabel(tc: string): string {
  return tc === "3+2" || tc === "5+3" ? `${tc} Blitz` : `${tc} Rapid`;
}

// Quick match pairs players at the same stake and time control, so it settles
// on one time control rather than asking. Anyone who wants a different one
// uses Create staked game.
const QUICK_MATCH_TIME_CONTROL: ChessTimeControl = "5+3";

export function LobbySection() {
  const router = useRouter();
  const { challenges, liveMatches, isLoading, error, refetch } = useChessLobby();
  const wallet = useCasinoWallet();
  const accept = useAcceptChallenge();
  const create = useCreateChallenge();
  const [quickStake, setQuickStake] = useState("");

  const quickStakeUsd = Number(quickStake) || 0;
  const quickStakeWei = usdToWei(quickStakeUsd, wallet.unitPriceUsd);
  const quickAffordable = quickStakeWei > 0n && wallet.canAfford(quickStakeWei);

  // Quick match escrows the stake and enters the queue in one step, then
  // follows the search. Without a stake there is nothing to pair on, which is
  // why the amount is asked for here rather than on the search screen.
  const onQuickMatch = async () => {
    if (!wallet.connected) {
      toast.error("Connect your wallet to play.");
      return;
    }
    if (!quickAffordable) return;
    const id = toast.loading("Locking your stake…");
    try {
      const { ticket } = await create.mutateAsync({
        stakeWei: quickStakeWei.toString(),
        timeControl: QUICK_MATCH_TIME_CONTROL,
        mode: "auto",
      });
      if (!ticket) throw new Error("The queue didn't give us a search to follow.");
      toast.success("Stake locked. Finding you an opponent.", { id });
      // A search that paired instantly still goes through this screen, which
      // sends the player straight on into the match.
      router.push(`/casino/chess/matchmaking?ticket=${ticket.id}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't start a quick match."), { id });
    }
  };

  // Joining escrows the joiner's stake, so it is blocked when the balance
  // can't cover it. The wallet is the platform's, so topping up is the same
  // flow as everywhere else in the app.
  const onJoin = async (challenge: ChessChallenge) => {
    if (!wallet.connected) {
      toast.error("Connect your wallet to play.");
      return;
    }
    if (!wallet.canAfford(challenge.stake.wei)) {
      toast.error("Not enough balance for this stake. Add money and try again.");
      return;
    }
    const id = toast.loading("Locking your stake…");
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
          <div className="ws-display mb-1 text-[20px]">Create staked game</div>
          <div className="text-[12.5px] font-normal opacity-65">
            Set your stake and time control
          </div>
        </Link>
        <div className="ws-glass min-w-[260px] flex-1 rounded-2xl px-6 py-5 text-white">
          <div className="ws-display mb-1 text-[20px]">Quick match</div>
          <div className="mb-3 text-[12.5px] font-normal text-white/55">
            Set a stake and we&apos;ll pair you with someone at the same one ·{" "}
            {timeControlLabel(QUICK_MATCH_TIME_CONTROL)}
          </div>
          <div className="flex gap-2">
            <input
              value={quickStake}
              onChange={(e) => setQuickStake(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onQuickMatch();
              }}
              inputMode="decimal"
              placeholder="Stake"
              aria-label="Quick match stake"
              className="ws-inset tnum focus:border-accent/50 min-w-0 flex-1 rounded-lg px-3 py-2 font-sans text-[14px] text-white outline-none"
            />
            <button
              onClick={() => void onQuickMatch()}
              disabled={!quickAffordable || create.isPending}
              className="text-ink shrink-0 cursor-pointer rounded-lg bg-white px-4 font-sans text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
            >
              {create.isPending ? "Starting…" : "Find opponent"}
            </button>
          </div>
          {quickStakeUsd > 0 && !quickAffordable ? (
            <div className="mt-2 text-[11.5px] font-normal text-white/50">
              Not enough balance for that stake.
            </div>
          ) : null}
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
                  <div className="flex items-center justify-between">
                    <div className="tnum text-[12px] font-normal text-white/50">
                      {m.timeControl}
                    </div>
                    <div className="ws-display tnum text-grey-100 text-[16px]">
                      {wallet.format(amountUsd(m.pot, wallet.unitPriceUsd))}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] font-normal text-white/50">
                    {m.spectatorCount} watching
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
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] bg-white/4 px-4.5 py-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
                  <div>Opponent</div>
                  <div>Rating</div>
                  <div>Stake</div>
                  <div>Time control</div>
                  <div />
                </div>
                {challenges.map((c) => {
                  const affordable = wallet.canAfford(c.stake.wei);
                  return (
                    <div
                      key={c.id}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] items-center border-t border-white/6 px-4.5 py-3 text-[13px]"
                    >
                      <div className="truncate">{c.creator.username}</div>
                      <div className="tnum font-normal text-white/50">{c.creator.rating}</div>
                      <div className="tnum text-grey-100">
                        {wallet.format(amountUsd(c.stake, wallet.unitPriceUsd))}
                      </div>
                      <div className="font-normal text-white/50">
                        {timeControlLabel(c.timeControl)}
                      </div>
                      <button
                        onClick={() => void onJoin(c)}
                        disabled={accept.isPending || !affordable}
                        title={affordable ? undefined : "Not enough balance for this stake"}
                        className="bg-up text-up-ink cursor-pointer rounded-full py-1.5 text-center font-sans text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {accept.isPending ? "…" : "Join"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
