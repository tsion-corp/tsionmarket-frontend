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

  // The table owns the full view; a row opens the detail modal, and "Trade"
  // opens the trade modal — the same modal-driven flow the Markets tab uses,
  // rather than a static side panel.
  const [detailAsset, setDetailAsset] = useState<RwaApiAsset | null>(null);
  const [tradeAsset, setTradeAsset] = useState<RwaApiAsset | null>(null);

  // Only buyable assets on Base: non-tradable (issuer-only) ones and assets on
  // other chains are filtered out, so every row is actionable. The list owns
  // search/sort/paging.
  const buyable = useMemo(() => assets.filter((a) => isTradable(a) && isBaseAsset(a)), [assets]);

  const openTrade = (asset: RwaApiAsset) => {
    setDetailAsset(null);
    setTradeAsset(asset);
  };

  // One shell, two views: opening a trade from the detail sheet swaps the
  // content (contentKey change) so it slides across instead of stacking.
  const modalAsset = tradeAsset ?? detailAsset;
  const modalMode = tradeAsset ? "trade" : detailAsset ? "detail" : null;
  const closeModal = () => {
    setDetailAsset(null);
    setTradeAsset(null);
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Real-world assets</Eyebrow>
      <div className="mt-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="ws-display text-[26px] tracking-[-0.01em]">Real-world assets</h2>
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

      <div className="mt-5">
        <RwaAssetList
          assets={buyable}
          selectedId={modalAsset?.id ?? ""}
          loading={loading}
          error={error}
          onOpen={setDetailAsset}
          onTrade={openTrade}
        />
      </div>

      <ModalShell
        open={modalMode !== null}
        onClose={closeModal}
        contentKey={`${modalMode}-${modalAsset?.id ?? ""}`}
      >
        {modalMode === "trade" && tradeAsset ? (
          <RwaTradePanel key={tradeAsset.id} asset={tradeAsset} bare />
        ) : modalMode === "detail" && detailAsset ? (
          <RwaDetailSheet asset={detailAsset} onTrade={openTrade} />
        ) : null}
      </ModalShell>
    </div>
  );
};
