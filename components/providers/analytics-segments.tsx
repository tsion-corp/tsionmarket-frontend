"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { setProfile, setSuper } from "@/lib/analytics/mixpanel";
import { tagClaritySession } from "@/lib/analytics/clarity";
import type { Portfolio } from "@/hooks/use-portfolio";
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

function isPortfolioQuery(query: Query): boolean {
  return query.queryKey[0] === "portfolio";
}

function register(totalUsd: number): void {
  const user_tier = tierFor(totalUsd);
  // A balance is the only client-side evidence that money ever arrived.
  const has_deposited = totalUsd > 0;

  setSuper({ user_tier, has_deposited, platform: "web" });
  // The same figures on the profile, so an account can be segmented in
  // Mixpanel's user views and not just inside a report on its events.
  setProfile({ portfolio_value_usd: totalUsd, has_deposited });
  void tagClaritySession({ user_tier });
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
 *
 * This listens to the query cache rather than calling usePortfolio. That hook
 * owns the balance poll, and mounting it here, above every route, kept the
 * poll and its Alchemy read running on the perps desk, in the casino, on
 * every page, purely to feed a segment. A segment needs the latest total the
 * app happens to know, not a subscription of its own. Listening costs no
 * request: the value updates whenever a page that shows the balance loads
 * it, and stays put otherwise.
 *
 * Renders nothing.
 */
export function AnalyticsSegments(): null {
  const { ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ready || !authenticated) return;

    const cache = queryClient.getQueryCache();
    // Whatever is already known, so a page that loaded the balance before
    // this effect ran (or a persisted snapshot) is registered at once.
    // findAll, not find: find matches the key exactly, and the portfolio key
    // carries the wallet addresses after the prefix.
    const known = cache
      .findAll({ queryKey: ["portfolio"] })
      .map((query) => query.state.data as Portfolio | undefined)
      .find((data) => data !== undefined);
    if (known) register(known.totalUsd);

    return cache.subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      if (!isPortfolioQuery(event.query)) return;
      const data = event.query.state.data as Portfolio | undefined;
      if (data) register(data.totalUsd);
    });
  }, [ready, authenticated, queryClient]);

  return null;
}
