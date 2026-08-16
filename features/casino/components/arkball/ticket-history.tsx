"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LotteryBall } from "@/features/casino/components/arkball/lottery-ball";
import type { LotteryDraw, LotteryTicket } from "@/features/casino/lib/api/lottery";
import { formatLotteryUsdc, LOTTERY_TIME_ZONE } from "@/features/casino/lib/lottery";

interface TicketHistoryProps {
  tickets: LotteryTicket[];
  results: LotteryDraw[];
  loading: boolean;
}

function Balls({ white, power }: { white: readonly number[]; power: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {white.map((number) => (
        <LotteryBall key={number} number={number} size="sm" />
      ))}
      <LotteryBall number={power} arkball size="sm" />
    </div>
  );
}

export function TicketHistory({ tickets, results, loading }: TicketHistoryProps) {
  const t = useTranslations("casino.arkball");
  const format = useFormatter();

  return (
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[22px] border border-white/8 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.13em] text-red-300 uppercase">
              {t("yourEntries")}
            </div>
            <h2 className="ws-display mt-1 text-[24px] tracking-[-0.02em] text-white">
              {t("myTickets")}
            </h2>
          </div>
          <div className="tnum text-[12px] text-white/42">{tickets.length}</div>
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-xl border border-white/7 bg-black/15 px-4 py-8 text-center text-[13px] text-white/42">
              {t("loadingTickets")}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-8 text-center">
              <div className="text-[13px] font-semibold text-white/65">{t("noTickets")}</div>
              <div className="mt-1 text-[11px] text-white/38">{t("noTicketsBody")}</div>
            </div>
          ) : (
            tickets.slice(0, 12).map((ticket) => (
              <article
                key={ticket.id}
                className="flex flex-col gap-3 rounded-xl border border-white/7 bg-black/18 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Balls white={ticket.whiteNumbers} power={ticket.powerNumber} />
                  <div className="mt-2 text-[10px] text-white/35">
                    {format.dateTime(new Date(ticket.acceptedAt), {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: LOTTERY_TIME_ZONE,
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                  <div
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase ${
                      ticket.status === "won"
                        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                        : ticket.status === "refunded"
                          ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
                          : ticket.status === "lost"
                            ? "border-white/8 bg-white/[0.03] text-white/35"
                            : "border-red-300/20 bg-red-300/8 text-red-200"
                    }`}
                  >
                    {t(`ticketStatus.${ticket.status}`)}
                  </div>
                  {ticket.status === "won" ? (
                    <div className="tnum mt-2 text-[13px] font-bold text-emerald-300">
                      +{formatLotteryUsdc(ticket.payoutUsdc, 6)} USDC
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[22px] border border-white/8 bg-white/[0.035] p-5 sm:p-6">
        <div className="text-[10px] font-semibold tracking-[0.13em] text-white/40 uppercase">
          {t("verifiedHistory")}
        </div>
        <h2 className="ws-display mt-1 text-[24px] tracking-[-0.02em] text-white">
          {t("previousResults")}
        </h2>

        <div className="mt-5 divide-y divide-white/7">
          {results.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-white/40">{t("noCompletedDraw")}</div>
          ) : (
            results.slice(0, 6).map((draw) => (
              <article key={draw.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold text-white/58">
                    {format.dateTime(new Date(draw.drawAt), {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: LOTTERY_TIME_ZONE,
                    })}
                  </div>
                  <div className="text-[10px] text-white/35">
                    {draw.winningTicketCount > 0
                      ? t("winnerCountShort", { count: draw.winningTicketCount })
                      : t("rolledOverShort")}
                  </div>
                </div>
                {draw.result ? (
                  <div className="mt-2">
                    <Balls white={draw.result.whiteNumbers} power={draw.result.powerNumber} />
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] text-white/32">
                  {t("poolValue", {
                    amount: formatLotteryUsdc(draw.payoutUsdc || draw.rolloverUsdc),
                  })}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
