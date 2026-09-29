"use client";

import { isReferralCode } from "@/lib/referral-code";

// The /r/<code> landing route, and a ?ref= on any other route, drop the code in
// this cookie so it
// survives the whole sign-up flow: OAuth redirects, the interests page, and
// however many days pass before the visitor actually creates an account. The
// claim hook reads it after login and clears it once the claim is settled.
export const REF_COOKIE = "ark_ref";

export function readRefCode(
  cookie: string = typeof document === "undefined" ? "" : document.cookie
): string | null {
  for (const pair of cookie.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== REF_COOKIE) continue;
    let value = pair.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    return isReferralCode(value) ? value : null;
  }
  return null;
}

export function clearRefCode(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${REF_COOKIE}=; max-age=0; path=/`;
}
