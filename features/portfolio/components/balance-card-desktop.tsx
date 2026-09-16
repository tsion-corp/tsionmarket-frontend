"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CurrencySelect, useMoney } from "@/components/ui/currency-select";
import { Disclosure } from "@/components/ui/disclosure";
import { EyeOffIcon } from "@/components/ui/icons";
import { useHoldingsLauncher } from "@/features/portfolio/components/holdings-launcher";
import { PortfolioDonut } from "@/features/portfolio/components/portfolio-donut";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";

// The balance card as the Market design draws it: a near-black panel carrying
// the designer's cloud and star artwork, with everything stacked down the
// middle — the currency, the total, the two actions, and the allocation
// disclosure. Every glyph is an SVG exported from the design file; the artwork
// is decorative only, so it sits behind the content and is hidden from
// assistive tech.
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
  const tPortfolio = useTranslations("portfolio");
  const money = useMoney();
  // The breakdown is a disclosure here rather than always-on: the design keeps
  // the card to one screenful and puts the ring behind a tap.
  const [showBreakdown, setShowBreakdown] = useState(false);
  const canBreakdown = !loading && !errored && tokens.length > 0;
  // Ties the row to the panel it opens. Generated rather than hardcoded because
  // the portfolio route renders this card in two branches.
  const breakdownPanelId = useId();

  // The holdings list, and the buy/sell stack it hands assets to, shared with
  // the phone card.
  const holdings = useHoldingsLauncher();

  return (
    // The design draws this card 551x370. We run it taller: it carries two rows
    // the artboard does not (ready to spend, and the allocation disclosure), and
    // the board asked for more height again on top of that. The extra room goes
    // into the vertical padding, split in the design's own 61:28 proportion, so
    // the stack itself keeps the spacing the design gave it.
    <div
      data-tour="balance"
      className="relative isolate flex h-full flex-col overflow-hidden rounded-[18px] bg-[#0f0f0f] px-7 pt-[80px] pb-[37px]"
    >
      {/* Decorative only. The star field is exported at the card's own 551x370
          frame and stretches with it, which keeps every star the design drew
          and costs nothing: the dots are about a pixel across, so the stretch
          does not read. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[url('/market/balance-stars.svg')] bg-[length:100%_100%] bg-no-repeat"
      />
      {/* The clouds bank along the foot of the card at any width. The export is
          the band on its own and reaches past both sides of the design's 551px
          artboard, so covering it scales the clouds by about a twentieth at the
          width this actually ships at, rather than stretching them by half. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[84px] bg-[url('/market/balance-clouds.svg')] bg-cover bg-bottom bg-no-repeat"
      />

      {/* Grows into whatever height the row settles on. The two cards are grid
          siblings and stretch to the taller one, so at a narrow desktop width,
          where a long translation wraps the Kash card's action row, the spare
          height lands around this stack rather than as a bare strip under it. */}
      <div className="flex grow flex-col items-center justify-center">
        <div className="flex items-center gap-[7.65px]">
          <CurrencySelect value={money.currency} onSelect={money.setCurrency} size="lg" />
          {/* What the wallet holds, one tap from the total it adds up to. The
              stacked-coins glyph belongs beside the money, not in the chrome;
              the walkthrough's help mark took its place in the topbar. */}
          <button
            type="button"
            onClick={holdings.openHoldings}
            aria-label={tPortfolio("yourHoldings")}
            title={tPortfolio("yourHoldings")}
            aria-haspopup="dialog"
            aria-expanded={holdings.open}
            className="ws-pressable grid size-[45.87px] shrink-0 cursor-pointer place-items-center rounded-full border-[1.21px] border-white/14 bg-white/5 transition-colors hover:bg-white/10"
          >
            {/* A fixed-colour export, so it sits in an explicitly sized box
                rather than inheriting the button's text colour. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/market/balance-icon-coins.svg"
              alt=""
              width={21}
              height={21}
              className="size-[20.65px] shrink-0"
            />
          </button>
        </div>

        {/* The label and its toggle keep a gap and side room of their own, so
            the longest translation of "Total balance" never runs up against
            the eye or the card's edge. leading-[1.3] rather than the design's
            1.1 for the same reason: a label that has to take a second line
            needs the room before it wraps, not after. */}
        <div className="mt-[13.8px] flex max-w-full items-center justify-center gap-[6px] px-2">
          <span className="min-w-0 font-serif text-[20px] leading-[1.3] font-medium tracking-[-0.2px] text-white/60">
            {t("totalBalance")}
          </span>
          <button
            onClick={onToggleHidden}
            aria-label={hidden ? t("showBalance") : t("hideBalance")}
            className="ws-pressable grid size-[36.69px] shrink-0 cursor-pointer place-items-center rounded-full"
          >
            {hidden ? (
              // The design has no struck-through eye, only the open one, so the
              // hidden state falls back to the app's own icon at the same size
              // and ink as the export beside it.
              <EyeOffIcon size={22.93} className="text-white/45" />
            ) : (
              <span className="block size-[22.93px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/market/balance-icon-eye.svg" alt="" className="size-full" />
              </span>
            )}
          </button>
          {refreshing ? (
            <span className="bg-accent size-1.5 animate-pulse rounded-full" title="Refreshing…" />
          ) : null}
        </div>

        {loading ? (
          <div className="mt-1 h-[64px] w-56 animate-pulse rounded-xl bg-white/8" />
        ) : errored ? (
          // A failed fetch and a genuinely empty wallet both leave totalUsd at
          // 0 — showing "$0.00" here would read as "your funds are gone". Say
          // it isn't known instead of asserting a wrong number.
          <div className="ws-display mt-1 max-w-full px-3 text-center text-[clamp(22px,2.2vw,32px)] leading-[1.25] tracking-[-0.02em] text-balance text-white/45">
            {t("couldntLoad")}
          </div>
        ) : (
          <>
            {/* The figure takes the stack's full width and centres itself, so
                a long currency (naira at a six-figure total) has the card's
                own side padding as clearance instead of ending flush. The
                clamp floor drops to 34px for the same reason: at the narrow
                desktop column 40px was wider than the card. */}
            <div
              className="ws-poster ws-balance-ink tnum w-full px-2 text-center text-[clamp(34px,4.6vw,64px)] leading-[1.08] tracking-[-0.02em] break-words"
              data-sensitive="balance"
            >
              {formatMasked(totalUsd)}
            </div>
            {/* What a purchase can actually draw on. Shown even at zero, in the
                selected currency, so an empty spendable balance is stated
                rather than silently missing. The side padding and the looser
                leading are for the long locales: "disponible para gastar" runs
                to a second line on a narrow column and needs room around it. */}
            <div className="tnum mt-2 max-w-full px-3 text-center text-[13px] leading-[1.45] font-normal text-white/45">
              {t("readyToSpend", { amount: formatMasked(readyToSpend) })}
            </div>
          </>
        )}

        {/* The design draws this row 381px wide with the labels centred and no
            padding of their own, which only works because "Add funds" is
            short. The pills carry 24px of their own side padding now, and the
            row is allowed the extra width the longest locale needs, so a
            French or Portuguese label sits inside the pill rather than filling
            it edge to edge. Past that the row wraps and each pill takes a line,
            which is still better than two crushed ones. */}
        <div className="mt-[16px] flex w-full max-w-[452px] flex-wrap items-stretch justify-center gap-[12.23px]">
          <button
            data-tour="add-funds"
            onClick={onOpenFunds}
            className="ws-pressable ws-chrome-pill text-ink flex grow basis-[191px] cursor-pointer items-center justify-center gap-[12.23px] px-[24px] py-[19.88px] font-serif text-[21px] leading-[1.1] font-semibold tracking-[-0.21px] whitespace-nowrap"
          >
            <span className="block size-[26.49px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/market/balance-icon-add-funds.svg" alt="" className="size-full" />
            </span>
            {t("addFunds")}
          </button>
          <button
            onClick={onOpenWithdraw}
            disabled={withdrawHeld}
            className="ws-pressable flex grow basis-[177px] cursor-pointer items-center justify-center gap-[8px] rounded-full border-[1.53px] border-white bg-white/6 px-[24px] py-[19.88px] font-serif text-[21px] leading-[1.1] font-semibold tracking-[-0.21px] whitespace-nowrap text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="block size-[26.49px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/market/balance-icon-withdraw.svg" alt="" className="size-full" />
            </span>
            {t("withdraw")}
          </button>
        </div>

        {depositPending ? (
          <div className="mt-3 flex max-w-[420px] items-start gap-2 px-2 text-[12.5px] leading-[1.5] font-normal text-white/55">
            <span className="bg-accent mt-1.5 size-1.5 shrink-0 animate-pulse rounded-full" />
            {t("depositPending")}
          </div>
        ) : null}

        {/* The allocation ring, folded away. With nothing held there is nothing
            to disclose, so the row is not drawn at all rather than opening on
            an empty chart. */}
        {canBreakdown ? (
          <>
            <button
              onClick={() => setShowBreakdown((open) => !open)}
              aria-expanded={showBreakdown}
              aria-controls={breakdownPanelId}
              className="ws-pressable mt-[12px] flex max-w-full cursor-pointer items-center justify-center gap-[8px] rounded-full px-[16px] py-[7px] text-center font-serif text-[15px] leading-[1.35] font-medium tracking-[-0.075px] text-[#7a7a7a]"
            >
              <span className="block size-[4.59px] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/market/balance-icon-dot.svg" alt="" className="size-full" />
              </span>
              {t("portfolioAllocation")}
              <span
                className={`grid size-[21.4px] shrink-0 place-items-center transition-transform duration-150 ${
                  showBreakdown ? "rotate-180" : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/market/balance-icon-chevron-down.svg"
                  alt=""
                  aria-hidden
                  className="h-[6.5px] w-[12.04px]"
                />
              </span>
            </button>
            {/* Two boxes around the ring, both earning their place.
                Outside: the Disclosure's own box is a flex item in an
                items-center column, so left to size itself it would shrink to
                the ring's width and the legend beside it would lose the room it
                stretches into.
                Inside: the 16px gap has to be a margin on the ring, not on the
                panel. A margin on the panel counts towards the collapsed track,
                which measured 16px tall while shut and left dead space under
                the row; inside the clip it is hidden with everything else. */}
            <div className="w-full">
              <Disclosure open={showBreakdown} id={breakdownPanelId}>
                <div className="mt-4">
                  <PortfolioDonut tokens={tokens} />
                </div>
              </Disclosure>
            </div>
          </>
        ) : null}
      </div>

      {holdings.host}
    </div>
  );
}
