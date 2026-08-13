"use client";

import { useEffect, useRef } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { identifyUser, resetAnalytics, setSuper, track } from "@/lib/analytics/mixpanel";
import type { SignupMethod } from "@/lib/analytics/events";
import { identifyClarity, tagClaritySession } from "@/lib/analytics/clarity";
import { deriveProfile, getWalletAddress } from "@/lib/user";

/**
 * Keeps the analytics identity in step with Privy auth: identifies on login,
 * resets on logout, and mirrors the same id and segments into Clarity so a
 * session can be followed across both tools.
 *
 * The id is the account's embedded EVM wallet address, not Privy's user id.
 * That address is the same on every device the account signs in from, which is
 * what merges those sessions into one person; it is also the join key to
 * on-chain data. Solana is carried as a profile property instead, because an
 * id that flips between chains reads as two different users.
 *
 * Renders nothing. Mounted once, so no screen has to wire this up itself.
 */
// Privy's own login method names, mapped to the ones the catalog uses. Twitter
// is reported as "x". Anything unrecognised passes through as-is rather than
// being forced into one of the known values.
function authMethod(method: string | null): SignupMethod {
  if (!method) return "email";
  if (method === "twitter") return "x";
  if (method === "google" || method === "email" || method === "passkey") return method;
  if (method.includes("kingschat")) return "kingschat";
  return "email";
}

export function AnalyticsIdentity(): null {
  const { ready, authenticated, user } = usePrivy();

  // One callback for both cases, rather than instrumenting each of the auth
  // components separately: Privy tells us here whether this was a first login
  // and which method was used.
  useLogin({
    onComplete: ({ isNewUser, loginMethod, wasAlreadyAuthenticated }) => {
      // Entering the app with a live session is not a login: counting it would
      // turn every page refresh into a sign-in.
      if (wasAlreadyAuthenticated) return;
      const method = authMethod(loginMethod);
      if (isNewUser) track("signup_completed", { method });
      else track("login_completed", { method });
    },
  });
  // Identity is set once per signed-in account. Privy re-renders this on token
  // refreshes and wallet updates, and re-identifying on each would restate the
  // profile for no gain.
  const identifiedAs = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !user) {
      if (identifiedAs.current !== null) {
        resetAnalytics();
        identifiedAs.current = null;
      }
      return;
    }

    const walletEvm = getWalletAddress(user, "ethereum");
    // Until the embedded wallet exists there is no canonical id to attach to,
    // so events stay anonymous and merge in once it arrives.
    if (!walletEvm || identifiedAs.current === walletEvm) return;

    const profile = deriveProfile(user);
    const solAddress = getWalletAddress(user, "solana");

    identifyUser(walletEvm, {
      // Mixpanel's reserved contact fields. Governed: set here only, never
      // copied onto an event.
      $email: profile.email || undefined,
      $name: profile.name || undefined,
      sol_address: solAddress || undefined,
    });

    // Super properties ride on every later event. KYC status and deposit
    // history are not known from the Privy session alone, so the screens that
    // learn them call setSuper again rather than this guessing a value.
    setSuper({ platform: "web" });

    void identifyClarity(walletEvm);
    void tagClaritySession({ user_tier: "new" });

    identifiedAs.current = walletEvm;
  }, [ready, authenticated, user]);

  return null;
}
