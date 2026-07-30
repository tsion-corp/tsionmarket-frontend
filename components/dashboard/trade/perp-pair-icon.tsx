"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { FlagIcon } from "@/components/ui/flag-icon";
import { findAsset } from "@/lib/trade/assets";
import type { PerpCategory } from "@/lib/perp/types";

interface PerpPairIconProps {
  // The base symbol of the pair, e.g. "ETH", "EUR", "XAU", "NVDA".
  sym: string;
  category?: PerpCategory;
  size?: number;
}

// The icon for a perp market row. Crypto resolves through the token icon set;
// forex bases are currencies, so they get their country flag; commodities and
// equities have no token artwork anywhere (the gateway sends none), so they
// keep the lettered badge until the backend exposes a logoUrl per pair.
export function PerpPairIcon({ sym, category, size = 22 }: PerpPairIconProps) {
  if (category === "forex") {
    return <FlagIcon code={sym} symbol={sym} size={size} />;
  }
  return <AssetIcon sym={sym} bg={findAsset(sym)?.bg ?? "#3c3c3c"} size={size} />;
}
