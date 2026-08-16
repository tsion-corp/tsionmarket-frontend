"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { LotteryDraw } from "@/features/casino/lib/api/lottery";
import { LotteryBall } from "@/features/casino/components/arkball/lottery-ball";
import {
  formatLotteryUsdc,
  LOTTERY_TIME_ZONE,
  lotteryCountdown,
} from "@/features/casino/lib/lottery";

function DrawDate({ timestamp }: { timestamp: string }) {
  const format = useFormatter();
  return (
    <>
      {format.dateTime(new Date(timestamp), {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: LOTTERY_TIME_ZONE,
      })}
    </>
  );
}

function Countdown({ timestamp }: { timestamp: string }) {
  const t = useTranslations("casino.arkball");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const countdown = now === null ? null : lotteryCountdown(timestamp, now);
  const cells = [
    { label: t("days"), value: countdown?.days },
    { label: t("hours"), value: countdown?.hours },
    { label: t("minutes"), value: countdown?.minutes },
    { label: t("seconds"), value: countdown?.seconds },
  ];

  return (
    <div className="flex justify-center gap-2.5">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-12 text-center">
          <div className="tnum rounded-lg border border-white/8 bg-black/35 px-2 py-2 text-[20px] font-bold text-white">
            {cell.value === undefined ? "--" : String(cell.value).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[9px] tracking-[0.11em] text-white/38 uppercase">
            {cell.label}
          </div>
        </div>
      ))}
    </div>
  );
}

interface DrawOverviewProps {
  current: LotteryDraw;
  latest: LotteryDraw | null;
}

export function DrawOverview({ current, latest }: DrawOverviewProps) {
  const t = useTranslations("casino.arkball");
  const latestResult = latest?.result;

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <article className="rounded-[22px] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.085),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
        <div className="text-[11px] font-semibold tracking-[0.13em] text-white/42 uppercase">
          {t("winningNumbers")}
        </div>
        {latest && latestResult ? (
          <>
            <div className="mt-2 text-[14px] font-semibold text-white/78">
              <DrawDate timestamp={latestResult.drawnAt} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {latestResult.whiteNumbers.map((number) => (
                <LotteryBall key={number} number={number} size="sm" />
              ))}
              <LotteryBall number={latestResult.powerNumber} arkball size="sm" />
            </div>
          </>
        ) : (
          <div className="mt-8 text-[14px] text-white/42">{t("noCompletedDraw")}</div>
        )}
      </article>

      <article className="rounded-[22px] border border-red-400/15 bg-[radial-gradient(circle_at_50%_0%,rgba(225,29,53,0.16),transparent_52%),rgba(255,255,255,0.035)] p-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
        <div className="text-[11px] font-semibold tracking-[0.13em] text-white/42 uppercase">
          {t("nextDrawing")}
        </div>
        <div className="mt-2 text-[14px] font-semibold text-white/78">
          <DrawDate timestamp={current.drawAt} />
        </div>
        <div className="mt-4">
          <Countdown timestamp={current.drawAt} />
        </div>
        <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-red-300 uppercase">
          {t("fundedJackpot")}
        </div>
        <div className="ws-display mt-1 text-[clamp(30px,4vw,44px)] tracking-[-0.035em] text-white">
          ${formatLotteryUsdc(current.advertisedJackpotUsdc)}
        </div>
        <div className="mt-1 text-[11px] text-white/42">{t("cashValueEqualsPool")}</div>
      </article>

      <article className="rounded-[22px] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.085),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
        <div className="text-[11px] font-semibold tracking-[0.13em] text-white/42 uppercase">
          {t("drawActivity")}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/7 bg-black/20 p-3">
            <div className="tnum text-[24px] font-bold text-white">{current.totalTickets}</div>
            <div className="mt-1 text-[10px] tracking-[0.08em] text-white/40 uppercase">
              {t("tickets")}
            </div>
          </div>
          <div className="rounded-xl border border-white/7 bg-black/20 p-3">
            <div className="tnum text-[24px] font-bold text-white">{current.totalPlayers}</div>
            <div className="mt-1 text-[10px] tracking-[0.08em] text-white/40 uppercase">
              {t("players")}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-white/7 bg-black/20 px-4 py-3 text-[12px] leading-5 text-white/58">
          {latest
            ? latest.winningTicketCount > 0
              ? t("jackpotWinners", { count: latest.winningTicketCount })
              : t("jackpotRolled", { amount: formatLotteryUsdc(latest.rolloverUsdc) })
            : t("firstDrawPending")}
        </div>
      </article>
    </section>
  );
}
