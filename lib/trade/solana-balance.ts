"use client";

import { apiFetch } from "@/lib/api";

interface RpcError {
  code?: number;
  message?: string;
}

interface RpcResponse<T> {
  result?: T;
  error?: RpcError;
}

interface ParsedTokenAccount {
  account?: {
    data?: {
      parsed?: {
        info?: {
          tokenAmount?: { amount?: string };
        };
      };
    };
  };
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await apiFetch(
    "/api/solana-rpc",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    },
    { requireAuth: true }
  );
  if (!response.ok) throw new Error("The Solana balance service is unavailable.");
  const payload = (await response.json()) as RpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `Solana RPC rejected ${method}: ${payload.error.message ?? payload.error.code ?? "unknown error"}`
    );
  }
  if (payload.result === undefined) throw new Error(`Solana RPC returned no ${method} result.`);
  return payload.result;
}

// Raised before a quote is signed when the indexed portfolio snapshot differs
// from confirmed chain state. Callers replace the amount but require a fresh
// confirmation; the executor never silently sells less than the user approved.
export class SolanaBalanceChangedError extends Error {
  readonly availableAmount: bigint;

  constructor(availableAmount: bigint, maxRequested: boolean) {
    super(
      maxRequested
        ? "Your Solana balance changed. Review the updated Max amount and try again."
        : "Your Solana balance changed. Review the updated amount and try again."
    );
    this.name = "SolanaBalanceChangedError";
    this.availableAmount = availableAmount;
  }
}

// Reads confirmed chain state immediately before constructing a Solana sell.
// SPL wallets may own more than one token account for a mint, so sum their
// exact integer amounts rather than trusting a rounded portfolio float.
export async function fetchConfirmedSolanaBalance(
  owner: string,
  mint: string | null
): Promise<bigint> {
  if (mint === null) {
    const result = await solanaRpc<{ value: number }>("getBalance", [
      owner,
      { commitment: "confirmed" },
    ]);
    if (!Number.isSafeInteger(result.value) || result.value < 0) {
      throw new Error("Solana returned an invalid native balance.");
    }
    return BigInt(result.value);
  }

  const result = await solanaRpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  return result.value.reduce((total, tokenAccount) => {
    const raw = tokenAccount.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (raw === undefined || !/^\d+$/.test(raw)) {
      throw new Error("Solana returned an invalid token balance.");
    }
    return total + BigInt(raw);
  }, 0n);
}
