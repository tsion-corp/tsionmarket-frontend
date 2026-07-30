"use client";

import { AssetIcon, hasTokenIcon } from "@/components/ui/asset-icon";
import { FlagIcon } from "@/components/ui/flag-icon";
import { GradientCoin } from "@/components/ui/gradient-coin";
import { findAsset } from "@/lib/trade/assets";
import type { PerpCategory } from "@/lib/perp/types";

interface PerpPairIconProps {
  // The base symbol of the pair, e.g. "ETH", "EUR", "XAU", "NVDA".
  sym: string;
  category?: PerpCategory;
  size?: number;
}

// The icon for a perp market row. Crypto resolves through the token icon set;
// forex bases are currencies, so they get their country flag; everything with
// no artwork anywhere (memecoins the icon set lacks, commodities, equities —
// the gateway sends no logoUrl) gets a deterministic gradient coin instead of
// a text badge.
export function PerpPairIcon({ sym, category, size = 22 }: PerpPairIconProps) {
  if (category === "forex") {
    return <FlagIcon code={sym} symbol={sym} size={size} />;
  }
  if (!hasTokenIcon(sym)) {
    return <GradientCoin sym={sym} size={size} />;
  }
  return <AssetIcon sym={sym} bg={findAsset(sym)?.bg ?? "#3c3c3c"} size={size} />;
}
