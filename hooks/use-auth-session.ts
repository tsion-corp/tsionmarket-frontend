"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSocialAuth, useSocialWallet } from "decane-connect-kit";
import { decodeDecaneUserId } from "@/lib/decane-user-id";
import { rememberDisplayProfile, useDisplayProfile } from "@/lib/display-profile";
import type { Profile } from "@/lib/user";

// The app's one auth seam. Everything that used to read Privy's usePrivy()
// for { ready, authenticated, user } reads this instead, backed by the Decane
// session. Wallet addresses come straight off the session; there is no user
// object to resolve.

export interface AuthSession {
  ready: boolean;
  authenticated: boolean;
  evmAddress: string | null;
  solanaAddress: string | null;
  /**
   * The account's id as the services know it (the token's `uid`), or null
   * when signed out. What the user-management routes are scoped by: the
   * balance, the notification inbox and the push subscription are all read
   * for THIS id, and cached under it so two accounts in one browser never
   * see each other's.
   */
  userId: string | null;
  profile: Profile;
  logout: () => Promise<void>;
}

// The kit persists a signed-in identity under this localStorage prefix (the
// full key ends in a slice of the API key). It hydrates that identity
// asynchronously, after SDK init, and exposes no "ready" flag, so this is the
// only way to tell "still hydrating a known user" from "signed out". Coupled
// to the kit's storage layout on purpose; revisit on kit upgrades.
const DECANE_IDENTITY_KEY_PREFIX = "decane:social:";

function hasPersistedIdentity(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DECANE_IDENTITY_KEY_PREFIX) && localStorage.getItem(key)) return true;
    }
  } catch {
    // Storage blocked: treat as no identity, the sign-in page still works.
  }
  return false;
}

// If SDK init hangs (network, bad key), stop holding the loading screen and
// let the guard route to sign-in; a stuck spinner helps nobody.
const HYDRATION_GRACE_MS = 8_000;

const emptySubscribe = () => () => {};

export function useAuthSession(): AuthSession {
  const social = useSocialAuth();
  // Server renders have no localStorage, so both sides render "not ready"
  // first and the client flips after hydration; useSyncExternalStore is the
  // mismatch-safe way to express that.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), HYDRATION_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Whatever a sign-in revealed about the user, kept device-side. Covers every
  // method uniformly: Google's params still arrive via captureDisplayProfileFromUrl
  // (which runs before the kit strips them), and a passkey login hands back the
  // profile the kit recorded on this device — so signing back in with a passkey
  // restores the same name and email rather than reverting to a generic label.
  const kitProfile = social.profile;
  useEffect(() => {
    if (kitProfile) rememberDisplayProfile(kitProfile);
  }, [kitProfile]);

  const evmAddress = social.addresses?.evm ?? null;
  const solanaAddress = social.addresses?.solana ?? null;
  // Addresses alone are not a session: after a tab closes, Decane remembers
  // WHO the user is but holds no JWT (needsReconnect), so every authed API
  // call would starve. Treating that state as signed-out routes the user
  // through /auth, where one passkey prompt or Google round trip restores a
  // real session.
  const authenticated = social.addresses !== null && Boolean(evmAddress) && !social.needsReconnect;

  // Read off the access token, since the kit exposes no user object. The
  // token can be null for a render while the kit rotates it; the id does not
  // change under a live session, so the last one read stands until sign-out
  // rather than flickering the queries keyed on it. Derived state, updated
  // during render the way React documents for it, not in an effect a render
  // behind.
  const { getAccessToken } = useSocialWallet();
  const token = authenticated ? getAccessToken() : null;
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const fromToken = token ? decodeDecaneUserId(token) : null;
  const userId = authenticated ? (fromToken ?? lastUserId) : null;
  if (userId !== lastUserId) setLastUserId(userId);

  // What sign-in told us about the user, persisted device-side because Decane
  // keeps no profile to re-fetch (see lib/display-profile). Google gives a
  // name; an email sign-in gives only the address, whose local part still
  // beats a generic label.
  const display = useDisplayProfile();
  const name =
    display?.name ?? (display?.email ? display.email.split("@")[0] : "World Street user");

  return {
    ready: mounted && (authenticated || graceOver || !hasPersistedIdentity()),
    authenticated,
    evmAddress,
    solanaAddress,
    userId,
    profile: {
      name,
      email: display?.email ?? "",
      avatarSeed: evmAddress ?? "worldstreet",
    },
    logout: async () => {
      // The display profile is deliberately KEPT. Signing out ends the session
      // (the kit revokes the JWT and drops it), but it does not mean "forget
      // me": the auth screen greets the returning user by name and offers the
      // account's own way back in — a passkey, or the unlock password — in
      // place of the full method list. Someone who is not that user taps "Use
      // a different account", which is where the profile is forgotten (see
      // the auth page). The session cache guard separately clears anything
      // private the moment the session is gone.
      await social.disconnect();
    },
  };
}
