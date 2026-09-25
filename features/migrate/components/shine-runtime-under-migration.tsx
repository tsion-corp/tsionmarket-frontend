"use client";

import { ShineRuntimeProvider } from "@/components/providers/shine-runtime";
import { useOfferMigrationState } from "@/features/migrate/hooks/use-offer-migration";

/**
 * The Shine runtime, paused while an account upgrade is offered or still
 * being decided.
 *
 * A Shine post is made under the account's Decane id. For someone whose old
 * Square profile is not linked yet, the Square provisions an empty profile at
 * that id on the first authenticated write, and the post makes that shell
 * somebody's account: the later link then meets a real collision and
 * refuses, and the person is split for good. The gate normally keeps such a
 * person from trading at all, but "continue for now" puts it away for a day,
 * and one confirmed trade in that window would do it. So nothing posts while
 * the offer stands; once the account is linked, or known to have nothing to
 * link, the offer is off and Shine is back. Renders nothing.
 */
export function ShineRuntimeUnderMigration() {
  const { offer, deciding } = useOfferMigrationState();
  return <ShineRuntimeProvider paused={offer || deciding} />;
}

// The default export is what app/(session)/providers.tsx defers through next/dynamic.
export default ShineRuntimeUnderMigration;
