"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { returningFromPrivyOAuth } from "@/features/migrate/lib/oauth-return";
import { useAuthSession } from "@/hooks/use-auth-session";

// Privy restores its last session from localStorage the moment it mounts, and
// that session is not necessarily the account whose money is about to move: a
// shared device, or a user who signed up again under a different email, leaves
// one behind that belongs to someone else. Inheriting it is not a cosmetic
// bug — every legacy surface spends from whoever the restored session is:
//
//   * the sweep would move THAT account's balances into this user's wallet, and
//   * POST /migration/link would bind the wrong old account to this one, so the
//     re-key hands its profile, followers and all, to this user.
//
// So no legacy surface may act on a session the user did not just establish.
// Whatever was restored is discarded once per page load and the old account
// signs in again, where the user can see which one they are picking.
//
// Once per page load, not once per mount: the sheet, the balance-card button
// and the reclaim page can be mounted together and must share one logout, and a
// user who moves some money, closes the sheet and reopens it is not asked twice.
// Resolves to whether the inherited session is actually gone. Deliberately
// never rejects: a throw here would leave every legacy surface waiting on a
// promise that never settles, which is its own dead end.
let discard: Promise<boolean> | null = null;
/*
  ONCE PER PAGE LOAD, PER NEW ACCOUNT. The discard was keyed to nothing, so
  signing out of Decane and in as somebody else in the same page load found
  the first person's old session still there and — the discard having
  already "happened" — handed it out: the second account's link answered
  LEGACY_ALREADY_LINKED, because the old account was the first person's.
  The new account the discard was made for is remembered; a different one
  starts over.
*/
let discardFor: string | null = null;

// Exported for tests, which need each case to start from nothing.
export function resetFreshLegacySession(): void {
  discard = null;
  discardFor = null;
}

// False until any inherited session has been cleared away. Callers must treat
// that as "no legacy session", never as "still loading, carry on".
export function useFreshLegacySession(): boolean {
  const privy = usePrivy();
  const { evmAddress } = useAuthSession();
  const owner = evmAddress ?? "";
  // Tagged with the new account it was decided for, so a different account
  // reads as not-fresh at once rather than inheriting the last verdict.
  const [decided, setDecided] = useState<{ owner: string; fresh: boolean }>({
    owner: "",
    fresh: false,
  });
  const fresh = decided.owner === owner && decided.fresh;

  useEffect(() => {
    if (discardFor !== owner) {
      discard = null;
      discardFor = owner;
    }
    // `ready` is Privy's own signal that restoring has finished, so this is the
    // first moment `authenticated` can be trusted. Deciding earlier would read
    // a false and let the restored session through a moment later.
    if (!privy.ready) return;
    let live = true;
    void (async () => {
      // Coming back from Google or Twitter, the session is the one the user
      // just created — its credentials are in this very URL — so there is
      // nothing inherited to throw away, and throwing it away would undo the
      // sign-in they just completed. This stays true for the rest of the page's
      // life, which is the right scope: that page load belongs to that login.
      const inherited = privy.authenticated && !returningFromPrivyOAuth;
      discard ??= (inherited ? privy.logout() : Promise.resolve()).then(
        () => true,
        (error: unknown) => {
          // Stay false. A logout that failed leaves the inherited session
          // intact, and handing out a signer for it is the whole hazard — so
          // the flow stalls rather than spending from an account the user did
          // not choose. Loud in the console, because it looks like a dead
          // button from the outside.
          console.error("Discarding the inherited old-account session failed", error);
          return false;
        }
      );
      const cleared = await discard;
      // Same verdict, same object: a fresh object for an unchanged answer
      // would re-render every consumer on every pass.
      if (live) {
        setDecided((prev) =>
          prev.owner === owner && prev.fresh === cleared ? prev : { owner, fresh: cleared }
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [privy, owner]);

  return fresh;
}
