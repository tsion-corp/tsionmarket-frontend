import "server-only";

import { isHex, parseTransaction, recoverTransactionAddress, type Hex } from "viem";

/**
 * Broadcasting a transaction the self-custody wallet has already signed.
 *
 * The app's read proxy (/api/evm-rpc) deliberately has no write method: an open
 * relay is something to refuse. This is the narrow alternative, and every rule below
 * exists so it can only ever be used for what it is for:
 *
 *   - only a signed, standard transaction, for exactly the chain named in the URL
 *     (no blobs, no delegation transactions, no unprotected legacy ones);
 *   - only from an address the caller's own wallet registered with the wallet
 *     service, so a session cannot be used to send someone else's transactions;
 *   - only the one JSON-RPC method, built here, never one the client names;
 *   - bounded in size and rate, and only on networks an operator switched on by
 *     giving them a broadcast endpoint.
 */

export const MAX_RAW_BYTES = 128 * 1024;
export const RATE_LIMIT_PER_MINUTE = 20;

const ALLOWED_TYPES = new Set(["legacy", "eip2930", "eip1559"]);

export type Inspection =
  | { ok: true; sender: string; type: string }
  | {
      ok: false;
      code: "INVALID_TRANSACTION" | "WRONG_CHAIN" | "UNSUPPORTED_TRANSACTION";
      message: string;
    };

const refuse = (
  code: Extract<Inspection, { ok: false }>["code"],
  message: string
): Extract<Inspection, { ok: false }> => ({ ok: false, code, message });

/** What a raw transaction is, and who signed it. Never throws. */
export async function inspectRawTransaction(
  raw: unknown,
  expectedChainId: number
): Promise<Inspection> {
  if (typeof raw !== "string" || !isHex(raw) || raw.length < 4) {
    return refuse("INVALID_TRANSACTION", "That isn't a signed transaction.");
  }
  if ((raw.length - 2) / 2 > MAX_RAW_BYTES)
    return refuse("INVALID_TRANSACTION", "That transaction is too large.");
  try {
    const tx = parseTransaction(raw as Hex);
    if (!ALLOWED_TYPES.has(tx.type ?? "legacy")) {
      return refuse("UNSUPPORTED_TRANSACTION", "That kind of transaction can't be sent here.");
    }
    // An unprotected legacy transaction has no chain id: it would be valid on any chain.
    if (tx.chainId === undefined || tx.chainId !== expectedChainId) {
      return refuse("WRONG_CHAIN", "That transaction is for a different network.");
    }
    if (!("r" in tx) || !tx.r || !tx.s)
      return refuse("INVALID_TRANSACTION", "That transaction isn't signed.");
    const sender = await recoverTransactionAddress({ serializedTransaction: raw as never });
    return { ok: true, sender: sender.toLowerCase(), type: tx.type ?? "legacy" };
  } catch {
    return refuse("INVALID_TRANSACTION", "That isn't a signed transaction.");
  }
}

/** The broadcast endpoint for a network, or null when an operator has not switched it on. */
export function broadcastRpcUrl(
  network: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const name = `EVM_BROADCAST_RPC_${network.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const value = env[name]?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? value
      : null;
  } catch {
    return null;
  }
}

export type SenderCheck = "registered" | "not_registered" | "unconfigured" | "unavailable";

/**
 * Whether `sender` is one of the EVM addresses this account's wallet is registered
 * with. The answer comes from the wallet service, which is the only authority on it.
 */
export async function senderCheck(
  userId: string,
  sender: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch
): Promise<SenderCheck> {
  const base = env.CRYPTO_WALLET_API_URL?.trim().replace(/\/+$/, "");
  const key = env.WALLET_INTERNAL_KEY?.trim();
  if (!base || !key) return "unconfigured";
  try {
    const res = await fetcher(
      `${base}/internal/users/${encodeURIComponent(userId)}/wallet-addresses`,
      {
        headers: { accept: "application/json", "x-service-key": key },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) return "unavailable";
    const body = (await res.json()) as {
      data?: { addresses?: Array<{ family: string; address: string }> };
    };
    const owned = (body.data?.addresses ?? []).some(
      (item) => item.family === "evm" && item.address.toLowerCase() === sender.toLowerCase()
    );
    return owned ? "registered" : "not_registered";
  } catch {
    return "unavailable";
  }
}

/** Fixed window per key. Process-local, which is enough to stop a runaway client. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      if (this.hits.size > 5_000)
        for (const [k, v] of this.hits) if (t >= v.resetAt) this.hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
