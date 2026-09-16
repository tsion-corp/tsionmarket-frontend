"use client";

// import { useState } from "react"; // parked with the Portfolio Allocation toggle below
import { CurrencySelect, useMoney } from "@/components/ui/currency-select";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon, WalletIcon } from "@/components/ui/icons";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";
import { useHoldingsLauncher } from "@/features/portfolio/components/holdings-launcher";

// The mobile balance card, drawn to the wallet comp (node 1:972): a starfield-
// and-cloud card with the currency pill and the coins button up top, the total
// in a rounded gradient figure, and the two money actions on a full-width row. The
// decorative sky is one exported asset — the comp builds it from masked cloud
// and star art that does not reduce to CSS cleanly.
export function BalanceCardMobile({
  totalUsd,
  readyToSpend,
  loading,
  errored,
  refreshing,
  withdrawHeld,
  hidden,
  onToggleHidden,
  formatMasked,
  onOpenFunds,
  onOpenWithdraw,
}: BalanceCardViewProps) {
  const t = useTranslations("balance");
  const tPortfolio = useTranslations("portfolio");
  const money = useMoney();
  // The holdings list behind the coins button, shared with the desktop card.
  const holdings = useHoldingsLauncher();
  // Portfolio Allocation toggle hidden on mobile for now (see the commented
  // button below); its state is parked until it returns.
  // const [allocationOpen, setAllocationOpen] = useState(false);

  // The two money actions, sized to match the Kash card's buttons.
  const action =
    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-[12px] font-sans text-[15px] font-semibold tracking-[-0.15px] whitespace-nowrap transition-opacity";

  return (
    <div
      data-tour="balance"
      className="relative h-full overflow-hidden rounded-[19px] bg-[#0f0f0f]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/wallet/balance-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* h-full + justify-between so the card fills its carousel slide and stands
          exactly as tall as the Kash+ card beside it — otherwise the two cards
          disagree on height and their edges break against each other. */}
      <div className="relative flex h-full flex-col items-center justify-between px-4 pt-9 pb-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CurrencySelect value={money.currency} onSelect={money.setCurrency} />
            {/* What the wallet holds, one tap from the total it adds up to: the
                stacked-coins glyph the comp draws beside the currency pill,
                opening the same holdings list as the desktop card. */}
            <button
              type="button"
              onClick={holdings.openHoldings}
              aria-label={tPortfolio("yourHoldings")}
              title={tPortfolio("yourHoldings")}
              aria-haspopup="dialog"
              aria-expanded={holdings.open}
              className="grid size-[30px] cursor-pointer place-items-center rounded-full border border-white/14 bg-white/5 transition-colors active:bg-white/12"
            >
              {/* A fixed-colour export, so it sits in an explicitly sized box
                  rather than inheriting the button's text colour. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/market/balance-icon-coins.svg"
                alt=""
                width={14}
                height={14}
                className="size-[14px] shrink-0"
              />
            </button>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-0.5">
              <span className="font-serif text-[13px] font-medium tracking-[-0.13px] text-white/60">
                {t("totalBalance")}
              </span>
              <button
                onClick={onToggleHidden}
                aria-label={hidden ? t("showBalance") : t("hideBalance")}
                className="grid size-6 cursor-pointer place-items-center rounded-full text-white/55 transition-colors active:bg-white/8"
              >
                {hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
              </button>
              {refreshing ? (
                <span
                  className="bg-accent size-1.5 animate-pulse rounded-full"
                  title="Refreshing…"
                />
              ) : null}
            </div>

            {loading ? (
              <div className="mt-1 h-[42px] w-36 animate-pulse rounded-xl bg-white/8" />
            ) : errored ? (
              // Zero and a failed read look identical in the total, so name the
              // failure rather than showing a confident $0.00.
              <div className="ws-display text-[22px] leading-none tracking-[-0.02em] text-white/45">
                {t("couldntLoad")}
              </div>
            ) : (
              <>
                <div
                  className="ws-chewy bg-gradient-to-b from-white to-[#c4c4c4] bg-clip-text text-[42px] leading-none tracking-[-0.84px] text-transparent"
                  data-sensitive="balance"
                >
                  {formatMasked(totalUsd)}
                </div>
                <div className="tnum mt-1 text-center text-[11px] font-normal text-white/45">
                  {t("readyToSpend", { amount: formatMasked(readyToSpend) })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-3">
          <div className="mx-auto flex w-full max-w-[300px] items-center gap-2">
            <button
              data-tour="add-funds"
              onClick={onOpenFunds}
              // bg-white is the base the ws-chrome gradient layers over; it also
              // keeps the button visible from md up, where ws-chrome (mobile
              // only) drops out but this card now still renders.
              className={`${action} ws-chrome text-ink bg-white shadow-[0_1.6px_3.3px_rgba(0,0,0,0.5)]`}
            >
              <WalletIcon size={15} />
              {t("addFunds")}
            </button>
            <button
              onClick={onOpenWithdraw}
              disabled={withdrawHeld}
              className={`${action} border-2 border-white bg-white/6 text-white active:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <ArrowUpRightIcon size={15} />
              {t("withdraw")}
            </button>
          </div>

          {/* Portfolio Allocation toggle — hidden on mobile for now, at request.
          <button
            type="button"
            onClick={() => setAllocationOpen((open) => !open)}
            aria-expanded={allocationOpen}
            className="flex cursor-pointer items-center gap-1 px-1.5 text-[#7a7a7a] transition-colors active:text-white/80"
          >
            <span className="size-[3px] shrink-0 rounded-full bg-current" />
            <span className="font-serif text-[10px] font-medium tracking-[-0.075px]">
              {t("portfolioAllocation")}
            </span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className={`size-[14px] shrink-0 transition-transform ${allocationOpen ? "rotate-180" : ""}`}
              fill="none"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          */}
        </div>
      </div>
      {holdings.host}
    </div>
  );
}
