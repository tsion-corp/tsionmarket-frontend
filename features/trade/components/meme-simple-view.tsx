"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/features/trade/components/meme-bits";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { useTrendingMemes } from "@/features/trade/hooks/use-meme-tokens";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePaged } from "@/hooks/use-paged";
import type { MemeToken } from "@/lib/meme/api";

// Coins per page, matching the other market lists.
const PER_PAGE = 6;

// The guided interface: trending memecoins as tap-to-trade cards. No table, no
// address bars — pick a coin, the sheet walks the rest.
export function MemeSimpleView() {
  const t = useTranslations("meme");
  const { tokens, isLoading, error } = useTrendingMemes();
  const [selected, setSelected] = useState<MemeToken | null>(null);
  // Six to a page, as everywhere else, so the grid never runs past a screen.
  const paged = usePaged(tokens, PER_PAGE);

  return (
    <div>
      <div className="ws-display mb-3 text-[18px]">{t("trendingTitle")}</div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-[120px] animate-pulse rounded-[16px] bg-white/6" />
          ))}
        </div>
      ) : error || tokens.length === 0 ? (
        <div className="ws-card grid place-items-center px-4 py-14 text-center text-[13px] font-normal text-white/45">
          {error ? t("unavailable") : t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {paged.pageItems.map((token) => (
            <button
              key={token.address}
              onClick={() => setSelected(token)}
              // h-full + column layout so every card in a row is the same
              // height and the price sits on the baseline across the grid;
              // overflow-hidden keeps content inside the rounded corners.
              className="ws-card hover:border-accent/50 flex h-full cursor-pointer flex-col justify-between overflow-hidden rounded-[16px] p-4 text-left transition-[transform,border-color] duration-150 hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2.5">
                <MemeCoin token={token} size={32} />
                <div className="min-w-0">
                  <div className="truncate font-sans text-[14px] font-semibold">
                    {token.symbol ?? "?"}
                  </div>
                  <div className="truncate text-[11px] font-normal text-white/45">
                    {token.name ?? "—"}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                {/* min-w-0: a flex item defaults to min-width:auto and refuses
                    to shrink below its text, which pushed the badge out of the
                    card on the longest prices. */}
                <div className="min-w-0">
                  <div className="tnum truncate text-[15px] font-medium">
                    {priceLabel(token.priceUsd)}
                  </div>
                  <div className="text-[11.5px]">
                    <PctChange value={token.priceChange24hPercent} />
                  </div>
                </div>
                <RiskBadge level={token.riskLevel} />
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && !error && tokens.length > 0 ? (
        <ListPagination
          page={paged.page + 1}
          pages={paged.pageCount}
          onPage={(p) => (p > paged.page + 1 ? paged.goNext() : paged.goPrev())}
        />
      ) : null}

      {selected ? <MemeTradeSheet token={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
