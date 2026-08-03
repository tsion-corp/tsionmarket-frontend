"use client";

import { createSolanaRpc } from "@solana/kit";

// The one Solana endpoint the browser talks to: our own proxy, which forwards
// to Alchemy with the key kept server-side. Everything client-side goes through
// here rather than the public mainnet endpoint, which rate-limits browser
// traffic and was returning nothing under load.
export const SOLANA_RPC_PATH = "/api/solana-rpc";

// @solana/kit builds a fetch transport from this, and fetch needs an absolute
// URL outside the browser. Rendering never calls it, so a placeholder origin on
// the server is enough to construct the client.
export function solanaRpcUrl(): string {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return `${origin}${SOLANA_RPC_PATH}`;
}

export function createAppSolanaRpc(): ReturnType<typeof createSolanaRpc> {
  return createSolanaRpc(solanaRpcUrl());
}
