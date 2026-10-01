"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocialWallet } from "decane-connect-kit";

// Whether a passkey can be created here at all. A device with no platform
// authenticator (or a browser without WebAuthn) has nothing to offer.
async function passkeysAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * "Add a passkey to this device", for a device that fell back to a PIN.
 *
 * A wallet created while no passkey was reachable — a password manager that was
 * not signed in, a dismissed prompt — wraps its device share with a PIN, and
 * the kit never revisits that: once a PIN-wrapped share exists, every unlock
 * goes straight to the PIN prompt however available passkeys later become.
 *
 * Two paths, because the fix landed in the kit after this shipped:
 *
 *  - `addPasskey()` (kit >= 2.9.0) re-wraps the existing share under a fresh
 *    credential. One PIN prompt, one passkey prompt, no re-auth.
 *  - Without it, signing out and back in reaches the same place: sign-out drops
 *    the local share, and the next sign-in provisions a new one server-side and
 *    registers a passkey on the way. Costs a full re-auth, which is why it is
 *    the fallback and not the plan.
 */
export function useDevicePasskey(): {
  /** Null until known. True when this device is on a PIN and could hold a passkey. */
  canAdd: boolean | null;
  /** True when the upgrade needs a full sign-out and sign-in. */
  needsReauth: boolean;
  adding: boolean;
  error: string | null;
  addPasskey: () => Promise<void>;
} {
  const wallet = useSocialWallet() as ReturnType<typeof useSocialWallet> & {
    hasPasskey?: () => Promise<boolean>;
    addPasskey?: () => Promise<void>;
  };
  // The kit hands back a new object on every render, and every one of its
  // methods sets the kit's own loading state while it runs. So nothing below
  // may depend on `wallet` itself: an effect that did re-ran on every call it
  // made, and the account sheet froze in that loop. The methods are memoised
  // inside the kit, so they are what the effects and callbacks depend on.
  const { isConnected, hasPasskey, addPasskey: kitAddPasskey, disconnect, openModal } = wallet;
  const [canAdd, setCanAdd] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportsDirect = typeof kitAddPasskey === "function";

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!isConnected) {
        if (live) setCanAdd(false);
        return;
      }
      const available = await passkeysAvailable();
      if (!available) {
        if (live) setCanAdd(false);
        return;
      }
      // Older kits cannot report which wrapping this device uses. Offering the
      // upgrade anyway is the safer error: on a device that already has a
      // passkey the direct call is a no-op, and the fallback path is a sign-in
      // the user can simply complete.
      if (!hasPasskey) {
        if (live) setCanAdd(true);
        return;
      }
      try {
        const has = await hasPasskey();
        if (live) setCanAdd(!has);
      } catch {
        if (live) setCanAdd(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [isConnected, hasPasskey]);

  const addPasskey = useCallback(async () => {
    setError(null);
    setAdding(true);
    try {
      if (kitAddPasskey) {
        await kitAddPasskey();
        setCanAdd(false);
        return;
      }
      // Fallback: drop this device's share and let the next sign-in provision a
      // fresh one, which registers a passkey because one is reachable now.
      await disconnect();
      openModal();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add a passkey. Please try again.");
      throw e;
    } finally {
      setAdding(false);
    }
  }, [kitAddPasskey, disconnect, openModal]);

  return { canAdd, needsReauth: !supportsDirect, adding, error, addPasskey };
}
