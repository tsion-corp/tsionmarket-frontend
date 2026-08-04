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
  submittedSignature?: string | null;
  prefundRent?: boolean | null;
  signer?: string | null;
  sponsorPublicKey?: string | null;
  previewOnly?: boolean | null;
  configured?: boolean | null;
  note?: string | null;
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

function readMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return readMessage(body?.error) ?? readMessage(body?.message) ?? "Solana sponsorship failed";
}

async function requestSolanaSponsorship(
  transaction: string | Uint8Array,
  opts: { prefundRent?: boolean } = {}
): Promise<SponsoredSolanaTransactionResult> {
  const serializedTransaction =
    typeof transaction === "string" ? transaction : bytesToBase64(transaction);
  const res = await apiFetch(
    "/api/gas-sponsor/solana",
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
  if (!body.serializedTransaction) {
    throw new Error("Solana sponsor returned no transaction.");
  }
  return body;
}

export async function sponsorSolanaTransaction(
  transaction: string | Uint8Array,
  opts: { prefundRent?: boolean } = {}
): Promise<Uint8Array> {
  const body = await requestSolanaSponsorship(transaction, opts);
  return base64ToBytes(body.serializedTransaction);
}

export async function sponsorAndSubmitSolanaTransaction(
  transaction: string | Uint8Array,
  opts: { prefundRent?: boolean } = {}
): Promise<SponsoredSolanaTransactionResult> {
  return requestSolanaSponsorship(transaction, opts);
}
