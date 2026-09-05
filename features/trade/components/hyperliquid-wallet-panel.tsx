"use client";

import { useState } from "react";
import { FlashPrice } from "@/features/trade/components/flash-price";
import { HyperliquidFundModal } from "@/features/trade/components/hyperliquid-fund-modal";
import { HyperliquidWithdrawModal } from "@/features/trade/components/hyperliquid-withdraw-modal";
import type { HlClearinghouseState } from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidWalletPanelProps {
  walletId: string | null;
  walletLoading: boolean;
  clearinghouse: HlClearinghouseState | null;
  clearinghouseLoading: boolean;
  onBridge: () => Promise<void>;
  onWithdraw: (
    amountUsdc: string,
    onStatus?: (status: string) => void
  ) => Promise<{ treasuryMovementId: string }>;
  onFunded: () => void;
  busy: boolean;
}

// The perps wallet: its own funded balance, kept simple and chain-agnostic
// on purpose — "Top up" and "Withdraw" read as plain transfers to and from
// your main wallet, each a single pop-up. Underneath, top-up is a Base USDC
// transfer plus an automatic bridge to HyperCore, and withdrawal is a
// signed withdraw3 action (see apps/perp/src/signing/README.md) — neither
// is something a user should have to reason about in terms of chains or
// bridging just to move their own money, so neither word appears here.
export function HyperliquidWalletPanel({
  walletId,
  walletLoading,
  clearinghouse,
  clearinghouseLoading,
  onBridge,
  onWithdraw,
  onFunded,
  busy,
}: HyperliquidWalletPanelProps) {
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const withdrawable = clearinghouse ? Number(clearinghouse.withdrawable) : null;
  // Wallet resolution failing (a transient gateway hiccup, most commonly) is
  // not something a user should see as a scary technical error under their
  // own balance — it reads as "your money is gone" when it's really just a
  // number that hasn't loaded. Always show a real figure (0.00 until it's
  // known) and use a quiet "updating" indicator for anything in flight —
  // still resolving the wallet, still fetching the balance, or a top-up/
  // withdraw actually running — instead of a red error card.
  const updating = walletLoading || clearinghouseLoading || busy;

  return (
    <div className="ws-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs font-normal text-white/55">
          Perps Wallet Bal
          {updating ? (
            <span className="flex items-center gap-1 text-white/40">
              <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" />
              Updating…
            </span>
          ) : null}
        </span>
        <FlashPrice
          value={withdrawable ?? 0}
          className="ws-display tnum text-[34px] leading-none text-white"
        >
          {(withdrawable ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          USD
        </FlashPrice>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setFundOpen(true)}
          disabled={!walletId || busy}
          className="cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {walletId ? "Top up" : "Preparing…"}
        </button>
        <button
          onClick={() => setWithdrawOpen(true)}
          disabled={!walletId || busy || !withdrawable}
          className="cursor-pointer rounded-[14px] bg-white/10 p-3.5 font-sans text-[15px] font-semibold text-white transition-colors hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>

      <HyperliquidFundModal
        open={fundOpen}
        onClose={() => setFundOpen(false)}
        walletId={walletId}
        onBridge={onBridge}
        onFunded={onFunded}
      />
      <HyperliquidWithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        walletId={walletId}
        availableUsdc={withdrawable ?? 0}
        onWithdraw={onWithdraw}
        onWithdrawn={onFunded}
      />
    </div>
  );
}
