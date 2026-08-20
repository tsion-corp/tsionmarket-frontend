"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { DrawOverview } from "@/features/casino/components/arkball/draw-overview";
import { TicketBuilder } from "@/features/casino/components/arkball/ticket-builder";
import { TicketHistory } from "@/features/casino/components/arkball/ticket-history";
import { useLottery } from "@/features/casino/hooks/use-lottery";
import { formatLotteryUsdc } from "@/features/casino/lib/lottery";
import { friendlyError } from "@/lib/errors";

export function ArkBallSection() {
  const t = useTranslations("casino.arkball");
  const lottery = useLottery();
  const current = lottery.currentDraw;
  const rule = lottery.config?.rule;

  if (lottery.loading) {
    return (
      <div className="mx-auto w-full max-w-[1380px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="h-[360px] animate-pulse rounded-[28px] border border-white/7 bg-white/[0.035]" />
      </div>
    );
  }

  if (lottery.error || !lottery.config || !current || !rule) {
    return (
      <div className="mx-auto w-full max-w-[1380px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-[24px] border border-red-400/15 bg-red-400/[0.055] px-6 py-12 text-center">
          <h1 className="ws-display text-[28px] text-white">{t("unavailableTitle")}</h1>
          <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-white/48">
            {lottery.error
              ? friendlyError(lottery.error, t("unavailableBody"))
              : t("unavailableBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="relative overflow-hidden pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute top-48 left-[-220px] -z-10 h-[620px] w-[620px] rounded-full bg-red-600/8 blur-[130px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[760px] right-[-220px] -z-10 h-[580px] w-[580px] rounded-full bg-amber-400/6 blur-[130px]"
      />

      <div className="mx-auto w-full max-w-[1380px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="relative min-h-[310px] overflow-hidden rounded-[28px] border border-white/9 shadow-[0_35px_100px_rgba(0,0,0,0.35)] sm:min-h-[360px]">
          <Image
            src="/casino/arkball/hero.png"
            alt="Five white lottery balls and one red ArkBall"
            fill
            priority
            sizes="(max-width: 1380px) 100vw, 1380px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,9,10,0.95)_0%,rgba(6,9,10,0.82)_36%,rgba(6,9,10,0.18)_70%,rgba(6,9,10,0.45)_100%)]" />
          <div className="relative flex min-h-[310px] max-w-[660px] flex-col justify-end p-6 sm:min-h-[360px] sm:p-9">
            <div className="inline-flex w-fit items-center rounded-full border border-red-300/25 bg-red-500/12 px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-red-200 uppercase backdrop-blur">
              {t("exactMatch")}
            </div>
            <h1 className="ws-display mt-4 text-[clamp(44px,7vw,82px)] leading-[0.9] tracking-[-0.045em] text-white">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-xl text-[13px] leading-6 text-white/62 sm:text-[15px]">
              {t("heroBody")}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-white/66">
              <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5 backdrop-blur">
                {t("pricePill", { price: formatLotteryUsdc(rule.pricePerTicketUsdc) })}
              </span>
              <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5 backdrop-blur">
                {t("oddsPill", { odds: rule.availableTicketCombinations.toLocaleString() })}
              </span>
              <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5 backdrop-blur">
                {t("rolloverPill")}
              </span>
            </div>
          </div>
        </section>

        <DrawOverview current={current} latest={lottery.results[0] ?? null} />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1fr)_290px]">
          <TicketBuilder
            drawId={current.id}
            drawStatus={current.status}
            salesCloseAt={current.salesCloseAt}
            priceUsdc={rule.pricePerTicketUsdc}
            availableUsdc={lottery.availableUsdc}
            eligibility={lottery.eligibility}
            ownedTickets={lottery.tickets}
            quickPick={lottery.quickPick}
            purchase={lottery.purchase}
            quickPicking={lottery.quickPicking}
            purchasing={lottery.purchasing}
          />
          <div className="space-y-4">
            <ChessCashierLauncher compact productName={t("title")} title={t("arkadeBalance")} />
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[10px] font-semibold tracking-[0.13em] text-white/38 uppercase">
                {t("drawIntegrity")}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-white/45">{t("drawIntegrityBody")}</p>
              <div className="mt-3 truncate rounded-lg border border-white/7 bg-black/20 px-3 py-2 font-mono text-[9px] text-white/28">
                {current.randomnessCommitment}
              </div>
            </div>
          </div>
        </div>

        <TicketHistory
          tickets={lottery.tickets}
          results={lottery.results}
          loading={lottery.ticketsLoading}
        />

        <section className="rounded-[24px] border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-6 sm:p-8">
          <div className="text-[10px] font-semibold tracking-[0.13em] text-red-300 uppercase">
            {t("howItWorks")}
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {["choose", "pay", "settle"].map((key, index) => (
              <div key={key} className="border-l border-white/9 pl-4">
                <div className="tnum text-[11px] font-bold text-red-300">0{index + 1}</div>
                <h3 className="mt-2 text-[15px] font-bold text-white">{t(`how.${key}.title`)}</h3>
                <p className="mt-1 text-[12px] leading-5 text-white/43">{t(`how.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
