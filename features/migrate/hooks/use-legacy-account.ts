"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthSession } from "@/hooks/use-auth-session";
import { readDisplayProfile } from "@/lib/display-profile";

// Whether the address this browser signed in with had a Privy account holding
// an embedded wallet. The third signal behind the balance card's Update
// Balance button, and the only one that reaches a migrated user on a new
// device: there are no `privy:` keys in a fresh browser, and /status knows
// nothing until a mapping exists.
//
// Asked once per identity per page load, not per render: it costs a Privy
// management-API call on the server. Cached at module scope so a remount or a
// soft navigation reuses the answer — keyed on the identifiers it was asked
// with, so a second account signing in on the same tab (sign-out is a
// client-side route, so module state survives it) asks afresh instead of
// inheriting the first account's answer.
//
// False is "no reason to offer it", never "you have nothing" — the route
// answers false for an outage too. Callers must OR this with their other
// signals rather than gate on it.

export interface LegacyAccount {
  /** The signed-in address had a Privy account holding an embedded wallet. */
  has: boolean;
  /** What that wallet still holds, or null for "could not read it". */
  fundsUsd: number | null;
  /**
   * `has` is a verdict, not a shrug: the directory answered, or Privy found
   * a real user without a wallet. False for an outage or before the lookup
   * ran. A definite "no" retires the offer even on a browser carrying
   * someone else's `privy:` keys.
   */
  certain: boolean;
}

const UNKNOWN: LegacyAccount = { has: false, fundsUsd: null, certain: false };

interface Identifiers {
  email?: string;
  xId?: string;
  xHandle?: string;
}

// Found answers, and lookups in flight, by the identifiers they were asked
// with. A "not found" is never cached (see the effect): it may be an outage.
const answers = new Map<string, LegacyAccount>();
const inFlight = new Map<string, Promise<LegacyAccount>>();

// Whatever this browser knows about who signed in. Self-reported and
// unverifiable — see lib/display-profile — so it is good enough to decide
// whether to show a button and never enough to key anything on.
//
// Both, because not every legacy user has an address: Privy allowed signing
// in with Twitter, and those accounts carry a handle and nothing else.
// Asking only for an email would strand every one of them.
function identifiers(): Identifiers {
  const profile = readDisplayProfile();
  return {
    email: profile?.email || undefined,
    xId: profile?.providerSubject || undefined,
    // The handle as well as the id: the Privy export carries only handles, so
    // for an X user it is the one that actually matches.
    xHandle: profile?.username || undefined,
  };
}

function cacheKey(ids: Identifiers): string {
  return [ids.email ?? "", ids.xId ?? "", ids.xHandle ?? ""].join("|");
}

async function ask(ids: Identifiers): Promise<LegacyAccount> {
  // Which identifiers this browser can offer. Kinds only — the values are the
  // user's own and have no business in a console.
  console.log(
    "[migrate] identifiers known to this browser:",
    [ids.email && "email", ids.xId && "x-id", ids.xHandle && "x-handle"]
      .filter(Boolean)
      .join(" + ") || "none"
  );
  const { email, xId, xHandle } = ids;
  if (!email && !xId && !xHandle) return UNKNOWN;
  try {
    const res = await apiFetch(
      "/api/migration/legacy-account",
      {
        method: "POST",
        body: JSON.stringify({
          ...(email ? { email } : {}),
          ...(xId ? { xId } : {}),
          ...(xHandle ? { xHandle } : {}),
        }),
      },
      { requireAuth: true }
    );
    if (!res.ok) {
      console.warn("[migrate] legacy check failed:", res.status, "- treating as unknown");
      return UNKNOWN;
    }
    const body = (await res.json()) as {
      hasLegacyAccount?: unknown;
      legacyFundsUsd?: unknown;
      certain?: unknown;
    };
    const answer = {
      has: body.hasLegacyAccount === true,
      fundsUsd: typeof body.legacyFundsUsd === "number" ? body.legacyFundsUsd : null,
      certain: body.certain === true,
    };
    console.log(
      `[migrate] legacy check: ${answer.has ? "account found" : "no account"}` +
        (answer.has
          ? `, old wallet holds ${answer.fundsUsd === null ? "an amount we could not read" : `$${answer.fundsUsd.toFixed(2)}`}`
          : "")
    );
    return answer;
  } catch (err) {
    console.warn("[migrate] legacy check errored, treating as unknown:", err);
    return UNKNOWN;
  }
}

export function useLegacyAccount(enabled = true): LegacyAccount & {
  /**
   * A lookup is owed and has not settled: the answer that decides whether to
   * offer the upgrade is still on its way. The gate's skeleton waits on it,
   * so the screen is never shown and then covered a moment later.
   */
  pending: boolean;
} {
  // Re-run when the signed-in account changes, not only on mount: the account
  // switch happens without a reload, and the display profile this asks with
  // changes with it.
  const { evmAddress, profile } = useAuthSession();
  // What a lookup resolved, tagged with the identity it was for, so a stale
  // resolution from the previous account is never shown for this one.
  const [resolved, setResolved] = useState<{ key: string; answer: LegacyAccount } | null>(null);

  // Derived, not set in an effect: whatever is already known for THIS identity.
  // readDisplayProfile is null on the server and memoises its parse, so this
  // is safe and cheap to read every render.
  const ids = identifiers();
  const key = cacheKey(ids);
  const state = resolved?.key === key ? resolved.answer : (answers.get(key) ?? UNKNOWN);
  const pending =
    enabled &&
    Boolean(ids.email || ids.xId || ids.xHandle) &&
    !answers.has(key) &&
    resolved?.key !== key;

  useEffect(() => {
    // Disabled means a caller already knows the answer it would give (e.g. the
    // account is known-linked), so the Privy management-API call is skipped.
    if (!enabled) return;
    const ids = identifiers();
    const key = cacheKey(ids);
    if (answers.has(key) || (!ids.email && !ids.xId && !ids.xHandle)) return;
    let live = true;
    void (async () => {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = ask(ids);
        inFlight.set(key, pending);
      }
      const answer = await pending;
      // An uncertain "nothing" may be an outage rather than a verdict, so it
      // is not cached and the next mount asks again. A found account, or a
      // definite no, is settled; a balance is re-read on the next page load,
      // which is often enough for a figure that only changes on a sweep.
      const settled = answer.has || answer.certain;
      if (settled) answers.set(key, answer);
      else inFlight.delete(key);
      if (live && settled) setResolved({ key, answer });
    })();
    return () => {
      live = false;
    };
    // evmAddress and the profile email are the signals that the identity
    // changed; the identifiers themselves are read fresh inside.
  }, [enabled, evmAddress, profile.email]);

  return { ...state, pending };
}
