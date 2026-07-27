"use client";

import { useCallback, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { usePolymarketSession } from "@/hooks/use-polymarket-session";
import { useEvmSwapExecute } from "@/hooks/use-evm-swap-execute";
import { getWalletAddress } from "@/lib/user";
import { CONTRACTS, POLYGON_CHAIN_ID, PUSD_DECIMALS } from "@/lib/polymarket/config";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { toBaseUnits } from "@/lib/trade/math";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";

// CollateralOfframp.unwrap(asset, to, amount): burns pUSD, sends the underlying
// stablecoin (USDC.e) to `to`.
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

// Cashes pUSD out to USDC.e in the user's own Polygon wallet: moves pUSD from the
// Deposit Wallet to the EOA gaslessly, then approves and unwraps it via the
// Collateral Offramp. The unwrap steps are signed by the EOA (a little POL for
// gas, per the self-funded-gas model).
export function usePolymarketWithdraw() {
  const { user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { ensureReady } = usePolymarketSession();
  const executeEvmSwap = useEvmSwapExecute();
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (amountUsd: number): Promise<boolean> => {
      setWithdrawing(true);
      setError(null);
      try {
        const eoa = getWalletAddress(user, "ethereum");
        if (!eoa) throw new Error("No wallet connected");
        const wallet = wallets.find((w) => w.address.toLowerCase() === eoa.toLowerCase());
        if (!wallet) throw new Error("Wallet is not ready. Try again.");

        const client = await ensureReady();
        const amount = toBaseUnits(String(amountUsd), PUSD_DECIMALS);

        // 1) Move pUSD from the Deposit Wallet to the EOA (gasless).
        const transfer = await client.transferErc20({
          tokenAddress: CONTRACTS.pusd,
          recipientAddress: eoa,
          amount,
        });
        await transfer.wait();

        // Confirm the on-chain steps through a client pinned to Polygon, not the
        // wallet's ambient provider, which may point at another chain.
        const polygonClient = publicClientForChain(POLYGON_CHAIN_ID);

        // 2) Approve the offramp to spend the EOA's pUSD.
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.collateralOfframp as `0x${string}`, amount],
        });
        const approve = await sendTransaction(
          { to: CONTRACTS.pusd, data: approveData, chainId: POLYGON_CHAIN_ID },
          { address: eoa }
        );
        await awaitReceipt(polygonClient, approve.hash, "The approval");

        // 3) Unwrap pUSD -> USDC.e to the EOA.
        const unwrapData = encodeFunctionData({
          abi: OFFRAMP_ABI,
          functionName: "unwrap",
          args: [CONTRACTS.usdcE as `0x${string}`, eoa as `0x${string}`, amount],
        });
        const unwrap = await sendTransaction(
          { to: CONTRACTS.collateralOfframp, data: unwrapData, chainId: POLYGON_CHAIN_ID },
          { address: eoa }
        );
        await awaitReceipt(polygonClient, unwrap.hash, "The withdrawal");

        // 4) Normalise USDC.e -> native USDC via LI.FI. Best-effort: the funds are
        // already safely in the wallet as USDC.e if this last hop can't route.
        try {
          await executeEvmSwap({
            fromChainId: POLYGON_CHAIN_ID,
            fromToken: CONTRACTS.usdcE,
            toToken: SETTLE_CHAINS.polygon.usdc,
            fromAmount: amount,
            slippageBps: 50,
          });
        } catch {
          // Leave the balance as USDC.e; the user keeps their funds either way.
        }

        return true;
      } catch (e) {
        setError(friendlyError(e, "Couldn't cash out. Please try again."));
        throw e;
      } finally {
        setWithdrawing(false);
      }
    },
    [user, wallets, sendTransaction, ensureReady, executeEvmSwap]
  );

  return { withdraw, withdrawing, error };
}
