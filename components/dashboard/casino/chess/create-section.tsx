"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateChallenge } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { potBreakdown, usdToWei, weiToUnits } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ChessTimeControl } from "@/lib/casino/api/types";

const TIME_CONTROLS: ChessTimeControl[] = ["3+2", "5+3", "10+0", "15+10"];

export function CreateSection() {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const create = useCreateChallenge();

  const [mode, setMode] = useState<"invite" | "auto">("invite");
  const [stakeInput, setStakeInput] = useState("");
  const [timeControl, setTimeControl] = useState<ChessTimeControl>("5+3");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // The stake is typed in the player's own currency and converted once, here,
  // so every figure below derives from the same exact on-chain amount.
  const stakeUsd = Number(stakeInput) || 0;
  const stakeWei = usdToWei(stakeUsd, wallet.unitPriceUsd);
  const { feeWei, payoutWei } = potBreakdown(stakeWei);
  const toUsd = (wei: bigint) => weiToUnits(wei.toString()) * wallet.unitPriceUsd;

  const priced = wallet.unitPriceUsd > 0;
  const affordable = stakeWei > 0n && wallet.canAfford(stakeWei);
  const canCreate = affordable && priced && !create.isPending;

  const onCreate = async () => {
    if (!wallet.connected) {
      toast.error("Connect your wallet to create a game.");
      return;
    }
    if (!canCreate) return;
    const id = toast.loading("Locking your stake…");
    try {
      const { challenge, ticket } = await create.mutateAsync({
        stakeWei: stakeWei.toString(),
        timeControl,
        mode,
      });
      if (mode === "auto" && ticket) {
        toast.success("Stake locked. Finding you an opponent.", { id });
        router.push(`/casino/chess/matchmaking?ticket=${ticket.id}`);
        return;
      }
      toast.success("Stake locked. Share your invite link.", { id });
      setInviteUrl(
        challenge.inviteCode
          ? `${window.location.origin}/casino/chess/invite?code=${challenge.inviteCode}`
          : null
      );
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't create that game."), { id });
    }
  };

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 font-sans text-[13px] transition-colors ${
      active ? "bg-accent text-ink border-accent font-semibold" : "text-white hover:bg-white/6"
    }`;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20 sm:px-6">
      <div className="ws-display mb-6 text-[26px]">Create staked game</div>

      <div className="ws-inset mb-5 flex gap-2 rounded-full p-1">
        {(["invite", "auto"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setInviteUrl(null);
            }}
            className={`flex-1 cursor-pointer rounded-full py-2.5 font-sans text-[13px] font-semibold transition-colors ${
              mode === m ? "text-ink bg-white" : "text-white/50"
            }`}
          >
            {m === "invite" ? "Invite by link" : "Match me automatically"}
          </button>
        ))}
      </div>

      <div className="ws-glass mb-4.5 rounded-2xl p-5.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
            Stake amount
          </span>
          <span className="tnum text-[11.5px] font-normal text-white/45">
            Balance {wallet.format(wallet.balanceUsd)}
          </span>
        </div>
        <input
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="0.00"
          className="ws-inset tnum focus:border-accent/50 mb-4.5 w-full rounded-[10px] px-3.5 py-2.5 font-sans text-[20px] text-white outline-none"
        />
        <div className="mb-2.5 text-[11px] font-normal tracking-[0.05em] text-white/50 uppercase">
          Time control
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc}
              onClick={() => setTimeControl(tc)}
              className={chipClass(timeControl === tc)}
            >
              {tc}
            </button>
          ))}
        </div>
      </div>

      <div className="ws-glass tnum mb-4.5 rounded-2xl p-5.5 text-[13px]">
        <div className="mb-2 flex justify-between">
          <span className="font-normal text-white/50">Your stake</span>
          <span>{wallet.format(stakeUsd)}</span>
        </div>
        <div className="mb-2 flex justify-between">
          <span className="font-normal text-white/50">Participation fee (5% of pot)</span>
          <span className="font-normal text-white/50">−{wallet.format(toUsd(feeWei))}</span>
        </div>
        <div className="flex justify-between border-t border-white/8 pt-2.5">
          <span>Potential winnings</span>
          <span className="text-grey-100 text-[17px]">{wallet.format(toUsd(payoutWei))}</span>
        </div>
        <div className="mt-1.5 text-[11px] font-normal text-white/50">
          Your stake is held in escrow until the game settles.
        </div>
      </div>

      {inviteUrl ? (
        <div className="border-accent/35 rounded-[14px] border bg-white/4 px-5 py-4.5">
          <div className="mb-2 text-[12px] font-normal text-white/50">
            Your stake is locked. Share this link — it returns to you if nobody joins.
          </div>
          <div className="flex gap-2">
            <div className="text-accent ws-inset min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-[12px]">
              {inviteUrl}
            </div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl);
                toast.success("Link copied.");
              }}
              className="bg-accent text-ink cursor-pointer rounded-lg px-4 font-sans text-[12px] font-bold"
            >
              Copy
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => void onCreate()}
          disabled={!canCreate}
          className="text-ink w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[14px] font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {create.isPending
            ? "Locking stake…"
            : !priced
              ? "Balance unavailable"
              : stakeUsd <= 0
                ? "Enter a stake"
                : !affordable
                  ? "Not enough balance"
                  : mode === "invite"
                    ? "Lock stake & get invite link"
                    : "Lock stake & find opponent"}
        </button>
      )}
    </div>
  );
}
