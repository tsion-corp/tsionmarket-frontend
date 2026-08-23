"use client";

import { useTranslations } from "next-intl";
import { PortfolioDonut } from "@/features/portfolio/components/portfolio-donut";
import { CurrencySelect, useMoney } from "@/components/ui/currency-select";
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon, WalletIcon } from "@/components/ui/icons";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";

// The balance card as the mobile design draws it: label and currency on one
// row, the total stacked under it, the two money actions side by side on their
// own full-width row, then the breakdown ring — which the phone shows even at
// zero, so a new account can see where money will appear.
export function BalanceCardMobile({
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

  const action =
    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-3.5 font-sans text-[14px] font-semibold whitespace-nowrap transition-opacity";

  return (
    <div className="rounded-[20px] border border-white/12 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[13px] font-normal text-white/60">
          {t("totalBalance")}
          <button
            onClick={onToggleHidden}
            aria-label={hidden ? t("showBalance") : t("hideBalance")}
            className="grid size-6 cursor-pointer place-items-center rounded-full text-white/45 transition-colors active:bg-white/8"
          >
            {hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
          </button>
          {refreshing ? (
            <span className="bg-accent size-1.5 animate-pulse rounded-full" title="Refreshing…" />
          ) : null}
        </div>
        <CurrencySelect value={money.currency} onSelect={money.setCurrency} />
      </div>

      {loading ? (
        <div className="mt-3 h-[44px] w-40 animate-pulse rounded-xl bg-white/8" />
      ) : errored ? (
        // Zero and "we could not read it" look identical in the total, so the
        // phone says which one this is rather than showing a confident $0.00.
        <div className="ws-display mt-3 text-[24px] leading-none tracking-[-0.02em] text-white/45">
          {t("couldntLoad")}
        </div>
      ) : (
        <>
          <div className="ws-display tnum mt-2.5 text-[42px] leading-none tracking-[-0.02em]">
            {formatMasked(totalUsd)}
          </div>
          <div className="tnum mt-2 text-[13.5px] font-normal text-white/55">
            {t("readyToSpend", { amount: formatMasked(readyToSpend) })}
          </div>
        </>
      )}

      <div className="mt-4 flex gap-2.5">
        {/* The design paints Withdraw as the bright pill, but this screen exists
            to get money in, so the emphasis follows the action rather than the
            mockup: Add funds carries the chrome. */}
        <button onClick={onOpenFunds} className={`${action} ws-chrome text-ink bg-white`}>
          <WalletIcon size={17} />
          {t("addFunds")}
        </button>
        <button
          onClick={onOpenWithdraw}
          disabled={withdrawHeld}
          className={`${action} border border-white/14 bg-white/6 text-white active:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ArrowUpRightIcon size={17} />
          {t("withdraw")}
        </button>
      </div>

      {depositPending ? (
        <div className="mt-3 flex items-start gap-2 text-[12px] leading-[1.45] font-normal text-white/55">
          <span className="bg-accent mt-1.5 size-1.5 shrink-0 animate-pulse rounded-full" />
          {t("depositPending")}
        </div>
      ) : null}

      {!loading && !errored ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-normal text-white/45">
            <span className="bg-accent size-1 rounded-full" />
            {t("breakdownTitle")}
          </div>
          <PortfolioDonut tokens={tokens} />
        </div>
      ) : null}
    </div>
  );
}
