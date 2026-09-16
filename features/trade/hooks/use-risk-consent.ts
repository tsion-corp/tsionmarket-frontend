"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { MemeToken, TokenWarning } from "@/lib/meme/api";

// The contract's one consent flow: every token with known liquidity under
// $50,000 carries a LOW_LIQUIDITY warning, and the user must confirm it
// before a quote is requested. Other warnings are advisory and shown; they
// never gate anything. Only BLOCKED, buyEnabled/sellEnabled false or a server
// error stop a trade, and those are the surfaces' business, not this hook's.
//
// The acknowledgement lasts the session (this tab's life, reset by a reload)
// and belongs to one token, keyed chainId + address. It is held in memory on
// purpose: a stored "yes" that outlived the session would be consent the user
// never gave to the price in front of them.

export const LOW_LIQUIDITY = "LOW_LIQUIDITY";

type ConsentIdentity = Pick<MemeToken, "chainId" | "address">;
type ConsentToken = ConsentIdentity & Pick<MemeToken, "warnings">;

/** The session key for a token. A Solana mint is kept exactly as written; an
 *  EVM address compares case-insensitively, so it is keyed lowercased. */
export function consentKey({ chainId, address }: ConsentIdentity): string {
  return `${chainId}:${chainId === SOLANA_CHAIN_ID ? address : address.toLowerCase()}`;
}

export function requiresConsent(warnings: TokenWarning[]): boolean {
  return warnings.some((w) => w.code === LOW_LIQUIDITY);
}

// A new Set on every change, so useSyncExternalStore sees a new snapshot.
let acknowledged: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function acknowledge(key: string) {
  if (acknowledged.has(key)) return;
  acknowledged = new Set([...acknowledged, key]);
  for (const listener of listeners) listener();
}

/**
 * Whether the preview may be asked for this token yet.
 *
 * - `needsConsent`: the token carries LOW_LIQUIDITY.
 * - `consented`: nothing stands between the amount and a preview. Feed it to
 *   `useMemePreview`'s gate.
 * - `prompting`: the dialog should be up — the token needs consent, it has not
 *   been given, and an amount has been entered. A surface's Cancel clears the
 *   amount, so the dialog comes back the next time one is typed.
 */
export function useRiskConsent(token: ConsentToken | null, amount: string) {
  const set = useSyncExternalStore(
    subscribe,
    () => acknowledged,
    () => EMPTY
  );
  const key = token ? consentKey(token) : null;
  const needsConsent = token ? requiresConsent(token.warnings) : false;
  const consented = !needsConsent || (key !== null && set.has(key));
  const prompting = needsConsent && !consented && amount.trim() !== "";
  const accept = useCallback(() => {
    if (key) acknowledge(key);
  }, [key]);
  return { needsConsent, consented, prompting, accept };
}
