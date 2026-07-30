"use client";

import { useCallback, useMemo, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/hooks/use-polymarket-session";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { usePortfolio } from "@/hooks/use-portfolio";
import { apiFetch } from "@/lib/api";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { toBaseUnits } from "@/lib/trade/math";

// Betting settles in pUSD inside the Polymarket account. We fund it from the
// user's USDC on Base only: the platform runs on Base, so every spend comes from
// there. Polymarket's deposit bridge is cross-chain and auto-wraps the incoming
// USDC to pUSD in the account's Deposit Wallet (a short, asynchronous hop).
const FUNDING_NETWORK = "base-mainnet";
const FUNDING_SETTLE = SETTLE_CHAINS.base;

// The bridge returns an address per VM family under `address` (e.g.
// { address: { evm, svm, tron, btc } }). Key names have varied across versions,
// so check the known containers and EVM keys defensively. We only ever use the
// EVM address (Base origin).
function pickEvmAddress(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const re = /^0x[0-9a-fA-F]{40}$/;
  const containers: Record<string, unknown>[] = [d];
  for (const key of ["address", "addresses"]) {
    const c = d[key];
    if (c && typeof c === "object") containers.push(c as Record<string, unknown>);
  }
  for (const c of containers) {
    for (const k of ["evm", "evmAddress", "polygon"]) {
      const v = c[k];
      if (typeof v === "string" && re.test(v)) return v;
    }
  }
  return null;
}

export function usePolymarketFunding() {
  const { ensureReady } = usePolymarketSession();
  const { sendUsdc } = useSendUsdc();
  const { tokens, loading: portfolioLoading } = usePortfolio();
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Spendable USDC on Base — the only funding source.
  const usdcTotal = useMemo(
    () =>
      tokens
        .filter((t) => t.symbol === "USDC" && t.network === FUNDING_NETWORK)
        .reduce((sum, t) => sum + t.balance, 0),
    [tokens]
  );

  // Sends `amountUsd` of Base USDC to the deposit bridge, which credits pUSD to
  // the account's Deposit Wallet. Resolves once the Base transfer is sent; the
  // pUSD lands a little later, which the caller waits out.
  const fund = useCallback(
    async (amountUsd: number): Promise<string> => {
      setFunding(true);
      setError(null);
      try {
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
          throw new Error("Enter an amount greater than zero");
        }
        const client = await ensureReady();
        const res = await apiFetch("/api/polymarket/deposit-address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: client.account.wallet }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error("Could not get a deposit address");
        const bridge = pickEvmAddress(data);
        if (!bridge) throw new Error("No deposit address returned");

        // toFixed keeps the amount in plain decimal form. String() can emit
        // scientific notation for small numbers, which toBaseUnits reads as 0.
        return await sendUsdc({
          chainType: "ethereum",
          to: bridge,
          amount: toBaseUnits(amountUsd.toFixed(6), 6),
          settle: FUNDING_SETTLE,
        });
      } catch (e) {
        setError(friendlyError(e, "Couldn't add funds. Please try again."));
        throw e;
      } finally {
        setFunding(false);
      }
    },
    [ensureReady, sendUsdc]
  );

  return { fund, funding, error, usdcTotal, portfolioLoading };
}
