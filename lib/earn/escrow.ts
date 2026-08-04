"use client";

// Depositing a listing's reward into the escrow contract.
//
// The sponsor's own wallet sends the transaction; this service never holds the
// funds and never asks for a key. On Base the approve and the deposit go as one
// sponsored batch, so the sponsor signs once, needs no ETH for gas, and no
// allowance is ever left sitting between two transactions.
//
// None of the values are derived here. The bytes32 listing id, the token, the
// amount in minor units and a deadline inside the contract's accepted window
// all come from the service, which already enforces the rules the contract
// checks. Re-deriving them client-side would be a second implementation of
// those rules, and any drift shows up as a deposit the wallet rejects.

import { encodeFunctionData } from "viem";
import { encodeApprove, isNativeToken } from "@/lib/trade/erc20";
import type { EvmBatchCall } from "@/hooks/use-evm-send";

export interface EscrowQuote {
  escrowAddress: string;
  listingIdBytes32: string;
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  amount: number;
  // uint256, as a string: a JS number cannot hold an 18-decimal amount.
  amountMinor: string;
  refundableAfter: number;
  alreadyFunded: boolean;
  // Already deposited on chain but not yet recorded by the service. The
  // sponsor has paid; only the record needs catching up, and depositing again
  // would be refused by the contract anyway.
  depositedOnChain?: boolean;
}

const DEPOSIT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "listingId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "refundableAfter", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

/**
 * The calls that move the reward into escrow.
 *
 * An ERC-20 needs an allowance first, because the contract pulls with
 * transferFrom. Native ETH carries its value on the call itself and needs no
 * approval, so it is a single call.
 */
export function buildDepositCalls(quote: EscrowQuote): EvmBatchCall[] {
  const amount = BigInt(quote.amountMinor);
  const native = isNativeToken(quote.tokenAddress);

  const deposit: EvmBatchCall = {
    to: quote.escrowAddress as `0x${string}`,
    data: encodeFunctionData({
      abi: DEPOSIT_ABI,
      functionName: "deposit",
      args: [
        quote.listingIdBytes32 as `0x${string}`,
        quote.tokenAddress as `0x${string}`,
        amount,
        BigInt(quote.refundableAfter),
      ],
    }),
    ...(native ? { value: amount } : {}),
  };

  if (native) return [deposit];

  return [
    {
      to: quote.tokenAddress as `0x${string}`,
      // Exactly the amount, not an unlimited allowance: this approval exists
      // for one deposit and should not outlive it.
      data: encodeApprove(quote.escrowAddress, amount),
    },
    deposit,
  ];
}
