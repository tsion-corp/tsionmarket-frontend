"use client";

import { useState, type FC } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ModalShell } from "@/components/ui/modal-shell";
import { RwaAssetList } from "@/components/dashboard/rwa/rwa-asset-list";
import { RwaTradePanel } from "@/components/dashboard/rwa/rwa-trade-panel";
import { RwaDetailSheet } from "@/components/dashboard/rwa/rwa-detail-sheet";
import { useRwaAssets, useRwaCategories } from "@/hooks/use-rwa-assets";
import { clampPage, isTradable, pageCount, pageSlice } from "@/lib/rwa/presenter";
import type { RwaApiAsset } from "@/lib/rwa-api";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";

// The dashboard page passes detail and confirm openers, but the RWA section owns
// its own detail sheet and trade flow, so it does not use them. The prop shape
// stays as the page expects so the dashboard keeps compiling.
export interface RwaSectionProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

const PER_PAGE = 9;

export const RwaSection: FC<RwaSectionProps> = () => {
  const { assets, loading, error } = useRwaAssets();
  const categories = useRwaCategories();

  const [tab, setTab] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [detailAsset, setDetailAsset] = useState<RwaApiAsset | null>(null);

  const catList = categories.length
    ? categories.map((c) => c.category)
    : [...new Set(assets.map((a) => a.category))];
  const tabs = ["All", ...catList];

  const filtered = tab === "All" ? assets : assets.filter((a) => a.category === tab);
  const pages = pageCount(filtered.length, PER_PAGE);
  const pageClamped = clampPage(page, filtered.length, PER_PAGE);
  const visible = pageSlice(filtered, pageClamped, PER_PAGE);

  const selected =
    assets.find((a) => a.id === selectedId) ?? assets.find(isTradable) ?? assets[0] ?? null;

  const onTab = (next: string) => {
    setTab(next);
    setPage(1);
  };

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
            tabs={tabs}
            activeTab={tab}
            onTab={onTab}
            visible={visible}
            total={filtered.length}
            page={pageClamped}
            pages={pages}
            onPage={setPage}
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
