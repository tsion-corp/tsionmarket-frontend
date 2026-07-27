"use client";

import { useMemo, useState, type FC } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { RwaAssetList } from "@/components/dashboard/rwa/rwa-asset-list";
import { RwaTradePanel } from "@/components/dashboard/rwa/rwa-trade-panel";
import { RwaDetailSheet } from "@/components/dashboard/rwa/rwa-detail-sheet";
import { useRwaAssets } from "@/hooks/use-rwa-assets";
import { isBaseAsset, isTradable } from "@/lib/rwa/presenter";
import type { RwaApiAsset } from "@/lib/rwa-api";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";

// The dashboard page passes detail and confirm openers, but the RWA section owns
// its own detail sheet and trade flow, so it does not use them. The prop shape
// stays as the page expects so the dashboard keeps compiling.
export interface RwaSectionProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export const RwaSection: FC<RwaSectionProps> = () => {
  const { assets, loading, error } = useRwaAssets();

  const [selectedId, setSelectedId] = useState("");
  const [detailAsset, setDetailAsset] = useState<RwaApiAsset | null>(null);

  // The table shows only buyable assets on Base: non-tradable (issuer-only) ones
  // and assets on other chains are filtered out, so every row is actionable and
  // on Base. Category tabs derive from this list, so they follow the filter. The
  // list owns search/sort/paging.
  const buyable = useMemo(() => assets.filter((a) => isTradable(a) && isBaseAsset(a)), [assets]);
  const selected = buyable.find((a) => a.id === selectedId) ?? buyable[0] ?? null;

  const onTrade = (asset: RwaApiAsset) => {
    setSelectedId(asset.id);
    setDetailAsset(null);
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Real-world assets</Eyebrow>
      <div className="mt-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="ws-serif text-[26px] tracking-[-0.01em]">Real-world assets</h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] font-normal text-white/55">
            Tokenized treasuries, equities, credit and metals. Live prices, onchain settlement,
            trade or access through the issuer.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-white/60">
          <span className="bg-up h-1.5 w-1.5 rounded-full" />
          Live registry
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 min-[980px]:grid-cols-[1fr_380px] min-[980px]:items-start">
        <div className="order-2 min-[980px]:order-1">
          <RwaAssetList
            assets={buyable}
            selectedId={selected?.id ?? ""}
            loading={loading}
            error={error}
            onOpen={setDetailAsset}
            onTrade={onTrade}
          />
        </div>

        <div className="order-1 mt-2.5 min-[980px]:sticky min-[980px]:top-[88px] min-[980px]:order-2">
          {selected ? <RwaTradePanel key={selected.id} asset={selected} /> : null}
        </div>
      </div>

      <ModalShell open={detailAsset !== null} onClose={() => setDetailAsset(null)}>
        {detailAsset ? <RwaDetailSheet asset={detailAsset} onTrade={onTrade} /> : null}
      </ModalShell>
    </div>
  );
};
