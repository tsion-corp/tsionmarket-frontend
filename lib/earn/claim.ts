"use client";

// Claiming a reward that escrow already holds for you.
//
// Releasing credits a balance rather than transferring, so one winner whose
// address cannot receive never blocks anybody else's reward. Collecting it is
// this second step, made by the winner's own wallet.
//
// The token is never chosen by hand. `withdraw` takes a token address, and the
// native sentinel is a valid argument that withdraws ETH — so pointing it at
// the wrong one silently claims a zero balance instead of the reward.

import { encodeFunctionData } from "viem";

const CLAIM_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Calldata for collecting everything owed to the caller in one token. */
export function encodeWithdraw(token: string): `0x${string}` {
  return encodeFunctionData({
    abi: CLAIM_ABI,
    functionName: "withdraw",
    args: [token as `0x${string}`],
  });
}

/** Calldata for reading what is currently claimable. */
export function encodeClaimableCall(recipient: string, token: string): `0x${string}` {
  return encodeFunctionData({
    abi: CLAIM_ABI,
    functionName: "balanceOf",
    args: [recipient as `0x${string}`, token as `0x${string}`],
  });
}
