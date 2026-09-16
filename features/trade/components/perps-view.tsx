"use client";

import { HyperliquidProPerps } from "@/features/trade/components/hyperliquid-pro-perps";

// The perpetuals body: Hyperliquid-backed trading (see apps/perp's README for
// the backend side, apps/perp/src/signing/README.md for the signing model).
//
// One desk, at every width. This used to pick between a guided "simple" view
// and the full "pro" desk from the perp-mode store; the switch was removed and
// the pro desk is now what everyone gets. HyperliquidSimplePerps is left in the
// tree, unreachable, rather than deleted in the same change.
export function PerpsView() {
  return <HyperliquidProPerps />;
}
