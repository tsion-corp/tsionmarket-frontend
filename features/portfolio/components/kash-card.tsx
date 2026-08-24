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

// The designer's Kash+ coin, the same artwork the banner uses.
const COIN = "/kash/kash-plus-coin.png";

interface KashCardProps {
  onBuy: () => void;
  /** Settle accrued points into KSH now. Absent while there is nothing to claim. */
  onClaim?: () => void;
  claiming?: boolean;
  onSend: () => void;
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
  onSend,
  onConvert,
  onHistory,
  onUpgrade,
}: KashCardProps) {
  const t = useTranslations("kash");
  const { data: engineStatus } = useKashStatus();
  // True only while an action's effects are still landing — not on the
  // background poll, which would leave the card permanently pulsing.
  const syncing = useKashSyncing();
  const { data: account } = useKashAccount();
  const { data: subscription } = useKashSubscription();

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
  // line instead of wrapping under the KASH suffix or overflowing the card.
  const balanceTextSize =
    balanceDisplay.length > 12
      ? "text-[22px]"
      : balanceDisplay.length > 9
        ? "text-[26px]"
        : "text-[34px]";
  const balanceUsd = account?.balanceUsd ?? "0";
  const gateMet = account?.gate.met ?? false;
  const shortfall = account?.gate.shortfall ?? "0";
  const progress = account ? gateProgress(account) : 0;
  const hasConvertible = Number(account?.convertible ?? "0") > 0;

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
    <div data-tour="kash" className="ws-card flex h-full flex-col p-5 sm:p-[26px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-normal text-white/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COIN} alt="" className="h-6 w-6" />
          {t("balanceTitle")}
        </div>
        <div className="flex items-center gap-2.5">
          {/* Tiers only cap points rates, so the chip is parked with the
              points surfaces until revenue events feed the engine. */}
          {KASH_POINTS_LIVE && subscription && (
            <button
              onClick={onUpgrade}
              className="cursor-pointer rounded-full border border-amber-200/30 bg-amber-200/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200/90 hover:bg-amber-200/16"
            >
              {t("tierChip", { tier: subscription.tier })}
            </button>
          )}
          {syncing ? (
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-white/45">
              <span className="h-[9px] w-[9px] animate-spin rounded-full border-[1.5px] border-white/25 border-t-white/70" />
              {t("syncing")}
            </span>
          ) : (
            <button
              onClick={onHistory}
              className="cursor-pointer text-[12px] font-medium text-white/45 hover:text-white/70"
            >
              {t("history")}
            </button>
          )}
          <AddToMetaMaskButton />
        </div>
      </div>

      <div className="mt-3">
        <div
          className={`ws-display tnum flex items-end gap-1.5 leading-none tracking-[-0.02em] ${balanceTextSize}`}
        >
          <SyncingValue syncing={syncing}>{balanceDisplay}</SyncingValue>{" "}
          <span className="ml-2 text-[19px] whitespace-nowrap text-amber-200/90">KASH+</span>
          <span className="tnum ml-4 text-[13px] font-normal text-white/50">ESP</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="tnum text-[13px] font-normal text-white/50">${balanceUsd}</span>
          {/* The unit price, so the dollar figure above is checkable rather
              than a second number the user has to trust. */}
          {engineStatus && (
            <span className="tnum text-[11.5px] font-normal text-white/30">
              @ ${engineStatus.price.kashPriceUsd}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={onBuy}
          className="flex-1 cursor-pointer rounded-xl bg-amber-200 px-4 py-2.5 font-sans text-[13px] font-semibold text-amber-950 transition-opacity hover:opacity-90"
        >
          {t("buy")}
        </button>
        <button
          onClick={onSend}
          disabled={!hasConvertible}
          className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium text-white transition-colors hover:border-white/22 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("send")}
        </button>
        <button
          onClick={onConvert}
          disabled={!hasConvertible}
          className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium text-white transition-colors hover:border-white/22 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
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
        <div className="mt-4 border-t border-white/8 pt-3.5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
              {t("weekPointsTitle")}
            </span>
            <span
              className={`text-[11.5px] font-medium ${
                hasClaimable ? "text-amber-200/90" : "text-white/45"
              }`}
            >
              {hasClaimable ? t("pointsReady") : t("pointsEarnAsYouTrade")}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <SyncingValue
                syncing={syncing}
                className={`ws-display tnum text-[28px] leading-none tracking-[-0.02em] ${
                  hasClaimable ? "text-amber-200" : "text-white/35"
                }`}
              >
                {formatKashAmount(unclaimed)}
              </SyncingValue>
              <span
                className={`text-[12.5px] font-normal ${
                  hasClaimable ? "text-amber-200/60" : "text-white/30"
                }`}
              >
                pts
              </span>
              {/* What the points are actually worth, next to the points, so the
                claim button never states a number the card has not shown. */}
              {hasClaimable && claimableKash && (
                <span className="tnum text-[12.5px] font-normal text-white/45">
                  ≈ {claimableKash} KASH
                </span>
              )}
            </div>
            {!gateMet && (
              <span className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/50">
                {t("pointsLocked")}
              </span>
            )}
          </div>

          {/* Claiming converts THIS wallet's points at the current price. */}
          {onClaim && hasClaimable && (
            <button
              onClick={onClaim}
              disabled={claiming}
              className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-xl bg-amber-200 px-4 py-2.5 font-sans text-[13px] font-semibold text-amber-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="mt-3 flex w-full cursor-pointer items-center justify-between border-t border-white/8 pt-2.5 text-[12px] hover:opacity-80"
                >
                  <span className="font-normal text-white/45">{t("claimedSoFar")}</span>
                  <span className="tnum flex items-center gap-1 text-white/70">
                    {claimedKash} KASH
                    <span className="text-white/35">›</span>
                  </span>
                </button>
              )}
              {!hasClaimable && (
                <p className="mt-2.5 text-[11.5px] leading-[1.5] font-normal text-white/40">
                  {t("weekPointsHint")}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mt-3.5 mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
                  {t("gateTitle")}
                </span>
                <span className="tnum text-[11.5px] font-normal text-white/50">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-amber-200/80 transition-[width] duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="mt-2.5 text-[11.5px] leading-[1.5] font-normal text-white/40">
                {t("gateHint", { usd: account?.gate.minHoldingUsd ?? "10", shortfall })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
