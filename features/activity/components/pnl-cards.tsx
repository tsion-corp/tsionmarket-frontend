"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { useMoney } from "@/components/ui/currency-select";
import { ShareToSquare, type ShareDraft } from "@/components/share/share-to-square";
import { closedPositions, realisedPercent, type AssetPnl } from "@/lib/pnl";
import { tokenBg } from "@/lib/trade/assets";
import { displaySymbol } from "@/lib/buy";
import { formatQty } from "@/lib/format";
import type { ActivityEntry } from "@/lib/activity/entries";

/**
 * What a trade actually made, once it is over.
 *
 * REALISED only. This is "what I made on the ones I sold", never "what my
 * position is worth now": the second needs live prices and a complete
 * position history, and stating it from this data would be a guess wearing a
 * number. A card that is right about a smaller thing beats a card that is
 * confident about a bigger one.
 *
 * Only assets something was actually sold from appear. An open position has
 * no result yet, and showing it at zero would read as break-even rather than
 * as unfinished.
 */
function PnlCard({ asset, onShare }: { asset: AssetPnl; onShare: () => void }) {
  const t = useTranslations("activity");
  const money = useMoney();
  const percent = realisedPercent(asset);
  const up = asset.realised >= 0;
  const symbol = displaySymbol(asset.symbol);

  return (
    <div className="ws-card flex min-w-[232px] shrink-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <AssetIcon sym={symbol} bg={tokenBg(symbol)} fallback="gradient" size={28} />
        <span className="truncate font-sans text-[14px] font-medium">{symbol}</span>
        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${symbol} result to Market Square`}
          className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white/55 transition-colors hover:bg-white/8 hover:text-white"
        >
          {t("share")}
        </button>
      </div>

      <div>
        {/* The figure leads and carries its own sign, because "+$40" and
            "$40" mean different things and only one of them is the answer. */}
        <div className={`tnum text-[22px] font-semibold ${up ? "text-up" : "text-white/85"}`}>
          {up ? "+" : "−"}
          {money.format(Math.abs(asset.realised))}
        </div>
        {percent !== null && (
          <div className="tnum text-[12.5px] font-normal text-white/45">
            {up ? "+" : "−"}
            {Math.abs(percent).toFixed(1)}%{" "}
            {t("onCost", { cost: money.format(asset.realisedCostBasis) })}
          </div>
        )}
      </div>

      {/* Said plainly rather than hidden. A sale we have no purchase for would
          otherwise be scored as pure profit, which is the most flattering lie
          this card could tell. */}
      {asset.unbackedQuantity > 0 && (
        <p className="text-[11px] leading-4 font-normal text-white/40">
          {t("pnlPartial", { qty: formatQty(asset.unbackedQuantity), symbol })}
        </p>
      )}
    </div>
  );
}

export function PnlCards({ entries }: { entries: ActivityEntry[] }) {
  const t = useTranslations("activity");
  const money = useMoney();
  const [sharing, setSharing] = useState<AssetPnl | null>(null);
  const closed = closedPositions(entries);
  if (closed.length === 0) return null;

  const draft = (asset: AssetPnl): ShareDraft => {
    const percent = realisedPercent(asset);
    const up = asset.realised >= 0;
    const symbol = displaySymbol(asset.symbol);
    return {
      title: t(up ? "pnlShareWin" : "pnlShareLoss", { symbol }),
      subtitle: percent === null ? symbol : `${up ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`,
      deepLink: { kind: "activity", ref: "" },
      suggestedText: "",
      // The money stays behind the same opt-in every other share uses: one
      // careless tap must not publish what somebody's trade was worth.
      amount: money.format(Math.abs(asset.realised)),
    };
  };

  return (
    <>
      <div className="mt-[18px]">
        <div className="mb-2 px-1 text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
          {t("pnlHeading")}
        </div>
        {/* A rail, not a grid: results are glanced at, and a grid of them would
            outweigh the timeline they belong to. */}
        <div className="flex [scrollbar-width:none] gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {closed.map((asset) => (
            <PnlCard key={asset.symbol} asset={asset} onShare={() => setSharing(asset)} />
          ))}
        </div>
      </div>

      {sharing && <ShareToSquare draft={draft(sharing)} open onClose={() => setSharing(null)} />}
    </>
  );
}
