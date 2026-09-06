import "server-only";

import type { User } from "@privy-io/node";

export type EmbeddedChain = "ethereum" | "solana";

// The address of the session's embedded wallet on a chain, from the server
// SDK's user shape, or null when the user has none there.
//
// This must pick the same wallet the browser picks with getWalletAddress in
// lib/user.ts: the first linked account that is a wallet, created by Privy,
// on that chain. The two shapes differ only in casing (linked_accounts and
// wallet_client_type here, linkedAccounts and walletClientType there). The
// dashboard's query key is built from these addresses on both sides, so a
// different choice here would prefetch a balance the client never reads.
export function embeddedWalletAddress(user: User | null, chain: EmbeddedChain): string | null {
  if (!user) return null;
  for (const account of user.linked_accounts ?? []) {
    if (account.type !== "wallet") continue;
    if (!("wallet_client_type" in account) || account.wallet_client_type !== "privy") continue;
    if (!("chain_type" in account) || account.chain_type !== chain) continue;
    if ("address" in account && typeof account.address === "string") return account.address;
  }
  return null;
}
