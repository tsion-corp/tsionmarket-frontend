"use client";

// Turns pUSD (Polymarket collateral, on Polygon) into USDC on Base at a
// recipient of the caller's choosing. Polymarket's offramp only exists on
// Polygon, so the path is pUSD -> USDC.e (offramp) -> USDC on Base (Dextopus
// bridge; it accepts USDC.e directly, so no on-Polygon swap is needed). The
// Polygon steps are signed by the EOA and gas-sponsored, so no POL is needed.
//
// Balance-driven and resumable: it offramps whatever pUSD the account holds,
// then bridges whatever USDC.e the EOA holds. A run that failed after
// unwrapping (funds sitting as USDC.e) is recovered by simply running again.
//
// `recipient` is where the USDC on Base lands. The cash-out flow passes the
// EOA itself; the migration passes the NEW wallet, so the money never has to
// be swept out of the old one afterwards.

import { encodeFunctionData, erc20Abi } from "viem";
import { CONTRACTS, POLYGON_CHAIN_ID } from "@/lib/polymarket/config";
import type { SecureClient } from "@/lib/polymarket/secure-client";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { fetchSellQuote } from "@/lib/sell";
import { awaitReceipt, publicClientForChain, type ChainReadClient } from "@/lib/trade/receipt";
import type { EvmBatchCall } from "@/lib/migration/types";

// CollateralOfframp.unwrap(asset, to, amount): burns pUSD, sends USDC.e to `to`.
const OFFRAMP_ABI = [
  {
    type: "function",
    name: "unwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export type SettlePhase = "idle" | "unwrapping" | "bridging";

export class SettleError extends Error {}

function readErc20(client: ChainReadClient, token: string, owner: string): Promise<bigint> {
  return client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  });
}

export interface SettleCollateralInput {
  client: SecureClient;
  // The signer EOA that owns the Deposit Wallet.
  eoa: string;
  // Where the USDC on Base lands.
  recipient: string;
  // One sponsored Polygon batch signed by the EOA.
  sendBatch(calls: EvmBatchCall[], chainId: number): Promise<`0x${string}`>;
  // A token send from the EOA on the named network.
  sendToken(params: {
    network: string;
    tokenAddress: string | null;
    decimals: number;
    to: string;
    amount: bigint;
  }): Promise<string>;
  onPhase?(phase: SettlePhase): void;
}

export interface SettleCollateralResult {
  pusdUnwrapped: bigint;
  usdceBridged: bigint;
  txHashes: string[];
}

export async function settleCollateral(
  input: SettleCollateralInput
): Promise<SettleCollateralResult> {
  const { client, eoa, recipient } = input;
  const polygon = publicClientForChain(POLYGON_CHAIN_ID);
  const depositWallet = client.account.wallet;
  const txHashes: string[] = [];

  // 1) Offramp any pUSD in the Deposit Wallet to USDC.e in the EOA. Skipped
  // when there's none (e.g. a resumed run where it's already USDC.e). The
  // approve and the unwrap ride in one sponsored batch.
  input.onPhase?.("unwrapping");
  const depositPusd = await readErc20(polygon, CONTRACTS.pusd, depositWallet);
  if (depositPusd > 0n) {
    const transfer = await client.transferErc20({
      tokenAddress: CONTRACTS.pusd,
      recipientAddress: eoa,
      amount: depositPusd,
    });
    await transfer.wait();
  }

  // Unwrap what the EOA ACTUALLY holds, not what the deposit wallet just sent.
  // A previous run may have completed the transfer and then failed before
  // unwrapping: the deposit wallet reads 0, and unwrapping that amount would
  // strand the user's pUSD in the EOA forever. Reading the real balance is what
  // makes a re-run recover it.
  const pusd = await readErc20(polygon, CONTRACTS.pusd, eoa);
  if (pusd > 0n) {
    const hash = await input.sendBatch(
      [
        {
          to: CONTRACTS.pusd as `0x${string}`,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [CONTRACTS.collateralOfframp as `0x${string}`, pusd],
          }),
        },
        {
          to: CONTRACTS.collateralOfframp as `0x${string}`,
          data: encodeFunctionData({
            abi: OFFRAMP_ABI,
            functionName: "unwrap",
            args: [CONTRACTS.usdcE as `0x${string}`, eoa as `0x${string}`, pusd],
          }),
        },
      ],
      POLYGON_CHAIN_ID
    );
    txHashes.push(hash);
    await awaitReceipt(polygon, hash, "The unwrap");
  }

  // 2) Bridge all the USDC.e the EOA holds to USDC on Base for the recipient.
  // Read the real balance so we send exactly what's there.
  input.onPhase?.("bridging");
  const usdce = await readErc20(polygon, CONTRACTS.usdcE, eoa);
  if (usdce <= 0n) {
    if (pusd <= 0n) throw new SettleError("There's nothing to cash out right now.");
    return { pusdUnwrapped: pusd, usdceBridged: 0n, txHashes };
  }
  const quote = await fetchSellQuote({
    network: "polygon-mainnet",
    asset: CONTRACTS.usdcE,
    amount: usdce,
    recipient,
    refundTo: eoa,
    slippageBps: 100,
  });
  const bridgeHash = await input.sendToken({
    network: "polygon-mainnet",
    tokenAddress: CONTRACTS.usdcE,
    decimals: SETTLE_CHAINS.polygon.decimals,
    to: quote.depositAddress,
    amount: usdce,
  });
  txHashes.push(bridgeHash);
  return { pusdUnwrapped: pusd, usdceBridged: usdce, txHashes };
}
