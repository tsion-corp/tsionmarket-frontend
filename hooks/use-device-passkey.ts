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
  const [canAdd, setCanAdd] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportsDirect = typeof wallet.addPasskey === "function";

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!wallet.isConnected) {
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
      if (!wallet.hasPasskey) {
        if (live) setCanAdd(true);
        return;
      }
      try {
        const has = await wallet.hasPasskey();
        if (live) setCanAdd(!has);
      } catch {
        if (live) setCanAdd(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [wallet, wallet.isConnected]);

  const addPasskey = useCallback(async () => {
    setError(null);
    setAdding(true);
    try {
      if (wallet.addPasskey) {
        await wallet.addPasskey();
        setCanAdd(false);
        return;
      }
      // Fallback: drop this device's share and let the next sign-in provision a
      // fresh one, which registers a passkey because one is reachable now.
      await wallet.disconnect();
      wallet.openModal();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add a passkey. Please try again.");
      throw e;
    } finally {
      setAdding(false);
    }
  }, [wallet]);

  return { canAdd, needsReauth: !supportsDirect, adding, error, addPasskey };
}
