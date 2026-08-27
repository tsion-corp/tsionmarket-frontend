"use client";

import { useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { MoneyTicker } from "@/components/ui/money-ticker";
import { SyncingValue } from "@/components/ui/syncing-value";
import { AddToMetaMaskButton } from "@/features/portfolio/components/add-to-metamask-button";
import { useKashSyncing } from "@/hooks/use-kash-sync";
import {
  useKashAccount,
  useKashClaim,
  useKashStatus,
  useKashSubscription,
} from "@/features/portfolio/hooks/use-kash";
import { formatKashAmount, gateProgress } from "@/features/portfolio/lib/kash";
import { KASH_POINTS_LIVE } from "@/features/portfolio/lib/kash-launch";
import { setProfile } from "@/lib/analytics/mixpanel";
import { toast } from "@/lib/toast";
import { friendlyError } from "@/lib/errors";

// The designer's Kash+ coin, the same artwork the banner uses.
const COIN = "/kash/kash-plus-coin.png";

interface KashCardProps {
  onBuy: () => void;
  onSend: () => void;
  onConvert: () => void;
  onHistory: () => void;
  onUpgrade: () => void;
}

// The Kash balance card, fed by the rewards engine. The model is points-first:
// activity earns points live (like XP), tallied over the period. There is no
// live per-point price peg and no on-demand claim — the team allocates KASH
// for the period and distributes it as each wallet's fair share of the total
// points earned, off-app. The card just shows the running total and, below
// the holding gate, progress toward it — "75% there" invites the next buy in
// a way a bare lock never does.
export function KashCard({ onBuy, onSend, onConvert, onHistory, onUpgrade }: KashCardProps) {
  const t = useTranslations("kash");
  const { data: engineStatus } = useKashStatus();
  // True only while an action's effects are still landing — not on the
  // background poll, which would leave the card permanently pulsing.
  const syncing = useKashSyncing();
  const { data: account, wallet } = useKashAccount();
  const { data: subscription } = useKashSubscription();
  const claimMutation = useKashClaim();

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

  // This period's running total, not a lifetime total — see KashAccount.week.
  const unclaimed = account?.week.unclaimed ?? "0";

  // A soft glow the moment points actually go up — trading just earned
  // something, and the number climbing on its own is the whole point of
  // wiring the engine into every trade surface in real time. Never fires on
  // the initial load (nothing to compare against yet) or on a decrease (the
  // period's own distribution resets the figure to zero, which isn't a "gain").
  const [pointsGlow, setPointsGlow] = useState(false);
  const prevUnclaimedRef = useRef<number | null>(null);
  useEffect(() => {
    const next = Number(unclaimed);
    const prev = prevUnclaimedRef.current;
    prevUnclaimedRef.current = next;
    if (prev == null || !Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) return;
    setPointsGlow(true);
    const timer = setTimeout(() => setPointsGlow(false), 1200);
    return () => clearTimeout(timer);
  }, [unclaimed]);

  const hasPoints = Number(unclaimed) > 0;

  // Raw (unformatted) KASH equivalent of this period's unclaimed points, at
  // the engine's own point value and current price — the same math the
  // engine itself uses to price a claim. Below KASH_MIN_CLAIM_KASH the claim
  // would mint for less than the gas costs, so the engine skips it; the
  // button mirrors that floor here rather than letting a doomed claim through.
  const kashPriceUsd = Number(engineStatus?.price.kashPriceUsd);
  const pointValueUsd = engineStatus?.points.pointValueUsd;
  const unclaimedKashRaw =
    pointValueUsd && Number.isFinite(kashPriceUsd) && kashPriceUsd > 0
      ? (Number(unclaimed) * pointValueUsd) / kashPriceUsd
      : 0;
  const minClaimKash = Number(engineStatus?.settlement.minClaimKash ?? "0");
  const canClaim = unclaimedKashRaw > 0 && unclaimedKashRaw >= minClaimKash;

  const handleClaim = async () => {
    if (!wallet || claimMutation.isPending) return;
    try {
      const result = await claimMutation.mutateAsync({ wallet });
      if (result.skipped === "below_minimum") return; // button is gated; a race, not an error
      toast.success(t("pointsClaimSuccess", { kash: formatKashAmount(result.kashMinted) }));
    } catch (error) {
      toast.error(friendlyError(error, t("pointsClaimFailed")));
    }
  };

  // Total KSH already received, summarised here and itemised in history.
  const claimedKash = account?.settlements.length
    ? formatKashAmount(
        String(account.settlements.reduce((total, row) => total + Number(row.kash || 0), 0))
      )
    : null;

  return (
    <div
      data-tour="kash"
      data-sensitive="balance"
      className="ws-card relative flex h-full flex-col overflow-hidden p-5 sm:p-[26px]"
    >
      {/* Ambient glow anchored to the balance — a premium touch, not a focal point. */}
      <div className="pointer-events-none absolute -top-16 -right-14 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-normal text-white/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COIN} alt="" className="h-6 w-6 drop-shadow-[0_0_10px_rgba(252,211,77,0.3)]" />
          {t("balanceTitle")}
        </div>
        <div className="flex items-center gap-2.5">
          {/* Tiers only cap points rates, so the chip is parked with the
              points surfaces until revenue events feed the engine. */}
          {KASH_POINTS_LIVE && subscription && (
            <button
              onClick={onUpgrade}
              className="cursor-pointer rounded-full border border-amber-200/30 bg-amber-200/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200/90 transition-colors hover:bg-amber-200/16"
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
              className="cursor-pointer text-[12px] font-medium text-white/45 transition-colors hover:text-white/70"
            >
              {t("history")}
            </button>
          )}
          <AddToMetaMaskButton />
        </div>
      </div>

      <div className="relative mt-3">
        <div
          className={`ws-display tnum flex items-end gap-1.5 leading-none tracking-[-0.02em] ${balanceTextSize}`}
        >
          <SyncingValue syncing={syncing}>
            <MoneyTicker value={Number(balance) || 0} format={(n) => formatKashAmount(String(n))} />
          </SyncingValue>{" "}
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

      <div className="relative mt-5 flex gap-2">
        <button
          onClick={onBuy}
          className="flex-1 cursor-pointer rounded-xl bg-gradient-to-b from-amber-200 to-amber-300 px-4 py-2.5 font-sans text-[13px] font-semibold text-amber-950 shadow-[0_4px_18px_rgba(252,211,77,0.25)] transition-all hover:shadow-[0_4px_22px_rgba(252,211,77,0.4)] hover:brightness-105 active:scale-[0.98]"
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

      {/* Points panel — gated by KASH_POINTS_LIVE until revenue events
          actually feed the engine (now wired: apps/trade and apps/perp both
          publish platform.revenue.recorded on every fee-bearing trade).
          The headline is what this period has earned, not a lifetime total: a
          cumulative counter that never falls would keep reading as unclaimed
          after a distribution reset it. Everything already distributed lives
          in history. Styled as a distinct panel, not a plain section, so
          "points" reads as visibly different from the real KASH+ balance
          above — the disclaimer below reinforces the same distinction in
          words. */}
      {KASH_POINTS_LIVE && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-amber-200/12 bg-gradient-to-br from-amber-300/[0.07] via-white/[0.02] to-transparent p-3.5">
          <div className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="relative mb-2.5 flex items-baseline justify-between">
            <span className="text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
              {t("weekPointsTitle")}
            </span>
            <span
              className={`text-[11.5px] font-medium ${
                hasPoints ? "text-amber-200/90" : "text-white/45"
              }`}
            >
              {t("pointsEarnHint")}
            </span>
          </div>

          <div className="relative flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <motion.span
                animate={
                  pointsGlow
                    ? {
                        scale: [1, 1.06, 1],
                        filter: [
                          "drop-shadow(0 0 0px rgba(252,211,77,0))",
                          "drop-shadow(0 0 14px rgba(252,211,77,0.65))",
                          "drop-shadow(0 0 0px rgba(252,211,77,0))",
                        ],
                      }
                    : { scale: 1, filter: "drop-shadow(0 0 0px rgba(252,211,77,0))" }
                }
                transition={{ duration: 1.1, ease: "easeOut" }}
                className="inline-flex items-baseline"
              >
                <SyncingValue
                  syncing={syncing}
                  className={`ws-display tnum text-[28px] leading-none tracking-[-0.02em] ${
                    hasPoints ? "text-amber-200" : "text-white/35"
                  }`}
                >
                  <MoneyTicker
                    value={Number(unclaimed) || 0}
                    format={(n) => formatKashAmount(String(n))}
                  />
                </SyncingValue>
              </motion.span>
              <span
                className={`text-[12.5px] font-normal ${
                  hasPoints ? "text-amber-200/60" : "text-white/30"
                }`}
              >
                pts
              </span>
            </div>

            {/* Only once there is something to claim — a wallet with zero
                points has nothing to act on yet, see gateMet below instead. */}
            {hasPoints && (
              <button
                onClick={handleClaim}
                disabled={!canClaim || claimMutation.isPending}
                className="mb-0.5 flex shrink-0 cursor-pointer items-center rounded-lg bg-amber-200 px-3 py-1.5 font-sans text-[12px] font-semibold text-amber-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
              >
                {claimMutation.isPending ? (
                  <>
                    <ButtonSpinner />
                    {t("pointsClaiming")}
                  </>
                ) : (
                  t("pointsClaim")
                )}
              </button>
            )}
          </div>

          {/* Always visible: points are a claim on a monthly payout, not KASH
              itself — this must not depend on whether any have been earned
              yet, or a wallet that hasn't earned would never see it. */}
          <p className="relative mt-2 text-[11px] leading-[1.5] font-normal text-white/35">
            {t("pointsDisclaimer")}
          </p>
          {hasPoints && !canClaim && (
            <p className="relative mt-1 text-[11px] leading-[1.5] font-normal text-white/35">
              {t("pointsClaimBelowMin")}
            </p>
          )}

          {gateMet ? (
            <>
              {/* Everything already distributed, summarised — the detail is in
                history rather than stacked onto the live number. */}
              {claimedKash !== null && (
                <button
                  onClick={onHistory}
                  className="relative mt-3 flex w-full cursor-pointer items-center justify-between border-t border-white/8 pt-2.5 text-[12px] hover:opacity-80"
                >
                  <span className="font-normal text-white/45">{t("claimedSoFar")}</span>
                  <span className="tnum flex items-center gap-1 text-white/70">
                    {claimedKash} KASH
                    <span className="text-white/35">›</span>
                  </span>
                </button>
              )}
              {!hasPoints && (
                <p className="relative mt-2.5 text-[11.5px] leading-[1.5] font-normal text-white/40">
                  {t("weekPointsHint")}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="relative mt-3.5 mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
                  {t("gateTitle")}
                </span>
                <span className="tnum text-[11.5px] font-normal text-white/50">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-200 shadow-[0_0_10px_rgba(252,211,77,0.5)] transition-[width] duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="relative mt-2.5 text-[11.5px] leading-[1.5] font-normal text-white/40">
                {t("gateHint", { usd: account?.gate.minHoldingUsd ?? "10", shortfall })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
