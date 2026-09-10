"use client";

import { useTranslations } from "next-intl";
import {
  PortfolioDonut,
  PortfolioDonutSkeleton,
} from "@/features/portfolio/components/portfolio-donut";
import { CurrencySelect, useMoney } from "@/components/ui/currency-select";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";

// The balance card as the desktop app has always shown it: the total and the
// two buttons on one line, the breakdown ring only once something is held.
export function BalanceCardDesktop({
  totalUsd,
  readyToSpend,
  tokens,
  loading,
  refreshing,
  errored,
  depositPending,
  withdrawHeld,
  hidden,
  onToggleHidden,
  formatMasked,
  onOpenFunds,
  onOpenWithdraw,
}: BalanceCardViewProps) {
  const t = useTranslations("balance");
  const money = useMoney();

  return (
    <div className="ws-card p-5 sm:p-[26px]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-[13px] font-normal text-white/60">
          {t("totalBalance")}
          <button
            onClick={onToggleHidden}
            aria-label={hidden ? t("showBalance") : t("hideBalance")}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white/45 transition-colors hover:bg-white/8 hover:text-white/80"
          >
            {hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
          </button>
          {refreshing ? (
            <span
              className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full"
              title="Refreshing…"
            />
          ) : null}
        </div>
        <CurrencySelect value={money.currency} onSelect={money.setCurrency} />
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          {loading ? (
            // The same two lines at the same sizes as the loaded total, so
            // the number lands in a box that already had its height. The old
            // 52px bar was 39px short of the total plus its spendable line.
            <div aria-hidden="true">
              <div className="ws-display text-[clamp(40px,5vw,58px)] leading-none tracking-[-0.02em]">
                <SkeletonLine width="w-44" className="rounded-xl" />
              </div>
              <div className="mt-2.5 text-[15.5px] font-normal">
                <SkeletonLine width="w-52" />
              </div>
            </div>
          ) : errored ? (
            // A failed fetch and a genuinely empty wallet both leave totalUsd
            // at 0 — showing "$0.00" here would read as "your funds are
            // gone." Say so isn't known instead of asserting a wrong number.
            <div className="ws-display text-[28px] leading-none tracking-[-0.02em] text-white/45">
              {t("couldntLoad")}
            </div>
          ) : (
            <div>
              <div
                className="ws-display tnum text-[clamp(40px,5vw,58px)] leading-none tracking-[-0.02em]"
                data-sensitive="balance"
              >
                {formatMasked(totalUsd)}
              </div>
              {/* Shown even at zero, in the selected currency, so an empty
                  spendable balance is stated rather than silently missing. */}
              <div className="tnum mt-2.5 text-[15.5px] font-normal text-white/60">
                {t("readyToSpend", { amount: formatMasked(readyToSpend) })}
              </div>
            </div>
          )}
        </div>
        <div className="flex w-full gap-2 min-[560px]:w-auto">
          <button
            onClick={onOpenFunds}
            className="text-ink flex-1 cursor-pointer rounded-xl bg-white px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap hover:opacity-90 min-[560px]:flex-none"
          >
            {t("addFunds")}
          </button>
          <button
            onClick={onOpenWithdraw}
            disabled={withdrawHeld}
            className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium whitespace-nowrap text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/6 min-[560px]:flex-none"
          >
            {t("withdraw")}
          </button>
        </div>
      </div>

      {depositPending ? (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] font-normal text-white/55">
          <span className="bg-accent h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" />
          {t("depositPending")}
        </div>
      ) : null}

      {/* The ring's space is held while loading. A wallet that turns out to be
          empty gives it back, which is the one case that still moves, and it
          moves once; a funded wallet, the common case, lands without a jump. */}
      {loading || (!errored && tokens.length > 0) ? (
        <div className="mt-[22px]">
          <div className="mb-3.5 flex items-center gap-2 text-[12px] font-normal text-white/45">
            <span className="bg-accent h-1 w-1 rounded-full" />
            {t("breakdownTitle")}
          </div>
          {loading ? <PortfolioDonutSkeleton /> : <PortfolioDonut tokens={tokens} />}
        </div>
      ) : null}
    </div>
  );
}
