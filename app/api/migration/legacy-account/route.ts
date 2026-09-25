import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { forwardMigration, migrationServiceEnabled } from "@/lib/server/migration";
import { getPrivyClient } from "@/lib/server/privy";
import { fetchPortfolio } from "@/lib/server/alchemy";
import {
  emailIdentifier,
  lookupLegacyIdentifiers,
  xHandleIdentifier,
  xIdentifier,
} from "@/lib/server/legacy-directory";

// Does the address the caller signed in with belong to a Privy account that
// held an embedded wallet? One boolean, and it decides one thing: whether the
// balance card offers "Update Balance".
//
// Why this exists. offerMigration() has two signals today and neither reaches
// a migrated user on a NEW device: the browser has no `privy:` keys to find,
// and /status reports hasLegacyFunds only once a mapping exists. So the user
// signs in, sees 0.00, and nothing explains where their money went. This is
// the third signal, and it is the only one that works before the backfill has
// run.
//
// What it deliberately is NOT. It records no mapping, grants no access and
// proves nothing about who the caller is. The address arrives from the
// browser's own display profile (lib/display-profile), which Decane cannot
// confirm — it stores no profile server-side — so this answer is a hint for
// the UI and must never become authority. Linking still demands both provider
// tokens; the sweep still demands a real Privy signature. The deterministic
// backfill exists precisely because matching identities on an email is an
// account-takeover primitive, and nothing here may drift into doing that.
//
// The cost accepted: for a signed-in caller this reveals whether an address
// had an account here. Bounded by requiring a verified Decane session, and by
// the client asking once per session rather than per render.

export const dynamic = "force-dynamic";

/**
 * `legacyFundsUsd` is what the old wallet still holds, or null for "could not
 * read it". The distinction carries weight: a confident zero retires the
 * button for someone who already swept but whose browser still has `privy:`
 * keys, and null must never do that — a failed read would take the door away
 * from someone whose money is sitting right there.
 */
/**
 * `certain` says whether a `false` is a verdict or a shrug. The directory is
 * believed completely (see lib/server/legacy-directory), so its "no" is
 * definite, and a Privy user found without an embedded wallet definitely never
 * held money here. A Privy lookup that errors is not: "no such user" and an
 * outage arrive the same way. The client uses a definite "no" to retire the
 * offer even on a browser that still carries someone else's `privy:` keys —
 * a brand-new user must never be told to move to Market 2.0.
 */
function answer(
  hasLegacyAccount: boolean,
  legacyFundsUsd: number | null = null,
  certain = hasLegacyAccount
) {
  return NextResponse.json(
    { hasLegacyAccount, legacyFundsUsd, certain },
    { headers: { "cache-control": "no-store" } }
  );
}

/**
 * What those wallets still hold, or null for "could not read it". Only a read
 * where every network answered is believed: Portfolio.missing means the total
 * is a floor, and a floor of zero is not an empty wallet.
 */
