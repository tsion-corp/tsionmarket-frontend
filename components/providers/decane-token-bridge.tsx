"use client";

import { useEffect } from "react";
import { useSocialWallet } from "decane-connect-kit";
import { useAuthSession } from "@/hooks/use-auth-session";
import { registerDecaneTokenSource } from "@/lib/auth-token";
import { clearDecaneSessionCookie, syncDecaneSessionCookie } from "@/lib/decane-session-cookie";
import { captureDisplayProfileFromUrl } from "@/lib/display-profile";

// Hands the Decane session's access-token getter to the transport layer, so
// apiFetch (a plain module, no React context) can attach the token. Renders
// nothing; must sit inside DecaneKit to read the session.
export function DecaneTokenBridge() {
  const { getAccessToken } = useSocialWallet();
  const { ready, authenticated } = useAuthSession();
  useEffect(() => {
    registerDecaneTokenSource(getAccessToken);
    return () => registerDecaneTokenSource(null);
  }, [getAccessToken]);

  // The same token in a cookie, for the one thing a Bearer header cannot reach:
  // the chess board's <iframe src="/api/chess/play">, which is a navigation.
  //
  // Polled rather than written once. The kit hydrates its session after mount
  // and rotates the token later, and `getAccessToken` keeps the same identity
  // across both — so there is no dependency to react to, and a single write at
  // mount lands a null straight after sign-in and leaves the iframe anonymous
  // until the next tick. Writing a cookie costs nothing, so the tick is short.
  useEffect(() => {
    const sync = () => {
      const token = getAccessToken();
      if (token) {
        syncDecaneSessionCookie(token);
        return;
      }
      // A null token is almost always the kit rotating or still hydrating —
      // not a sign-out. Clearing on it made the cookie flicker in and out, and
      // any iframe navigation landing in a gap arrived anonymous. The cookie
      // carries its own expiry, so leaving it in place is safe; only a settled
      // signed-out session clears it.
      if (ready && !authenticated) clearDecaneSessionCookie();
    };
    sync();
    const timer = setInterval(sync, 2_000);
    // Deliberately no clear on teardown: this effect re-runs whenever
    // getAccessToken changes identity, and wiping the cookie on every
    // re-render was the other half of the flicker.
    return () => clearInterval(timer);
  }, [getAccessToken, ready, authenticated]);
  // A child of DecaneKit, so this effect runs before the kit's init effect
  // strips the sign-in return params from the URL, which is the only moment
  // the Google profile is readable (see lib/display-profile).
  useEffect(() => {
    captureDisplayProfileFromUrl();
  }, []);
  return null;
}
