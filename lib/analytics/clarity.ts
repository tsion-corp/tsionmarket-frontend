// Microsoft Clarity: session replay, heatmaps, rage and dead clicks, and JS
// errors. It captures those on its own, so unlike Mixpanel there is no event
// catalog here. What this module adds is the tagging that makes a recording
// findable: the same identity and the same segments Mixpanel uses, so a drop
// spotted in one tool can be watched in the other.
//
// Masking is not optional. Any field holding a NIN, BVN, bank account or
// virtual account number, transfer reference or OTP must carry
// `data-clarity-mask="true"`, because a replay of one of those is the same
// breach as sending it. Use the MASK_ATTRIBUTE export below so the intent is
// searchable rather than a bare string spread across screens.

import type { KycStatus, UserTier } from "@/lib/analytics/events";

const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

let initialized = false;

/**
 * Spread onto any input that could hold identity-theft or account-drainage
 * grade data, so Clarity records a placeholder instead of the value.
 *
 * <input {...MASK_ATTRIBUTE} /> reads as intent; `data-clarity-mask="true"`
 * scattered inline does not.
 */
export const MASK_ATTRIBUTE = { "data-clarity-mask": "true" } as const;

// Call once, client-side. A no-op without a project id, so local dev records
// nothing and never contacts Clarity.
export async function initClarity(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  if (!PROJECT_ID) return;
  try {
    // Loaded on demand so the SDK stays out of the initial bundle: nothing
    // renders from it, and a replay starting a moment later costs nothing.
    const { default: Clarity } = await import("@microsoft/clarity");
    Clarity.init(PROJECT_ID);
    initialized = true;
  } catch (error) {
    // Analytics must never take a screen down with it.
    console.warn("[analytics] Clarity failed to start", error);
  }
}

/**
 * Ties a recording to the same id Mixpanel uses, so a session found in one
 * tool can be looked up in the other.
 */
export async function identifyClarity(walletEvm: string): Promise<void> {
  if (!initialized || !walletEvm) return;
  try {
    const { default: Clarity } = await import("@microsoft/clarity");
    Clarity.identify(walletEvm);
  } catch {
    // A failed tag is not worth surfacing; the recording still happens.
  }
}

/**
 * Tags the session with the segments Mixpanel slices by, so "60% drop at KYC"
 * in Mixpanel becomes "watch those sessions" in Clarity.
 *
 * Never put contact details or document numbers in a tag.
 */
export async function tagClaritySession(tags: {
  kyc_status?: KycStatus;
  user_tier?: UserTier;
  country?: string;
}): Promise<void> {
  if (!initialized) return;
  try {
    const { default: Clarity } = await import("@microsoft/clarity");
    for (const [key, value] of Object.entries(tags)) {
      if (value) Clarity.setTag(key, value);
    }
  } catch {
    // As above: tagging is best effort.
  }
}
