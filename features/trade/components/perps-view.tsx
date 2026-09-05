"use client";

import { usePerpMode } from "@/features/trade/components/perp-mode";
import { HyperliquidSimplePerps } from "@/features/trade/components/hyperliquid-simple-perps";
import { HyperliquidProPerps } from "@/features/trade/components/hyperliquid-pro-perps";

// The perpetuals body: Hyperliquid-backed trading (see apps/perp's README
// for the backend side, apps/perp/src/signing/README.md for the signing
// model), simple and pro over the same data layer — same split the old
// Avantis-on-Base flow had, chosen by the shared perp-mode store.
export function PerpsView() {
  const { mode } = usePerpMode();
  return mode === "pro" ? <HyperliquidProPerps /> : <HyperliquidSimplePerps />;
}
