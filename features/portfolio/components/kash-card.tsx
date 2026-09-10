"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { SyncingValue } from "@/components/ui/syncing-value";
import { AddToMetaMaskButton } from "@/features/portfolio/components/add-to-metamask-button";
import { useKashSyncing } from "@/features/portfolio/hooks/use-kash-sync";
import {
  useKashAccount,
  useKashStatus,
  useKashSubscription,
} from "@/features/portfolio/hooks/use-kash";
import { formatKashAmount, gateProgress, pointsToKash } from "@/features/portfolio/lib/kash";
import { KASH_POINTS_LIVE } from "@/features/portfolio/lib/kash-launch";
import { setProfile } from "@/lib/analytics/mixpanel";

// The design's Kash+ coin. A bitmap in Figma too, so it stays one.
const COIN = "/market/kash-coin.png";

// A button glyph, sized to the 20.45px slot the design gives it and flipped
// where the design reuses one arrow for both directions.
function ButtonIcon({ src, flip }: { src: string; flip?: "vertical" | "both" }) {
  const transform =
    flip === "both" ? "-scale-y-100 rotate-180" : flip === "vertical" ? "rotate-180" : "";
  return (
    <span className={`block size-[20.45px] shrink-0 ${transform}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full" />
    </span>
  );
}

interface KashCardProps {
  onBuy: () => void;
  /** Settle accrued points into KSH now. Absent while there is nothing to claim. */
  onClaim?: () => void;
  claiming?: boolean;
  onConvert: () => void;
  onHistory: () => void;
  onUpgrade: () => void;
}

// The Kash balance card, fed by the rewards engine. The model is points-first:
// activity earns points live (like XP) and they convert to KSH once a week at
// settlement, so the card keeps the two numbers visibly separate — spendable
// KSH on top, claimable points below. Below the holding
// gate it shows progress toward it, since "75% there" invites the next buy in
// a way a bare lock never does.
export function KashCard({
  onBuy,
  onClaim,
  claiming,
  onConvert,
  onHistory,
  onUpgrade,
}: KashCardProps) {
  const t = useTranslations("kash");
  const { data: engineStatus } = useKashStatus();
  // True only while an action's effects are still landing — not on the
  // background poll, which would leave the card permanently pulsing.
  const syncing = useKashSyncing();
  const { data: account, isError, walletMissing } = useKashAccount();
  const { data: subscription } = useKashSubscription();

  // An unknown balance must never render as zero: someone who holds KASH would
  // read that as their money gone, and once the "0" fallback is applied the two
  // states are indistinguishable. Say which one this is instead.
  const unavailable = !account && (isError || walletMissing);
  const loading = !account && !unavailable;

  const balance = account?.balance ?? "0";

  // The engine holds the authoritative Kash figures, so the profile mirrors
  // them rather than accumulating its own totals from events. Runs whenever the
  // card has fresh data; re-setting the same values is cheap and idempotent.
  useEffect(() => {
    if (!account) return;
    setProfile({
      kash_balance: Number(account.balance),
      lifetime_kash_earned: Number(account.lifetimeEarned),
      kash_active: Number(account.balance) > 0 || Number(account.lifetimeEarned) > 0,
    });
  }, [account]);
  const balanceDisplay = formatKashAmount(balance);
  // Step the type down as the number grows so a six-figure balance stays on one
  // line instead of wrapping under the KASH suffix or overflowing the card. Each
  // step is a clamp rather than a fixed size: this card is the narrow half of
  // the dashboard row, and at a 1024px window the design's 60px was wider than
  // the card whatever the digit count. The ceilings are the design's sizes, so
  // nothing changes at the width the artboard was drawn for.
  const balanceTextSize =
    balanceDisplay.length > 12
      ? "text-[clamp(20px,2.05vw,34px)]"
      : balanceDisplay.length > 9
        ? "text-[clamp(22px,2.35vw,44px)]"
        : "text-[clamp(28px,3.15vw,60px)]";
  const balanceUsd = account?.balanceUsd ?? "0";
  const gateMet = account?.gate.met ?? false;
  const shortfall = account?.gate.shortfall ?? "0";
  const progress = account ? gateProgress(account) : 0;

  // Claimable, not cumulative — see KashAccount.week.
  const unclaimed = account?.week.unclaimed ?? "0";
  // What the claim actually pays out. Falls back to the points figure only if
  // the price is unavailable — never renders an empty or NaN amount.
  const hasClaimable = Number(unclaimed) > 0;
  const claimableKash = pointsToKash(
    unclaimed,
    engineStatus?.points.pointValueUsd,
    engineStatus?.price.kashPriceUsd
  );
  // Total KSH already claimed, summarised here and itemised in history.
  const claimedKash = account?.settlements.length
    ? formatKashAmount(
        String(account.settlements.reduce((total, row) => total + Number(row.kash || 0), 0))
      )
    : null;

  return (
    <div
      data-tour="kash"
      data-sensitive="balance"
      className="relative isolate flex h-full flex-col overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,#FEE685_0%,#FFD425_100%)] p-5 text-black sm:px-[24px] sm:pt-[56px] sm:pb-[48px]"
    >
      {/* Decorative only: the designer's two passes of sparkles over the head
          of the card, her cloud bank along its foot. Each export is already
          cropped to the part of the card it covers, so the sizes below are that
          crop as a share of the design's 457x367 box. Percentages rather than
          pixels because the dashboard renders this card wider than the artboard
          and the artwork has to grow with it, not sit as an island in a corner.
          The gradient underneath is the card's own background, so it reaches
          every edge whatever the artwork does. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -z-10 h-[56.95%] w-[71.55%] bg-[url('/market/kash-stars.svg')] bg-[length:100%_100%] bg-no-repeat"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -z-10 h-[59.4%] w-[74.4%] bg-[url('/market/kash-stars-overlay.svg')] bg-[length:100%_100%] bg-no-repeat"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[91.01%] bg-[url('/market/kash-clouds.svg')] bg-cover bg-bottom bg-no-repeat"
      />

      {/* The header wraps rather than truncates. "Kash+ Guthaben" opposite
          "Verlauf" and the MetaMask pill does not fit a narrow desktop column,
          and an ellipsis through the card's own title is worse than dropping
          the right-hand cluster onto its own line. The 140px floor is what
          decides which of the two happens: while the title can hold its
          longest word on one line beside History and the fox, it takes a
          second line and the row keeps its height; below that the cluster
          drops instead. The design's 19.18px indent is kept only from 2xl up,
          which is the first width where this column is as wide as the 457px
          artboard the indent was drawn on. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 2xl:ml-[19.18px]">
        <div className="flex min-w-[140px] flex-1 items-center gap-[9.53px] font-serif text-[19px] leading-[1.35] font-medium tracking-[-0.152px] text-black">
          <span className="grid size-[37.8px] shrink-0 place-items-center rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COIN} alt="" className="size-[32.68px] rounded-full object-cover" />
          </span>
          <span>{t("balanceTitle")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Tiers only cap points rates, so the chip is parked with the
              points surfaces until revenue events feed the engine. */}
          {KASH_POINTS_LIVE && subscription && (
            <button
              onClick={onUpgrade}
              className="ws-pressable cursor-pointer rounded-full border border-black/20 bg-black/8 px-3 py-1 text-[11px] leading-[1.35] font-medium whitespace-nowrap text-black/70"
            >
              {t("tierChip", { tier: subscription.tier })}
            </button>
          )}
          {/* The design butts the MetaMask pill straight up against the
              "History" label. The word carries its own padding now, so
              "Historique" has room on both sides instead of touching the fox
              on one and the title on the other, and the two controls still
              read as one cluster. */}
          <div className="flex items-center">
            {syncing ? (
              <span className="flex items-center gap-1.5 px-[10px] py-[5px] text-[12px] leading-[1.3] font-medium whitespace-nowrap text-black/50">
                <span className="h-[9px] w-[9px] animate-spin rounded-full border-[1.5px] border-black/20 border-t-black/60" />
                {t("syncing")}
              </span>
            ) : (
              <button
                onClick={onHistory}
                className="ws-pressable cursor-pointer rounded-full px-[10px] py-[5px] font-sans text-[19px] leading-[1.3] font-normal whitespace-nowrap text-black"
              >
                {t("history")}
              </button>
            )}
            <AddToMetaMaskButton />
          </div>
        </div>
      </div>

      {/* The holding, centred, the way the design stacks this card. It grows
          into the height the row settles on: this card and the balance card are
          grid siblings and stretch to the taller of the two, so the spare
          height belongs around the holding rather than as a bare band under the
          action row. */}
      <div className="mt-[22.5px] flex grow flex-col items-center justify-center">
        {/* Side padding and a wrap, so the ticker drops below a very long
            holding instead of the pair running into the card's edges. */}
        {loading ? (
          // Reading in flight: hold the figure's space with a skeleton rather
          // than printing a zero the read has not confirmed.
          <>
            <div className="h-[42px] w-44 animate-pulse rounded-xl bg-black/8" />
            <div className="mt-2 h-[16px] w-24 animate-pulse rounded bg-black/6" />
          </>
        ) : unavailable ? (
          // No wallet yet, or the read failed: name the state instead of a "0"
          // that reads as "your Kash is gone".
          <p className="max-w-full px-4 text-center font-serif text-[15px] leading-[1.5] font-medium text-black/55">
            {walletMissing ? t("balanceNoWallet") : t("balanceUnavailable")}
          </p>
        ) : (
          <>
            <div
              className={`tnum flex max-w-full flex-wrap items-baseline justify-center gap-x-2 gap-y-1 px-2 py-[16.63px] font-serif leading-[1.1] font-bold tracking-[-0.05em] ${balanceTextSize}`}
            >
              <SyncingValue syncing={syncing}>{balanceDisplay}</SyncingValue>
              <span className="whitespace-nowrap">KASH +</span>
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-center gap-[6.05px] px-2 font-serif text-[16px] leading-[21.93px] font-medium tracking-[-0.08px] text-black/80">
              {/* The unit price, so the holding above is checkable rather than a
                  number the user has to trust. */}
              {engineStatus ? (
                <>
                  <span className="tnum">1 KASH</span>
                  <span className="block size-[24.19px] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/market/kash-icon-approx-equals.svg" alt="≈" className="size-full" />
                  </span>
                  <span className="tnum">${engineStatus.price.kashPriceUsd}</span>
                </>
              ) : null}
            </div>
            {/* What the holding itself is worth. Dropped at zero, where the
                design shows nothing and the figure would only repeat the
                balance. */}
            {Number(balance) > 0 ? (
              <div className="tnum mt-1 max-w-full px-2 text-center text-[13px] leading-[1.4] font-medium text-black/55">
                ${balanceUsd}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* The design runs the card's actions the full width, so they share the
          row in its proportions instead of sitting as a cluster in the middle
          of a card that is wider than the artboard.

          Each pill carries 22px of side padding and holds its label on one
          line. Because a flex item never shrinks below its own content, that
          padding is a floor rather than slack: "Umwandeln" keeps the same room
          around it that "Convert" gets, and when the padded pills no longer fit
          the row wraps instead of squeezing them. min-h rather than h so a
          wrapped row still cannot clip a label. */}
      <div className="mt-[24px] flex flex-wrap gap-[10.23px] sm:ml-[2.18px]">
        {/* Send is off the card for now. The modal and its wiring stay; only
            the door is gone, so restoring it is this one pill. */}
        <button
          onClick={onBuy}
          className="ws-pressable flex min-h-[52.41px] flex-1 basis-[121.73px] cursor-pointer items-center justify-center gap-[6px] rounded-full border-[1.92px] border-[#FFD52D] bg-white px-[22px] py-[13px] font-serif text-[16px] leading-[24.92px] font-medium whitespace-nowrap text-black"
        >
          <ButtonIcon src="/market/kash-icon-arrow-buy.svg" flip="both" />
          {t("buy")}
        </button>
        <button
          onClick={onConvert}
          className="ws-pressable flex min-h-[52.41px] flex-1 basis-[147.09px] cursor-pointer items-center justify-center gap-[10.23px] rounded-full border-[1.28px] border-white/14 bg-black px-[22px] py-[13px] font-serif text-[16px] leading-[24.92px] font-medium whitespace-nowrap text-white"
        >
          <ButtonIcon src="/market/kash-icon-convert.svg" />
          {t("convert")}
        </button>
      </div>

      {/* Points section — parked until revenue events feed the engine: a
          counter that can only ever show zero reads as broken, not upcoming.
          Everything inside stays wired; KASH_POINTS_LIVE is the one switch.
          The headline is what the user can CLAIM, not a lifetime total: a
          cumulative counter that never falls made a claimed balance look
          unclaimed, and the number stopped meaning anything actionable.
          Everything already converted lives in history. */}
      {KASH_POINTS_LIVE && (
        <div className="mt-4 border-t border-black/10 pt-3.5">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[11px] font-normal tracking-[0.05em] text-black/45 uppercase">
              {t("weekPointsTitle")}
            </span>
            <span
              className={`text-[11.5px] font-medium ${
                hasClaimable ? "text-black/75" : "text-black/50"
              }`}
            >
              {hasClaimable ? t("pointsReady") : t("pointsEarnAsYouTrade")}
            </span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <SyncingValue
                syncing={syncing}
                className={`ws-display tnum text-[28px] leading-none tracking-[-0.02em] ${
                  hasClaimable ? "text-black" : "text-black/40"
                }`}
              >
                {formatKashAmount(unclaimed)}
              </SyncingValue>
              <span
                className={`text-[12.5px] font-normal ${
                  hasClaimable ? "text-black/50" : "text-black/35"
                }`}
              >
                pts
              </span>
              {/* What the points are actually worth, next to the points, so the
                claim button never states a number the card has not shown. */}
              {hasClaimable && claimableKash && (
                <span className="tnum text-[12.5px] font-normal text-black/50">
                  ≈ {claimableKash} KASH
                </span>
              )}
            </div>
            {!gateMet && (
              <span className="rounded-full border border-black/15 bg-black/6 px-2.5 py-1 text-[10.5px] leading-[1.35] font-medium whitespace-nowrap text-black/50">
                {t("pointsLocked")}
              </span>
            )}
          </div>

          {/* Claiming converts THIS wallet's points at the current price. */}
          {onClaim && hasClaimable && (
            <button
              onClick={onClaim}
              disabled={claiming}
              className="ws-pressable mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-center font-sans text-[13px] leading-[1.4] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {claiming ? (
                <>
                  <ButtonSpinner />
                  {t("claimingPoints")}
                </>
              ) : (
                t("claimPoints", { kash: claimableKash ?? formatKashAmount(unclaimed) })
              )}
            </button>
          )}

          {gateMet ? (
            <>
              {/* Everything already converted, summarised — the detail is in
                history rather than stacked onto the live number. */}
              {claimedKash !== null && (
                <button
                  onClick={onHistory}
                  className="ws-pressable mt-3 flex w-full cursor-pointer items-center justify-between gap-3 border-t border-black/10 pt-3 text-[12px] leading-[1.4]"
                >
                  <span className="font-normal text-black/50">{t("claimedSoFar")}</span>
                  <span className="tnum flex items-center gap-1 text-black/70">
                    {claimedKash} KASH
                    <span className="text-black/40">›</span>
                  </span>
                </button>
              )}
              {!hasClaimable && (
                <p className="mt-2.5 text-[11.5px] leading-[1.5] font-normal text-black/45">
                  {t("weekPointsHint")}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mt-3.5 mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] font-normal tracking-[0.05em] text-black/45 uppercase">
                  {t("gateTitle")}
                </span>
                <span className="tnum text-[11.5px] font-normal text-black/50">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-black/70 transition-[width] duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="mt-2.5 text-[11.5px] leading-[1.5] font-normal text-black/45">
                {t("gateHint", { usd: account?.gate.minHoldingUsd ?? "10", shortfall })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
