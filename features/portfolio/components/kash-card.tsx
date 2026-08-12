"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useKashAccount, useKashSubscription } from "@/features/portfolio/hooks/use-kash";
import { gateProgress, settlesIn } from "@/features/portfolio/lib/kash";

const COIN = "/kash-coin.jpg";

// Clock for the settlement countdown, read as an external store so render
// stays pure. The snapshot is floored to the minute, which keeps it stable
// between ticks; hour-level granularity needs nothing finer. Null on the
// server, where there is no clock to subscribe to.
function subscribeMinuteTick(onTick: () => void) {
  const id = setInterval(onTick, 60_000);
  return () => clearInterval(id);
}

function useNowMs(): number | null {
  return useSyncExternalStore(
    subscribeMinuteTick,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null
  );
}

interface KashCardProps {
  onBuy: () => void;
  onSend: () => void;
  onConvert: () => void;
  onHistory: () => void;
  onUpgrade: () => void;
}

// The Kash balance card, fed by the rewards engine. The model is points-first:
// activity earns points live (like XP) and they convert to KSH once a week at
// settlement, so the card keeps the two numbers visibly separate — spendable
// KSH on top, this week's points with a countdown below. Below the holding
// gate it shows progress toward it, since "75% there" invites the next buy in
// a way a bare lock never does.
export function KashCard({ onBuy, onSend, onConvert, onHistory, onUpgrade }: KashCardProps) {
  const t = useTranslations("kash");
  const { data: account } = useKashAccount();
  const { data: subscription } = useKashSubscription();

  const balance = account?.balance ?? "0";
  const balanceUsd = account?.balanceUsd ?? "0";
  const gateMet = account?.gate.met ?? false;
  const shortfall = account?.gate.shortfall ?? "0";
  const progress = account ? gateProgress(account) : 0;
  const hasConvertible = Number(account?.convertible ?? "0") > 0;

  const nowMs = useNowMs();
  const weekPoints = account?.week.points ?? "0";
  const countdown = account && nowMs !== null ? settlesIn(nowMs, account.week.settlesAt) : null;
  const lastPayout = account?.settlements[0];

  return (
    <div className="ws-card flex h-full flex-col p-5 sm:p-[26px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-normal text-white/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={COIN} alt="" className="h-6 w-6 rounded-full object-cover" />
          {t("balanceTitle")}
        </div>
        <div className="flex items-center gap-2.5">
          {subscription && (
            <button
              onClick={onUpgrade}
              className="cursor-pointer rounded-full border border-amber-200/30 bg-amber-200/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200/90 hover:bg-amber-200/16"
            >
              {t("tierChip", { tier: subscription.tier })}
            </button>
          )}
          <button
            onClick={onHistory}
            className="cursor-pointer text-[12px] font-medium text-white/45 hover:text-white/70"
          >
            {t("history")}
          </button>
        </div>
      </div>

      <div className="mt-2">
        <div className="ws-display tnum flex items-end gap-1.5 text-[34px] leading-none tracking-[-0.02em]">
          {balance} <span className="ml-2 text-[20px] text-amber-200/90">KASH</span>
        </div>
        <div className="tnum mt-1 text-[12.5px] font-normal text-white/45">${balanceUsd}</div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onBuy}
          className="flex-1 cursor-pointer rounded-xl bg-amber-200 px-4 py-2.5 font-sans text-[13px] font-semibold text-amber-950 hover:opacity-90"
        >
          {t("buy")}
        </button>
        <button
          onClick={onSend}
          disabled={!hasConvertible}
          className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("send")}
        </button>
        <button
          onClick={onConvert}
          disabled={!hasConvertible}
          className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("convert")}
        </button>
      </div>

      {/* The points counter is ALWAYS visible: an XP meter people can see
          before they qualify sells the mechanic; hiding it behind the gate
          made points look like they didn't exist. Below the gate it renders
          muted with a locked badge, and the progress bar explains the path. */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
            {t("weekPointsTitle")}
          </span>
          <span className="tnum text-[11.5px] font-normal text-white/50">
            {countdown
              ? countdown.days > 0
                ? t("settlesInDays", { days: countdown.days, hours: countdown.hours })
                : t("settlesInHours", { hours: countdown.hours })
              : t("settlingSoon")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`tnum text-[22px] leading-none font-semibold ${
              gateMet ? "text-amber-200" : "text-white/35"
            }`}
          >
            {weekPoints}{" "}
            <span
              className={`text-[13px] font-normal ${gateMet ? "text-amber-200/70" : "text-white/30"}`}
            >
              pts
            </span>
          </span>
          {!gateMet && (
            <span className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/50">
              {t("pointsLocked")}
            </span>
          )}
        </div>

        {gateMet ? (
          <>
            {lastPayout && (
              <div className="mt-2.5 flex items-center justify-between border-t border-white/8 pt-2 text-[12px]">
                <span className="font-normal text-white/45">
                  {t("lastPayout", { week: lastPayout.weekKey })}
                </span>
                <span className="tnum text-up">+{lastPayout.kash} KASH</span>
              </div>
            )}
            <p className="mt-2.5 text-[11.5px] leading-[1.5] font-normal text-white/40">
              {t("weekPointsHint")}
            </p>
          </>
        ) : (
          <>
            <div className="mt-3 mb-1.5 flex items-baseline justify-between">
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
              {t("gateHint", { shortfall })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
