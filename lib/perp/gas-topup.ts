"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { encodeFunctionData } from "viem";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { dextopusGet } from "@/hooks/use-deposit";
import { readBaseTokenBalance } from "@/hooks/use-base-block";
import { publicClientForChain } from "@/lib/trade/receipt";
import { fetchPerpPrices } from "@/lib/perp/api";
import { fetchBuyQuote } from "@/lib/buy-quote";
import type { BuyRoute } from "@/lib/buy";
import {
  depositProgress,
  TERMINAL_STAGES,
  SETTLE_CHAINS,
  type DepositStatusResult,
} from "@/lib/deposit";
import {
  PERP_CHAIN_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  WETH_ADDRESS,
  WETH_DECIMALS,
} from "@/lib/perp/logic";
import { stepsTotalValueWei } from "@/lib/perp/steps";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import type { BuildResult } from "@/lib/perp/types";

export type TopUpOutcome = { ok: true } | { ok: false; error: string };

type TopUpErrorCode = "addFundsForGas" | "gasQuoteFailed" | "gasSwapFailed";
type InternalOutcome = { ok: true } | { ok: false; code: TopUpErrorCode };

// Extra headroom on top of the raw wei deficit: the buy targets a USDC spend
// estimated from a live price snapshot, and the Dextopus quote moves between
// quote and settlement, so aiming exactly at the threshold would routinely
// land a hair short. 3% comfortably absorbs both without turning "buy the
// deficit" into a meaningful buffer.
const SAFETY_MARGIN_BPS = 300n;

// A buy below this is dust relative to Dextopus's own routing/fee overhead.
// This is a viability floor, not a top-up buffer — a real deficit is never
// this small in practice (the keeper fee itself is ~$0.68).
const MIN_BUY_USDC = 1;

// Matches the slippage the app's own "Buy" sheet uses (features/trade/components/buy-sheet.tsx).
const SLIPPAGE_BPS = 100;

const STATUS_POLL_MS = 4_000;
const STATUS_DEADLINE_MS = 90_000;

// The Dextopus route for native ETH settling on Base, matching exactly what
// the app's own Buy flow sends (verified against a live quote) — Dextopus's
// own catalog represents native ETH with the all-zero address, a different
// convention than the 0xEeee…EEeE sentinel used elsewhere in DeFi. Hardcoded
// rather than fetched from the destinations catalog: this route is fixed and
// well-known, so a top-up doesn't need an extra network round trip to look
// it up.
const ETH_ON_BASE_ROUTE: BuyRoute = {
  destinationChainId: PERP_CHAIN_ID,
  chainName: "base",
  asset: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
  decimals: 18,
  logoUrl: null,
};

// WETH9 withdraw(uint256) — the ABI is a two-function subset, not the full
// canonical WETH interface, because this is the only call this flow ever
// encodes against the WETH contract. Only used for the self-heal path below
// (a fresh top-up buys native ETH directly and never needs this).
const WETH_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

export function encodeWethWithdraw(amount: bigint): `0x${string}` {
  return encodeFunctionData({ abi: WETH_ABI, functionName: "withdraw", args: [amount] });
}

// The wei amount to aim for once a top-up is needed at all: the raw deficit
// plus SAFETY_MARGIN_BPS, so quote-to-settlement drift and price movement
// don't leave the trader a hair short of the threshold they were topping up
// for in the first place.
export function applySafetyMargin(deficitWei: bigint): bigint {
  return (deficitWei * (10_000n + SAFETY_MARGIN_BPS)) / 10_000n;
}

// How much of `target` wei can actually be unwrapped given what's on hand —
// never more than what's available, never more than what's needed.
export function capUnwrapAmount(available: bigint, target: bigint): bigint {
  return available < target ? available : target;
}

// USD estimate for how much USDC to spend buying `neededWei` of native ETH
// at `ethPriceUsd`, floored at MIN_BUY_USDC so a tiny deficit doesn't
// produce a dust-sized buy. WETH_DECIMALS is reused here since native ETH
// shares the same 18-decimal precision.
export function estimateUsdcToSpend(neededWei: bigint, ethPriceUsd: number): number {
  const neededEth = Number(fromBaseUnits(neededWei, WETH_DECIMALS));
  return Math.max(neededEth * ethPriceUsd, MIN_BUY_USDC);
}

