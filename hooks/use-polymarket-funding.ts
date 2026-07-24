"use client";

import { useCallback, useState } from "react";
import { usePolymarketSession } from "@/hooks/use-polymarket-session";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { usePortfolio } from "@/hooks/use-portfolio";
import { apiFetch } from "@/lib/api";
import { SETTLE_CHAINS, type SettleChain } from "@/lib/deposit";
import { toBaseUnits } from "@/lib/trade/math";

// Funding sources in preference order. Polymarket's deposit bridge is itself
// cross-chain, so we send from whichever chain the user already holds USDC on —
// Polygon first (cheapest, same chain), then the other EVM chains, then Solana —
// and it auto-wraps to pUSD regardless of origin.
const SOURCES: { network: string; settle: SettleChain; family: "evm" | "svm" }[] = [
  { network: "polygon-mainnet", settle: SETTLE_CHAINS.polygon, family: "evm" },
  { network: "base-mainnet", settle: SETTLE_CHAINS.base, family: "evm" },
  { network: "arb-mainnet", settle: SETTLE_CHAINS.arbitrum, family: "evm" },
  { network: "solana-mainnet", settle: SETTLE_CHAINS.solana, family: "svm" },
];

// The bridge returns an address per VM family; keys have varied across versions,
// so pull each defensively.
function pickAddress(data: unknown, family: "evm" | "svm"): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const nested = (d.addresses as Record<string, unknown>) ?? {};
  const keys =
    family === "evm" ? ["evm", "evmAddress", "polygon"] : ["svm", "solana", "svmAddress"];
  const re = family === "evm" ? /^0x[0-9a-fA-F]{40}$/ : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  for (const k of keys) {
    for (const v of [d[k], nested[k]]) {
      if (typeof v === "string" && re.test(v)) return v;
    }
  }
  return null;
}

export function usePolymarketFunding() {
  const { ensureReady } = usePolymarketSession();
  const { sendUsdc } = useSendUsdc();
  const { tokens } = usePortfolio();
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usdcOn = useCallback(
    (network: string) =>
      tokens
        .filter((t) => t.symbol === "USDC" && t.network === network)
        .reduce((sum, t) => sum + t.balance, 0),
    [tokens]
  );

  const fund = useCallback(
    async (amountUsd: number): Promise<string> => {
      setFunding(true);
      setError(null);
      try {
        // Choose the source chain: one with enough USDC, else any with a balance.
        const source =
          SOURCES.find((s) => usdcOn(s.network) >= amountUsd) ??
          SOURCES.find((s) => usdcOn(s.network) > 0);
        if (!source) {
          throw new Error("You don't have enough USDC yet. Add USDC to your wallet first.");
        }

        const client = await ensureReady();
        const account = client.account.wallet;

        const res = await apiFetch("/api/polymarket/deposit-address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: account }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error("Could not get a deposit address");
        const bridge = pickAddress(data, source.family);
        if (!bridge) throw new Error("No deposit address returned for that chain");

        return await sendUsdc({
          chainType: source.family === "evm" ? "ethereum" : "solana",
          to: bridge,
          amount: toBaseUnits(String(amountUsd), 6),
          settle: source.settle,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not add funds.";
        setError(message);
        throw e;
      } finally {
        setFunding(false);
      }
    },
    [ensureReady, sendUsdc, usdcOn]
  );

  return { fund, funding, error };
}
