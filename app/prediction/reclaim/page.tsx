"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { publicClientForChain } from "@/lib/trade/receipt";
import { awaitReceipt } from "@/lib/trade/receipt";
import { PREDICTION_CHAIN_ID } from "@/lib/prediction/logic";
import {
  readLegacyClaimState,
  buildLegacyClaimCalls,
  type LegacyClaimState,
} from "@/lib/prediction/legacy-claim";

// Reclaim page for winnings stranded on the SUPERSEDED prediction contract
// (0xF9A870…). Those markets never show in the normal app (the indexer only
// tracks the current contract), so this page reads the old contract directly and
// lets a winner log in with the SAME email they used, then redeem + claim their
// own shares in one sponsored (gasless) transaction. Only the winner can do this
// — the contract burns their own shares; there is no admin/owner override.

const USDC = (v: bigint) => `$${(Number(v) / 1e6).toFixed(2)}`;

type Phase = "idle" | "loading" | "claiming" | "done" | "error";

export default function ReclaimPage() {
  const { ready, authenticated, login, user } = usePrivy();
  const sendBatch = useEvmSendBatch();
  const wallet = getWalletAddress(user, "ethereum");

  const [state, setState] = useState<LegacyClaimState | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setPhase("loading");
    setError(null);
    try {
      setState(await readLegacyClaimState(wallet));
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read your winnings.");
      setPhase("error");
    }
  }, [wallet]);

  useEffect(() => {
    if (!authenticated || !wallet) return;
    // Defer so the effect body itself doesn't call setState synchronously
    // (load() flips phase to "loading") — avoids the cascading-render lint.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [authenticated, wallet, load]);

  const claim = useCallback(async () => {
    if (!state) return;
    const calls = buildLegacyClaimCalls(state.redeemables);
    // calls always has the trailing claim(); only proceed if there's at least
    // one solvent redeem to batch with it (or a pre-existing pending balance).
    const hasSolvent = state.redeemables.some((r) => r.solvent);
    if (!hasSolvent && state.pending === 0n) return;
    setPhase("claiming");
    setError(null);
    try {
      const hash = await sendBatch(calls, PREDICTION_CHAIN_ID);
      setTxHash(hash);
      await awaitReceipt(publicClientForChain(PREDICTION_CHAIN_ID), hash, "Confirming…");
      setPhase("done");
      await load(); // refresh — solvent winnings now paid to wallet
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed. Please try again.");
      setPhase("error");
    }
  }, [state, sendBatch, load]);

  // What the claim button will actually pay: solvent positions + any pending.
  const claimable = state ? state.claimableShares + state.pending : 0n;
  const blocked = state ? state.blockedShares : 0n;
  const hasWinnings = state ? claimable > 0n || blocked > 0n : false;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Reclaim your winnings</h1>
        <p className="mt-2 text-sm text-white/60">
          Some earlier markets moved to a new contract. If you won one of them, your payout is
          waiting here — log in with the same email you used and claim it. Gas is on us.
        </p>
      </div>

      {!ready ? (
        <p className="text-white/50">Loading…</p>
      ) : !authenticated ? (
        <button
          onClick={() => login()}
          className="rounded-xl bg-white py-3 font-semibold text-black"
        >
          Log in to check
        </button>
      ) : phase === "loading" ? (
        <p className="text-white/50">Checking your winnings…</p>
      ) : phase === "done" ? (
        <div className="border-up/40 bg-up/10 rounded-xl border p-5">
          <p className="text-up font-semibold">Paid! 🎉</p>
          <p className="mt-1 text-sm text-white/70">Your winnings were sent to your wallet.</p>
          {txHash ? (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs text-white/50 underline"
            >
              View transaction
            </a>
          ) : null}
        </div>
      ) : !hasWinnings ? (
        <div className="rounded-xl border border-white/12 bg-white/5 p-5">
          <p className="text-sm text-white/70">
            No unclaimed winnings found for this account on the old contract.
          </p>
          <p className="mt-1 text-xs break-all text-white/45">Wallet: {wallet}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-white/12 bg-white/5 p-5">
            <p className="text-sm text-white/60">You can claim</p>
            <p className="mt-0.5 text-3xl font-semibold">{USDC(claimable)}</p>
            {state && state.redeemables.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-white/50">
                {state.redeemables.map((r) => (
                  <li key={`${r.marketId.toString()}-${r.side}`}>
                    {r.label} ({r.kind === "winning" ? "winnings" : "refund"}): {USDC(r.shares)}
                    {r.solvent ? null : <span className="text-white/35"> — unavailable</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            {state && state.pending > 0n ? (
              <p className="mt-2 text-xs text-white/50">
                Already redeemed, ready to withdraw: {USDC(state.pending)}
              </p>
            ) : null}
            {blocked > 0n ? (
              <p className="mt-3 text-xs text-white/40">
                {USDC(blocked)} from one market can&apos;t be paid out right now (that market is
                short on funds). We&apos;re looking into it — the rest is claimable now.
              </p>
            ) : null}
          </div>

          <button
            onClick={claim}
            disabled={phase === "claiming" || claimable === 0n}
            className="rounded-xl bg-white py-3 font-semibold text-black disabled:opacity-60"
          >
            {phase === "claiming" ? "Claiming…" : `Claim ${USDC(claimable)}`}
          </button>
        </div>
      )}

      {error ? <p className="text-down text-sm">{error}</p> : null}
    </main>
  );
}