// Ensures a trader has enough native Base ETH to cover a perp action's
// keeper execution fee, topping up from their USDC when they don't — via
// the platform's own existing Dextopus "Buy" flow (lib/buy-quote.ts,
// features/trade/hooks/use-buy.ts), the same one the Buy sheet uses: quote a
// USDC-on-Base -> ETH-on-Base route, send the USDC to the quoted deposit
// address, poll until it settles. No custom swap-building or wallet-linking
// needed — this flow already handles all of that.
//
// The buy still cannot be folded into the perp action's own signed batch: a
// Dextopus deposit is a plain USDC transfer, settled off-chain by Dextopus
// asynchronously — there's nothing to batch it with. So a top-up is two
// signatures (the deposit send, then the perp action itself — plus an
// unwrap only on the self-heal path); trades that already have enough ETH
// stay at one signature, unchanged from before this existed.
export function useGasTopUp() {
  const t = useTranslations("perps");
  const { sendUsdc } = useSendUsdc();

  const ensureGasInternal = useCallback(
    async (trader: `0x${string}`, builds: BuildResult[]): Promise<InternalOutcome> => {
      const neededWei = stepsTotalValueWei(builds);
      if (neededWei === 0n) return { ok: true };

      const client = publicClientForChain(PERP_CHAIN_ID);
      const ethWei = await client.getBalance({ address: trader });
      if (ethWei >= neededWei) return { ok: true };

      const deficitWei = neededWei - ethWei;
      const targetWei = applySafetyMargin(deficitWei);

      // Self-heal: if a wallet already holds enough WETH to clear the target
      // on its own (stranded from an earlier attempt, or anything else),
      // just unwrap it — cheaper and one signature shorter than a fresh buy.
      const existingWeth = await readBaseTokenBalance(WETH_ADDRESS, trader);
      if (existingWeth >= targetWei) {
        const toUnwrap = capUnwrapAmount(existingWeth, targetWei);
        // Mutates the caller's array: the unwrap rides in the same batch and
        // signature as the perp action builds already carries, so callers
        // see it appear in the same `builds` they pass to sendBatch after.
        builds.unshift({
          chainId: PERP_CHAIN_ID,
          steps: [
            {
              to: WETH_ADDRESS,
              data: encodeWethWithdraw(toUnwrap),
              value: "0",
              label: "Unwrap ETH for the execution fee",
            },
          ],
        });
        return { ok: true };
      }

      const usdcBalance = await readBaseTokenBalance(USDC_ADDRESS, trader);

      let ethPriceUsd: number;
      try {
        const prices = await fetchPerpPrices();
        const ethUsd = prices.find((p) => p.pair === "ETH/USD")?.price;
        if (!ethUsd) throw new Error("no ETH/USD price");
        ethPriceUsd = Number(ethUsd);
      } catch {
        return { ok: false, code: "gasQuoteFailed" };
      }

      const usdcToSpend = estimateUsdcToSpend(targetWei, ethPriceUsd);
      let usdcToSpendBase = toBaseUnits(usdcToSpend.toFixed(USDC_DECIMALS), USDC_DECIMALS);

      if (usdcBalance < usdcToSpendBase) {
        return { ok: false, code: "addFundsForGas" };
      }

      try {
        // The perp price feed only gives a rough USDC amount to ask for —
        // Dextopus's own quote is the real rate (their fee/spread included)
        // and can undershoot it. Check the quote's guaranteed minimum output
        // before spending anything; if it's short, scale the request up and
        // re-quote once rather than discovering the shortfall only after the
        // USDC is already gone.
        let quote = await fetchBuyQuote({
          route: ETH_ON_BASE_ROUTE,
          amount: usdcToSpendBase,
          recipient: trader,
          refundTo: trader,
          slippageBps: SLIPPAGE_BPS,
        });
        if (quote.minOutput < targetWei) {
          // A little extra on top of the exact scale-up ratio so a second
          // shortfall (further fee/spread drift on the bigger amount) is
          // very unlikely, without looping re-quotes indefinitely.
          const scaledUsdc = (usdcToSpendBase * targetWei * 105n) / (quote.minOutput * 100n);
          if (scaledUsdc > usdcBalance) {
            return { ok: false, code: "addFundsForGas" };
          }
          usdcToSpendBase = scaledUsdc;
          quote = await fetchBuyQuote({
            route: ETH_ON_BASE_ROUTE,
            amount: usdcToSpendBase,
            recipient: trader,
            refundTo: trader,
            slippageBps: SLIPPAGE_BPS,
          });
          if (quote.minOutput < targetWei) {
            return { ok: false, code: "gasSwapFailed" };
          }
        }
        await sendUsdc({
          chainType: "ethereum",
          to: quote.depositAddress,
          amount: usdcToSpendBase,
          settle: SETTLE_CHAINS.base,
        });
        // A poll timeout or a misreported status doesn't necessarily mean
        // the buy failed — it means Dextopus's status endpoint didn't say
        // "settled" within the deadline. The chain is the actual source of
        // truth: fall through to the balance check below either way rather
        // than failing a top-up whose ETH already landed.
        await pollDepositSettled(quote.requestId);
      } catch {
        return { ok: false, code: "gasSwapFailed" };
      }

      // Defensive final check: even generous margins can't survive
      // materially worse-than-quoted slippage, and this doubles as the real
      // confirmation the poll above is only a status-endpoint proxy for.
      // Fail clearly rather than sign a batch that reverts on-chain from an
      // unmet fee.
      const freshEthWei = await client.getBalance({ address: trader });
      if (freshEthWei < neededWei) {
        return { ok: false, code: "gasSwapFailed" };
      }
      return { ok: true };
    },
    [sendUsdc]
  );

  const ensureGas = useCallback(
    async (trader: `0x${string}`, builds: BuildResult[]): Promise<TopUpOutcome> => {
      const outcome = await ensureGasInternal(trader, builds);
      return outcome.ok ? { ok: true } : { ok: false, error: t(outcome.code) };
    },
    [ensureGasInternal, t]
  );

  return { ensureGas };
}

// Polls a Dextopus deposit request until it reaches a terminal stage.
// Mirrors hooks/use-deposit.ts's useDepositStatus, as a plain async function
// instead of a query hook since this runs inside an imperative flow, not a
// component.
async function pollDepositSettled(depositRequestId: string): Promise<boolean> {
  const deadline = Date.now() + STATUS_DEADLINE_MS;
  while (Date.now() < deadline) {
    const status = await dextopusGet<DepositStatusResult>(
      `deposit/status?depositRequestId=${depositRequestId}`,
      "Couldn't check deposit status",
      "trade"
    ).catch(() => null);
    if (status) {
      const { stage } = depositProgress(status.status, status.executionStatus);
      if (TERMINAL_STAGES.has(stage)) return stage === "settled";
    }
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_MS));
  }
  return false;
}
