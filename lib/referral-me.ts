import { createServiceClient } from "@/lib/api/service";

// The one read of /referrals/me, and the one query key for it.
//
// In lib/ because two callers need it and they sit in different places: the
// referral page (features/referrals) draws the whole picture, and any feature
// that can share something needs just the code (hooks/use-referral-code). Two
// queries on one key with two fetchers is a race over which one fills the
// cache, so there is one of each.
//
// Reading this is also what MINTS a wallet's code (kash ADR-0015):
// provisioning is lazy, on the first authenticated read, so a share surface
// asking for a code is what brings one into being.

const kash = createServiceClient("/api/kash", "Referrals are unavailable right now.");

/** What every caller can rely on. The page's own type extends it. */
export interface MyReferral {
  wallet: string;
  username: string | null;
  refCode?: string | null;
}

export const MY_REFERRAL_KEY = (wallet: string | null | undefined) => ["referrals", "me", wallet];

export function fetchMyReferral<T extends MyReferral = MyReferral>(): Promise<T> {
  return kash.authedGet<T>("/referrals/me");
}
