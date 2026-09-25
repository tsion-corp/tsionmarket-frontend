"use client";

import { useEffect, useRef } from "react";
import { useSocialAuth } from "decane-connect-kit";
import {
  identifyUser,
  resetAnalytics,
  resetStaleIdentity,
  setProfileOnce,
  setSuper,
  track,
} from "@/lib/analytics/mixpanel";
import { consumeAuthMethod } from "@/lib/analytics/auth-method";
import { identifyClarity, tagClaritySession } from "@/lib/analytics/clarity";
import { useAuthSession } from "@/hooks/use-auth-session";

/**
 * Keeps the analytics identity in step with the auth session: identifies on
 * login, resets on logout, and mirrors the same id and segments into Clarity
 * so a session can be followed across both tools.
 *
 * The id is the account's embedded EVM wallet address. That address is the
 * same on every device the account signs in from, which is what merges those
 * sessions into one person; it is also the join key to on-chain data. Solana
 * is carried as a profile property instead, because an id that flips between
 * chains reads as two different users.
 *
 * Login and signup events fire only when a sign-in completed in THIS mounted
 * session: the auth components record the method they ran (see
 * lib/analytics/auth-method), and a session that hydrates without one is a
 * returning visitor, not a login. (Privy offered a login callback for this;
 * Decane does not, so the auth components say it themselves.)
 *
 * Renders nothing. Mounted once, so no screen has to wire this up itself.
 */

// Ships with the build, so a report can tell which release an event came from.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

export function AnalyticsIdentity(): null {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const { isNewUser } = useSocialAuth();

  // Identity is set once per signed-in account; re-identifying on every
  // session re-render would restate the profile for no gain.
  const identifiedAs = useRef<string | null>(null);
  // Whether this visit has already cleared a previous session's identity.
  const staleChecked = useRef(false);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      if (identifiedAs.current !== null) {
        resetAnalytics();
        identifiedAs.current = null;
      } else if (!staleChecked.current) {
        // No session, and none seen in this tab. Anything the device still
        // holds is a previous session's identity.
        resetStaleIdentity();
      }
      staleChecked.current = true;
      return;
    }
    staleChecked.current = true;

    // Until the embedded wallet exists there is no canonical id to attach to,
    // so events stay anonymous and merge in once it arrives.
    if (!evmAddress || identifiedAs.current === evmAddress) return;

    // identifyUser lowercases the address, and does so in one place so every
    // caller lands on the same id: the lowercase form is the catalog's.
    identifyUser(evmAddress, {
      // Mixpanel's reserved contact fields. Governed: set here only, never
      // copied onto an event.
      $email: profile.email || undefined,
      $name: profile.name || undefined,
      sol_address: solanaAddress || undefined,
    });

    // Super properties ride on every later event. KYC status and deposit
    // history are not known from the session alone, so the screens that learn
    // them call setSuper again rather than this guessing a value.
    // `wallet_evm` is the lowercase form on-chain data is keyed by, for joins.
    setSuper({ platform: "web", app_version: APP_VERSION, wallet_evm: evmAddress.toLowerCase() });

    void identifyClarity(evmAddress);
    void tagClaritySession({ user_tier: "new" });

    identifiedAs.current = evmAddress;

    // AFTER identify: a signup sent before the account is identified is
    // anonymous and lands on nobody. The method was recorded by the auth
    // component when the sign-in ran, and waits here until the wallet exists.
    const method = consumeAuthMethod();
    if (method) {
      if (isNewUser) {
        track("signup_completed", { method });
        // set_once, so these keep describing the account's first sign-in
        // rather than drifting to whichever method was used most recently.
        setProfileOnce({ signup_method: method, signup_date: new Date().toISOString() });
      } else {
        track("login_completed", { method });
      }
    }
  }, [ready, authenticated, evmAddress, solanaAddress, profile, isNewUser]);

  return null;
}
