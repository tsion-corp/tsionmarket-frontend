"use client";

import { useMemo, type FC } from "react";
import { RwaPhoneList } from "@/features/rwa/components/rwa-phone-list";
import { useListedRwaAssets } from "@/features/rwa/hooks/use-rwa-assets";
import { useRwaEnrichedAssets } from "@/features/rwa/hooks/use-rwa-prices";
import { dedupeByChain } from "@/features/rwa/lib/presenter";
import { useTradePrefill } from "@/hooks/use-trade-prefill";

export interface RwaSectionProps {
  // Raised to the route's modal host, which owns Add funds. The ticket has no
  // access to it, so it travels through the list.
  onAddFunds?: () => void;
}

// The Real assets tab of the phone Market page: the asset list, which swaps
// itself for the order ticket when a row is tapped. No modal, the way the Spot
// tab has none.
//
// This is the tab's data layer and nothing else. It decides which assets are
// listable, enriches them with live prices, reads a spoken order off the URL,
// and hands all three to the list. The desk at /rwa composes RwaDeskView
// directly and does not come through here.
export const RwaSection: FC<RwaSectionProps> = ({ onAddFunds }) => {
  const { assets, loading, error } = useListedRwaAssets();

  // What is listable is decided by the data layer, not here, so no screen can
  // widen it by accident. All that is left is collapsing an asset the catalogue
  // lists more than once. Prices the registry omits are filled in below.
  const tradable = useMemo(() => dedupeByChain(assets), [assets]);
  const buyable = useRwaEnrichedAssets(tradable);

  // A spoken "buy $10 of Ondo" arrives as URL params. It is handed down rather
  // than acted on here: the list owns the ticket, so it owns what opens it.
  const prefill = useTradePrefill();

  return (
    <RwaPhoneList
      assets={buyable}
      loading={loading}
      error={error}
      onAddFunds={onAddFunds}
      prefill={prefill}
    />
  );
};
