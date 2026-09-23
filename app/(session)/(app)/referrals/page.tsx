"use client";

import { ReferralView } from "@/features/referrals";

// Invites and the reader's own referral network, as a route rather than the
// sheet it used to be. The auth guard and the app shell come from the (app)
// layout, so a shared link lands signed-in people straight here.
export default function ReferralsPage() {
  return <ReferralView />;
}
