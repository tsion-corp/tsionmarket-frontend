"use client";

import { erc20Abi } from "viem";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";
import { CONTRACTS, POLYGON_CHAIN_ID } from "@/lib/polymarket/config";
import { publicClientForChain } from "@/lib/trade/receipt";

// Some Neg Risk CLOB orders still use the legacy adapter as their pUSD
// spender, which is not covered by the SDK's standard trading approvals.
export async function ensureNegRiskBuyAllowance(
  client: SecureClient,
  requiredAmountE6: bigint
): Promise<boolean> {
  let allowance = 0n;
  try {
    allowance = await publicClientForChain(POLYGON_CHAIN_ID).readContract({
      address: CONTRACTS.pusd,
      abi: erc20Abi,
      functionName: "allowance",
      args: [client.account.wallet, CONTRACTS.negRiskAdapter],
    });
  } catch {
    // If the read RPC is unavailable, approving is safer than posting an order
    // that the CLOB will deterministically reject.
  }

  if (allowance >= requiredAmountE6) return false;
  const handle = await client.approveErc20({
    amount: "max",
    spenderAddress: CONTRACTS.negRiskAdapter,
    tokenAddress: CONTRACTS.pusd,
  });
  await handle.wait();
  return true;
}
