"use client";

import { apiFetch } from "@/lib/api";

export interface SponsoredSolanaTransactionResult {
  serializedTransaction: string;
  estimatedFeeLamports: number | null;
  estimatedRentLamports: number | null;
  prefundLamports: number | null;
  simulationSlot: number | null;
  usesDurableNonce: boolean;
  lastValidBlockHeight: number | null;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error ?? "Solana sponsorship failed";
}

export async function sponsorSolanaTransaction(
  transaction: string | Uint8Array,
  opts: { prefundRent?: boolean } = {}
): Promise<Uint8Array> {
  const serializedTransaction =
    typeof transaction === "string" ? transaction : bytesToBase64(transaction);
  const res = await apiFetch(
    "/api/alchemy-solana-sponsor",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serializedTransaction,
        ...(opts.prefundRent ? { prefundRent: true } : {}),
      }),
    },
    { requireAuth: true }
  );
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const body = (await res.json()) as SponsoredSolanaTransactionResult;
  return base64ToBytes(body.serializedTransaction);
}
