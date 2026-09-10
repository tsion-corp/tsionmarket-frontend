"use client";

import { fetchBalanceAllowance, updateBalanceAllowance } from "@polymarket/client/actions";
import { erc20Abi } from "viem";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";
import { CONTRACTS, POLYGON_CHAIN_ID, PUSD_DECIMALS } from "@/lib/polymarket/config";
import { publicClientForChain } from "@/lib/trade/receipt";

// The request shape, taken from the action itself so we don't depend on a named
// type export.
type BalanceRequest = Parameters<typeof fetchBalanceAllowance>[1];

// Polymarket's balance API keys the collateral (pUSD) balance under the
// "COLLATERAL" asset type. The AssetType enum is not exported at runtime, so we
// pass the documented string and type it at this third-party seam.
const COLLATERAL_REQUEST = { assetType: "COLLATERAL" } as BalanceRequest;

function collateralUsd(response: unknown): number {
  const units = Number((response as { balance?: string }).balance ?? "0");
  return Number.isFinite(units) ? units / 10 ** PUSD_DECIMALS : 0;
}

// Reads the account's spendable pUSD (the collateral bets are placed with), in
// dollars. Goes through the CLOB API (the same transport that places orders), so
// it is as reliable as trading itself. Returns 0 on an unreadable balance.
export async function readCollateralUsd(client: SecureClient): Promise<number> {
  return collateralUsd(await fetchBalanceAllowance(client, COLLATERAL_REQUEST));
}

export async function refreshCollateralUsd(client: SecureClient): Promise<number> {
  return collateralUsd(await updateBalanceAllowance(client, COLLATERAL_REQUEST));
}

async function readWalletTokenUsd(eoa: string, token: string): Promise<number> {
  try {
    const polygon = publicClientForChain(POLYGON_CHAIN_ID);
    const units = await polygon.readContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [eoa as `0x${string}`],
    });
    return Number(units) / 10 ** PUSD_DECIMALS;
  } catch {
    return 0;
  }
}

// pUSD can remain in the embedded EOA when an earlier cash-out transferred it
// out of the Deposit Wallet but failed before the unwrap completed.
export function readWalletPusdUsd(eoa: string): Promise<number> {
  return readWalletTokenUsd(eoa, CONTRACTS.pusd);
}

interface WaitForCollateralOptions {
  initialAvailableUsd?: number;
  timeoutMs?: number;
  pollMs?: number;
}

// Watch Polygon directly for the bridge credit. Once pUSD arrives, refresh the
// CLOB balance cache once and return immediately instead of waiting on a slow
// fixed CLOB polling interval.
export async function waitForCollateralUsd(
  client: SecureClient,
  requiredUsd: number,
  options: WaitForCollateralOptions = {}
): Promise<number> {
  let availableUsd =
    options.initialAvailableUsd ?? (await readCollateralUsd(client).catch(() => 0));
  if (availableUsd >= requiredUsd) return availableUsd;

  const timeoutMs = options.timeoutMs ?? 45_000;
  const pollMs = options.pollMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    pollCount += 1;

    const onchainUsd = await readWalletTokenUsd(client.account.wallet, CONTRACTS.pusd);
    if (onchainUsd >= requiredUsd) {
      availableUsd = await refreshCollateralUsd(client).catch(() => onchainUsd);
      if (availableUsd >= requiredUsd) return availableUsd;
    }

    // Keep an occasional CLOB fallback in case the configured Polygon RPC lags.
    if (pollCount % 5 === 0) {
      availableUsd = await readCollateralUsd(client).catch(() => availableUsd);
      if (availableUsd >= requiredUsd) return availableUsd;
    }
  }

  return availableUsd;
}

// USDC.e the EOA holds on Polygon, in dollars. This is where a cash-out leaves
// funds if the final bridge hop didn't complete, so the UI counts it as
// cashable and a re-run picks it up. Returns 0 on any read failure.
export async function readUnsettledUsdcUsd(eoa: string): Promise<number> {
  return readWalletTokenUsd(eoa, CONTRACTS.usdcE);
}
