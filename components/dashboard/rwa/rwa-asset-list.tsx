"use client";

import { RwaAssetRow } from "@/components/dashboard/rwa/rwa-asset-row";
import { RwaCategoryTabs } from "@/components/dashboard/rwa/rwa-category-tabs";
import { RwaPagination } from "@/components/dashboard/rwa/rwa-pagination";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import type { RwaApiAsset } from "@/lib/rwa-api";

interface RwaAssetListProps {
  tabs: readonly string[];
  activeTab: string;
  onTab: (tab: string) => void;
  visible: RwaApiAsset[];
  total: number;
  page: number;
  pages: number;
  onPage: (page: number) => void;
  selectedId: string;
  loading: boolean;
  error: boolean;
  onOpen: (asset: RwaApiAsset) => void;
  onTrade: (asset: RwaApiAsset) => void;
}

export function RwaAssetList({
  tabs,
  activeTab,
  onTab,
  visible,
  total,
  page,
  pages,
  onPage,
  selectedId,
  loading,
  error,
  onOpen,
  onTrade,
}: RwaAssetListProps) {
  const logos = useTokenLogos(visible.map((a) => ({ chain: a.chain, address: a.address })));

  return (
    <div>
      <RwaCategoryTabs tabs={tabs} active={activeTab} onChange={onTab} />

      <div className="ws-card mt-4 overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_auto] gap-3 px-4 py-4 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[820px]:grid-cols-[2fr_1fr_0.8fr_1fr_0.8fr] sm:px-6">
          <span>Asset</span>
          <span className="text-right">Price</span>
          <span className="hidden text-right min-[820px]:block">APY</span>
          <span className="hidden text-right min-[820px]:block">TVL</span>
          <span />
        </div>

        {error ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            The RWA registry is unavailable right now. Please try again shortly.
          </div>
        ) : loading ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            Loading real-world assets…
          </div>
        ) : total === 0 ? (
          <div className="border-t border-white/6 px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            No assets in this category.
          </div>
        ) : (
          <>
            {visible.map((asset) => (
              <RwaAssetRow
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedId}
                logo={logos[tokenLogoKey(asset.chain, asset.address)]}
                onOpen={() => onOpen(asset)}
                onTrade={() => onTrade(asset)}
              />
            ))}
            <RwaPagination page={page} pages={pages} onPage={onPage} />
          </>
        )}
      </div>
    </div>
  );
}
