"use client";

import { createContext, useContext } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletAddress } from "@/lib/user";
import type { ServerSession } from "@/lib/session";

const ServerSessionContext = createContext<ServerSession | null>(null);

// Holds what the server verified about the session, for the moment before
// Privy's browser SDK has caught up. Provided by the (app) layout, which reads
// the cookie; null anywhere the server had no session to vouch for.
export function ServerSessionProvider({
  session,
  children,
}: {
  session: ServerSession | null;
  children: React.ReactNode;
}) {
  return <ServerSessionContext.Provider value={session}>{children}</ServerSessionContext.Provider>;
}

export function useServerSession(): ServerSession | null {
  return useContext(ServerSessionContext);
}

// The session's embedded wallet on a chain. Until Privy is ready the server's
// answer stands in: the same wallet, read from the same account, a moment
// earlier. Once Privy is ready its answer is the only one, including "none":
// a browser that has signed out, or signed in as someone without a wallet on
// this chain, must not inherit the address the cookie named when the page
// rendered. Falling back on null here was the review finding that a stale
// server wallet could outlive the session that produced it.
//
// An EVM address is lowercased so the query key built from it is stable across
// the server→Privy transition. The server SDK and the browser SDK return the
// same wallet but can disagree on EIP-55 checksum casing, and a casing change
// is a new query key — which triggers a duplicate fetch on every cold entry.
// A Solana address is left exactly as it came: base58 carries meaning in its
// case, so a folded one names a different account, or none.
export function useSessionWallet(chain: "ethereum" | "solana"): string | null {
  const { ready, user } = usePrivy();
  const server = useServerSession();
  const address = ready ? getWalletAddress(user, chain) : (server?.wallets[chain] ?? null);
  if (!address) return null;
  return chain === "ethereum" ? address.toLowerCase() : address;
}
