"use client";

import { RwaTradePanel } from "@/components/dashboard/rwa/rwa-trade-panel";
import { useRwaAssets } from "@/hooks/use-rwa-assets";
import { findRwaAsset } from "@/lib/rwa/presenter";
import type { RwaTradePayload } from "@/components/dashboard/modal-types";

// Trade a held RWA from the holdings list. Resolves the registry asset by network
// and address, then renders the RWA trade panel, which quotes and builds through
// the RWA service. This keeps RWA buy/sell off the Dextopus deposit router, which
// cannot source or deliver RWA tokens.
export function RwaTradeModal({ payload }: { payload: RwaTradePayload }) {
  const { assets, loading } = useRwaAssets();
  const asset = findRwaAsset(assets, payload.network, payload.address);

  if (asset) {
    return <RwaTradePanel asset={asset} initialMode={payload.mode} bare />;
  }

  return (
    <div className="p-8 text-center">
      <div className="font-sans text-[14px] font-semibold text-white/85">
        {loading ? "Loading…" : `Can't trade ${payload.symbol} right now`}
      </div>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
        {loading
          ? `Fetching ${payload.symbol} from the RWA registry.`
          : `We couldn't find ${payload.symbol} in the RWA registry. Try again shortly.`}
      </p>
    </div>
  );
}
