"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { setProfile, setSuper } from "@/lib/analytics/mixpanel";
import { tagClaritySession } from "@/lib/analytics/clarity";
import { usePortfolio } from "@/hooks/use-portfolio";
import type { UserTier } from "@/lib/analytics/events";

// A signed-in account with nothing in it has not started yet; one holding a
// balance has been activated; a substantial balance reads as a power user.
// These are the cuts the launch questions are asked in, so they are attached to
// every event rather than looked up per report.
const ACTIVATED_USD = 1;
const POWER_USD = 500;

function tierFor(totalUsd: number): UserTier {
  if (totalUsd >= POWER_USD) return "power";
  if (totalUsd >= ACTIVATED_USD) return "activated";
  return "new";
}

/**
 * Keeps the super properties in step with what the app knows about the account.
 *
 * KYC status is not set here: this provider sits above the features and must
 * not read their state. The KYC screen reports its own status instead, which
 * is also the only place that can tell "pending" from "not started".
 *
 * Mixpanel attaches these to every event, so a funnel can be sliced by
 * verification, balance and tier without each call site passing them through.
 * Re-registering is cheap and idempotent, which is why this simply follows the
 * portfolio rather than trying to detect the moment a value changes.
 *
 * Renders nothing.
 */
export function AnalyticsSegments(): null {
  const { ready, authenticated } = usePrivy();
  const { totalUsd, loading } = usePortfolio();

  useEffect(() => {
    if (!ready || !authenticated || loading) return;

    const user_tier = tierFor(totalUsd);
    // A balance is the only client-side evidence that money ever arrived.
    const has_deposited = totalUsd > 0;

    setSuper({ user_tier, has_deposited, platform: "web" });
    // The same figures on the profile, so an account can be segmented in
    // Mixpanel's user views and not just inside a report on its events.
    setProfile({ portfolio_value_usd: totalUsd, has_deposited });
    void tagClaritySession({ user_tier });
  }, [ready, authenticated, loading, totalUsd]);

  return null;
}
