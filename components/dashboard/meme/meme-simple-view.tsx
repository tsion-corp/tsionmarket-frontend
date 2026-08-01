"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/components/dashboard/meme/meme-bits";
import { MemeTradeSheet } from "@/components/dashboard/meme/meme-trade-sheet";
import { useTrendingMemes } from "@/hooks/use-meme-tokens";
import type { MemeToken } from "@/lib/meme/api";

// The guided interface: trending memecoins as tap-to-trade cards. No table, no
// address bars — pick a coin, the sheet walks the rest.
export function MemeSimpleView() {
  const t = useTranslations("meme");
  const { tokens, isLoading, error } = useTrendingMemes();
  const [selected, setSelected] = useState<MemeToken | null>(null);

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
          {tokens.map((token) => (
            <button
              key={token.address}
              onClick={() => setSelected(token)}
              className="ws-card hover:border-accent/50 cursor-pointer rounded-[16px] p-4 text-left transition-[transform,border-color] duration-150 hover:-translate-y-0.5"
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
                <div>
                  <div className="tnum text-[15px] font-medium">{priceLabel(token.priceUsd)}</div>
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

      {selected ? <MemeTradeSheet token={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
