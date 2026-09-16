// Circle Iris attestation lookup. After a depositForBurn, Circle observes the
// source chain and, once it reaches the requested finality, publishes a signed
// attestation that authorizes the mint on the destination chain. This module
// polls for it. The attestation is public (keyed by tx hash), so it can be
// fetched from a Node script or proxied through a route handler for the browser.

import { CCTP_IRIS_BASE } from "@/lib/cctp/config";
import type { Hex } from "viem";

export interface CctpAttestation {
  // "pending_confirmations" until Circle has enough confirmations, then "complete".
  status: string;
  // Populated once status is "complete"; null while pending.
  message: Hex | null;
  attestation: Hex | null;
}

export interface IrisMessage {
  status: string;
  message: string;
  attestation: string;
}

// Circle's messages answer, read as mint inputs: ready once the first message
// is complete and carries a real attestation, otherwise still pending. Null
// when Circle lists no message for the burn yet.
export function attestationFromIrisBody(body: {
  messages?: IrisMessage[];
}): CctpAttestation | null {
  const first = body.messages?.[0];
  if (!first) return null;
  const ready = first.status === "complete" && first.attestation.startsWith("0x");
  return {
    status: first.status,
    message: ready ? (first.message as Hex) : null,
    attestation: ready ? (first.attestation as Hex) : null,
  };
}

// Look up the message + attestation produced by a depositForBurn on
// `sourceDomain` in transaction `txHash`, straight from Circle. Returns null
// when Circle has not indexed the burn yet (404), so the caller keeps polling.
// For a server or a script; the browser goes through the app's /api/cctp
// proxy and hands waitForAttestation its own lookup.
export async function fetchAttestation(
  sourceDomain: number,
  txHash: Hex,
  fetchImpl: typeof fetch = fetch
): Promise<CctpAttestation | null> {
  const url = `${CCTP_IRIS_BASE}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const res = await fetchImpl(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Iris attestation lookup failed: ${res.status}`);
  return attestationFromIrisBody((await res.json()) as { messages?: IrisMessage[] });
}

export type AttestationLookup = (
  sourceDomain: number,
  txHash: Hex
) => Promise<CctpAttestation | null>;

export interface WaitOptions {
  fetchImpl?: typeof fetch;
  /** How to look the attestation up; defaults to asking Circle directly. */
  lookup?: AttestationLookup;
  timeoutMs?: number;
  intervalMs?: number;
  // Called on each poll with the current status ("not_found" before indexing).
  onPoll?: (status: string, elapsedMs: number) => void;
}

// Poll until the attestation is ready to mint, or throw on timeout.
export async function waitForAttestation(
  sourceDomain: number,
  txHash: Hex,
  opts: WaitOptions = {}
): Promise<{ message: Hex; attestation: Hex }> {
  const lookup: AttestationLookup =
    opts.lookup ?? ((domain, hash) => fetchAttestation(domain, hash, opts.fetchImpl ?? fetch));
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const start = Date.now();
  for (;;) {
    const att = await lookup(sourceDomain, txHash);
    if (att?.message && att.attestation) {
      return { message: att.message, attestation: att.attestation };
    }
    opts.onPoll?.(att?.status ?? "not_found", Date.now() - start);
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`CCTP attestation timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
