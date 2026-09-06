"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { NetworkIcon } from "@/components/ui/network-icon";
import { Switch } from "@/components/ui/switch";
import { SearchIcon } from "@/components/ui/icons";
import { useMoney } from "@/components/ui/currency-select";
import { TypeChip } from "@/features/portfolio/components/type-chip";
import { displayNetworkIconKey, displayNetworkLabel } from "@/features/portfolio/lib/network-label";
import { tokenBg } from "@/lib/trade/assets";
import { formatQty } from "@/lib/format";
import { displaySymbol } from "@/lib/buy";
import type { TokenBalance } from "@/hooks/use-portfolio";

interface HoldingsMobileProps {
  rows: TokenBalance[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  hideZero: boolean;
  onHideZero: (value: boolean) => void;
  page: number;
  pages: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenToken: (token: TokenBalance) => void;
}

// Holdings as the mobile design lists them: one line per asset, the amount and
// network under the symbol, the value on the right. The desktop table's price
// and network columns do not fit a phone and are already carried by the row's
// own second line, so this is a list rather than a squeezed table.
export function HoldingsMobile({
  rows,
  loading,
  search,
  onSearch,
  hideZero,
  onHideZero,
  page,
  pages,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onOpenToken,
}: HoldingsMobileProps) {
  const t = useTranslations("portfolio");
  const money = useMoney();

  return (
    <div
      className="overflow-hidden rounded-[20px] border border-white/12 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
      data-sensitive="balance"
    >
      <div className="px-4 pt-4 pb-3">
        <div className="ws-display text-[20px]">{t("yourHoldings")}</div>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] font-normal text-white outline-none"
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-[12px] font-normal whitespace-nowrap text-white/55">
            {t("hideZeroValue")}
            <Switch size="sm" checked={hideZero} onCheckedChange={onHideZero} />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 text-[11px] tracking-[0.04em] text-white/40 uppercase">
        <span>{t("asset")}</span>
        <span>{t("value")}</span>
      </div>

      {loading ? (
        // Same geometry as a real row, five of them. See the desktop table for
        // why: three short bars against a page of real rows moved everything
        // below on every load.
        [0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            className="flex items-center gap-3 border-t border-white/6 px-4 py-3.5"
          >
            <span className="size-9 shrink-0 animate-pulse rounded-[11px] bg-white/8" />
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-[14.5px] font-medium">
                <SkeletonLine width="w-14" />
              </span>
              <span className="mt-0.5 block text-[12px] font-normal">
                <SkeletonLine width="w-28" />
              </span>
            </span>
            <span className="shrink-0 text-right font-sans text-[14.5px] font-medium">
              <SkeletonLine width="w-16" />
            </span>
          </div>
        ))
      ) : rows.length === 0 ? (
        <div className="border-t border-white/6 px-5 py-8 text-center text-[13px] font-normal text-white/45">
          {search ? t("noSearchMatches") : hideZero ? t("noZeroHiddenAssets") : t("noHoldingsYet")}
        </div>
      ) : (
        <>
          {rows.map((token) => (
            <button
              key={token.symbol + token.network}
              onClick={() => onOpenToken(token)}
              className="flex w-full cursor-pointer items-center gap-3 border-t border-white/6 px-4 py-3.5 text-left transition-colors active:bg-white/4"
            >
              <span className="relative shrink-0">
                <AssetIcon
                  sym={displaySymbol(token.symbol)}
                  bg={tokenBg(token.symbol)}
                  logo={token.logo}
                  fallback="gradient"
                />
                <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
                  <NetworkIcon network={displayNetworkIconKey(token)} size={14} />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-sans text-[14.5px] font-medium">
                    {displaySymbol(token.symbol)}
                  </span>
                  <span className="shrink-0">
                    <TypeChip kind={token.kind} />
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] font-normal text-white/50">
                  {formatQty(token.balance)} · {displayNetworkLabel(token)}
                </span>
              </span>
              <span className="tnum shrink-0 text-right font-sans text-[14.5px] font-medium">
                {money.format(token.valueUsd)}
              </span>
            </button>
          ))}
          {pages > 1 ? (
            <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5">
              <span className="text-[12px] font-normal text-white/45">
                {t("pageOfPages", { page, pages })}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onPrev}
                  disabled={!canPrev}
                  className="cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[12.5px] font-medium text-white/75 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("prev")}
                </button>
                <button
                  onClick={onNext}
                  disabled={!canNext}
                  className="cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[12.5px] font-medium text-white/75 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
