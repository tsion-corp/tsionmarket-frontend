"use client";

import { useTranslations } from "next-intl";
import { RwaTradePanel } from "@/features/rwa/components/rwa-trade-panel";
import { useRwaAssets } from "@/features/rwa/hooks/use-rwa-assets";
import { useRwaEnrichedAssets } from "@/features/rwa/hooks/use-rwa-prices";
import { findRwaAsset } from "@/features/rwa/lib/presenter";
import type { RwaTradePayload } from "@/lib/modal-types";

// Trade a held RWA from the holdings list. Resolves the registry asset by network
// and address, then renders the RWA trade panel, which quotes and builds through
// the RWA service. This keeps RWA buy/sell off the Dextopus deposit router, which
// cannot source or deliver RWA tokens.
export function RwaTradeModal({
  payload,
  onContinueInBackground,
}: {
  payload: RwaTradePayload;
  onContinueInBackground?: () => void;
}) {
  const t = useTranslations("rwa");
  const { assets: rawAssets, loading } = useRwaAssets();
  // Same price fallback the table uses: without it a Solana asset opened from
  // Holdings shows $0 until the quote returns.
  const assets = useRwaEnrichedAssets(rawAssets);
  const asset = findRwaAsset(assets, payload.network, payload.address);

  if (asset) {
    return (
      <RwaTradePanel
        asset={asset}
        initialMode={payload.mode}
        bare
        onContinueInBackground={onContinueInBackground}
      />
    );
  }

  return (
    <div className="p-8 text-center">
      <div className="font-sans text-[14px] font-semibold text-white/85">
        {loading ? t("loading") : t("cantTradeNow", { symbol: payload.symbol })}
      </div>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
        {loading
          ? t("fetchingFromRegistry", { symbol: payload.symbol })
          : t("notFoundInRegistry", { symbol: payload.symbol })}
      </p>
    </div>
  );
}