async function fundsAt(evm?: string | null, solana?: string | null): Promise<number | null> {
  if (!evm && !solana) return null;
  try {
    const portfolio = await fetchPortfolio(evm ?? undefined, solana ?? undefined);
    return portfolio.missing?.length ? null : portfolio.totalUsd;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // A verified session, so this is not an open lookup. The session's identity
  // is not compared to the address — it cannot be — it only gates the call.
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  // Whatever the caller can say about themselves. Not every legacy user has an
  // address: Privy allowed signing in with Twitter, and those accounts carry a
  // handle and nothing else — which is the whole reason Decane grew an X
  // provider. Asking only for an email would strand every one of them.
  let email: string | null = null;
  let xId: string | null = null;
  let xHandle: string | null = null;
  try {
    const body = (await req.json()) as { email?: unknown; xId?: unknown; xHandle?: unknown };
    if (typeof body.email === "string") email = emailIdentifier(body.email);
    if (typeof body.xId === "string") xId = body.xId.trim();
    if (typeof body.xHandle === "string") xHandle = body.xHandle.trim().replace(/^@/, "");
  } catch {
    // No body, or not JSON. Falls through to the nothing-to-go-on answer below.
  }

  // Bounded and shaped, so nothing absurd reaches a lookup.
  if (email && (email.length > 320 || !email.includes("@"))) email = null;
  // X ids are numeric. Anything else is not one, and would only ever miss.
  if (xId && !/^\d{1,32}$/.test(xId)) xId = null;
  // X handles are 1-15 of [A-Za-z0-9_]. Anything else is not one.
  if (xHandle && !/^[A-Za-z0-9_]{1,15}$/.test(xHandle)) xHandle = null;
  if (!email && !xId && !xHandle) return answer(false);

  /*
    THE SERVICE FIRST. user-management holds the identity map — every old
    account, seeded from the provider's export — and asks the provider
    itself for anything the export predates, seeding what it finds. One
    lookup, and the same answer the Square gives its sign-in. The directory
    below and the provider call under it stay as the fallback for an
    unconfigured or silent service, and for X sign-ins, which have no email.
  */
  const service = await askUserManagement(req, email);
  if (service === "legacy") {
    console.log("[migrate] result: legacy account per user-management -> offering Update Balance");
    return answer(true, null);
  }
  if (service === "new") {
    console.log("[migrate] result: no legacy account per user-management");
    return answer(false, null, true);
  }

  // The directory first: a snapshot of who held a Privy account, which needs
  // no Privy call and keeps answering after Privy is switched off. Membership
  // cannot go stale — the population is closed — so a snapshot is as correct
  // as a live lookup. `known: null` means it could not be read at all, which
  // falls through to Privy rather than answering no.
  const identifiers = [...(email ? [email] : []), ...(xId ? [xIdentifier(xId)] : [])];
  console.log(
    `[migrate] check: asked with ${[email && "email", xId && "x-id", xHandle && "x-handle"].filter(Boolean).join(" + ")}`
  );
  const directory = await lookupLegacyIdentifiers(identifiers);
  if (directory.known === true && directory.entry) {
    const usd = await fundsAt(directory.entry.evm, directory.entry.solana);
    console.log(
      `[migrate] result: legacy account FOUND, old wallet holds ${usd === null ? "unknown (read failed or partial)" : `$${usd.toFixed(2)}`}` +
        `${usd === 0 ? " -> already swept, offer retired" : usd === null ? " -> offer kept, cannot prove empty" : " -> offering Update Balance"}`
    );
    return answer(true, usd);
  }
  if (directory.known === false) {
    console.log("[migrate] result: no legacy account for this user");
    return answer(false, null, true);
  }

  try {
    // Privy can be asked either way, and an X user has no address to ask with.
    const users = getPrivyClient().users();
    const user = email
      ? await users.getByEmailAddress({ address: email })
      : xId
        ? await users.getByTwitterSubject({ subject: xId })
        : await users.getByTwitterUsername({ username: xHandle! });
    // An account with no embedded wallet never held money here, so offering
    // the sweep to it would be a dead end with a scary label. The server SDK
    // speaks snake_case, unlike lib/user's client-side helper.
    const wallet = (chain: "ethereum" | "solana"): string | undefined => {
      const hit = user.linked_accounts.find(
        (account) =>
          account.type === "wallet" &&
          "chain_type" in account &&
          account.chain_type === chain &&
          "address" in account
      );
      return hit && "address" in hit && typeof hit.address === "string" ? hit.address : undefined;
    };
    const evm = wallet("ethereum");
    const solana = wallet("solana");
    // A real user with no embedded wallet: definitely never held money here.
    if (!evm && !solana) return answer(false, null, true);

    const usd = await fundsAt(evm, solana);
    console.log(
      `[migrate] result: legacy account found via PRIVY fallback, old wallet holds ${usd === null ? "unknown" : `$${usd.toFixed(2)}`}`
    );
    return answer(true, usd);
  } catch {
    // No such user is the ordinary case and Privy reports it as an error. A
    // genuine outage lands here too, and both answer the same way on purpose:
    // false must read as "no reason to offer it", never as "you have nothing".
    // The caller keeps its other signals, which is why this one only ever ORs.
    return answer(false);
  }
}

/**
 * Where user-management says this sign-in stands — `legacy`, `new`, or null
 * when it could not say (unconfigured, no email, `linked`, an outage). A
 * linked account is null on purpose: the offer for one is decided by the
 * service's status and the old wallet's balance, not by this.
 */
async function askUserManagement(
  req: NextRequest,
  email: string | null
): Promise<"legacy" | "new" | null> {
  if (!email || !migrationServiceEnabled()) return null;
  try {
    const res = await forwardMigration("/legacy-account", {
      method: "POST",
      headers: { authorization: req.headers?.get("authorization") ?? "" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { data?: { state?: unknown } } | null;
    const state = body?.data?.state;
    return state === "legacy" || state === "new" ? state : null;
  } catch {
    return null;
  }
}
