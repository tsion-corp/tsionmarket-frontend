"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import type { HouseTicket } from "../markets/api";

function formatE6(value: string): string {
  const atomic = BigInt(value);
  const whole = atomic / 1_000_000n;
  const fraction = (atomic % 1_000_000n).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function houseTicketStatusLabel(ticket: HouseTicket): string {
  if (ticket.status === "payout_pending") return "Won - payout pending";
  return ticket.status[0].toUpperCase() + ticket.status.slice(1);
}

export type HouseTicketTone = "active" | "lost" | "won" | "void";

export function houseTicketTone(ticket: HouseTicket): HouseTicketTone {
  if (ticket.status === "lost" || ticket.legs.some((leg) => leg.status === "lost")) {
    return "lost";
  }
  if (ticket.status === "payout_pending" || ticket.status === "paid") return "won";
  if (ticket.status === "void") return "void";
  return "active";
}

export function houseTicketSummary(ticket: HouseTicket): string {
  const lost = ticket.legs.filter((leg) => leg.status === "lost").map((leg) => leg.marketLabel);
  if (lost.length) return `Lost: ${lost.join(", ")}`;
  if (ticket.status === "payout_pending") return "Won - manual payout pending";
  if (ticket.status === "paid") return "Won - payout completed";
  if (ticket.status === "void") return "Ticket voided";
  if (ticket.status === "prepared") return "Awaiting stake confirmation";
  return "All selections in progress";
}

const TICKET_TONE = {
  active: {
    banner: "border-[#29475c] bg-[#172732]",
    icon: "border-[#47758f] bg-[#23465a] text-[#9ddfff]",
    text: "text-[#b8e8ff]",
  },
  lost: {
    banner: "border-[#6e3038] bg-[#351d21]",
    icon: "border-[#8d3e48] bg-[#51262c] text-[#ff9da8]",
    text: "text-[#ff9da8]",
  },
  won: {
    banner: "border-[#2f604b] bg-[#193126]",
    icon: "border-[#3d7b5f] bg-[#24503c] text-[#80dbae]",
    text: "text-[#80dbae]",
  },
  void: {
    banner: "border-[#494949] bg-[#252525]",
    icon: "border-[#5b5b5b] bg-[#333] text-[#bbb]",
    text: "text-[#bbb]",
  },
} as const;

function selectionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "Selection" : "Selections"}`;
}

function ticketHeadline(ticket: HouseTicket): string {
  const lost = ticket.legs.filter((leg) => leg.status === "lost").length;
  const voided = ticket.legs.filter((leg) => leg.status === "void").length;
  if (lost) return `${selectionCountLabel(lost)} Lost`;
  if (ticket.status === "payout_pending" || ticket.status === "paid") {
    return `${selectionCountLabel(ticket.legs.length)} Won`;
  }
  if (ticket.status === "void")
    return `${selectionCountLabel(voided || ticket.legs.length)} Voided`;
  return `${selectionCountLabel(ticket.legs.length)} In Progress`;
}

function legTone(status: HouseTicket["legs"][number]["status"]): HouseTicketTone {
  if (status === "lost") return "lost";
  if (status === "won") return "won";
  if (status === "void") return "void";
  return "active";
}

function statusMark(tone: HouseTicketTone): string {
  if (tone === "lost") return "x";
  if (tone === "won") return "✓";
  if (tone === "void") return "-";
  return "•";
}

export function HouseTicketModal({
  ticket,
  onClose,
}: {
  ticket: HouseTicket | null;
  onClose: () => void;
}) {
  return (
    <ModalShell
      open={ticket != null}
      onClose={onClose}
      contentKey={ticket?.id}
      size="lg"
      panelClassName="border-[#303030] bg-[#151515] px-0 pt-0 pb-0 md:w-[min(660px,100%)]"
      closeButtonClassName="top-4 right-4 size-10 border-[#3a3a3a] bg-[#252525] text-white"
    >
      {ticket ? (
        <section role="dialog" aria-modal="true" aria-labelledby="house-ticket-title">
          <header className="px-5 pt-5 pr-20 pb-4 sm:px-6 sm:pt-6 sm:pr-20">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#858585] uppercase">
              Ticket
            </p>
            <h2
              id="house-ticket-title"
              className="mt-1 text-[22px] leading-none font-bold tracking-[-0.02em] text-white"
            >
              {ticket.bookingCode}
            </h2>
          </header>

          {(() => {
            const tone = houseTicketTone(ticket);
            const colors = TICKET_TONE[tone];
            return (
              <div className={`mx-4 rounded-xl border px-4 py-3.5 sm:mx-5 ${colors.banner}`}>
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold ${colors.icon}`}
                  >
                    {statusMark(tone)}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-[14px] font-bold ${colors.text}`}>
                      {ticketHeadline(ticket)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/55">
                      {houseTicketStatusLabel(ticket)} / Placed{" "}
                      {formatUtc(ticket.acceptedAt ?? ticket.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="max-h-[54dvh] space-y-2.5 overflow-y-auto p-4 sm:p-5">
            {ticket.legs.map((leg) => {
              const tone = legTone(leg.status);
              const colors = TICKET_TONE[tone];
              return (
                <article
                  key={`${leg.conditionId}:${leg.outcome}`}
                  className="rounded-xl border border-[#303030] bg-[#1b1b1b] px-4 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${colors.icon}`}
                    >
                      {statusMark(tone)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-medium text-[#898989]">
                        {leg.eventTitle}
                      </p>
                      <p className="mt-1 text-[14px] leading-5 font-bold text-[#f2f2f2]">
                        {leg.outcome === "yes" ? "Yes" : "No"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#929292]">
                        {leg.marketLabel}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-bold text-white tabular-nums">
                        {formatE6(leg.decimalOddsE6)}
                      </p>
                      <p className={`mt-1 text-[9px] font-bold capitalize ${colors.text}`}>
                        {leg.status}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <dl className="grid grid-cols-3 gap-3 border-t border-[#303030] bg-[#0d0d0d] px-5 py-4 sm:px-6">
            <div>
              <dt className="text-[10px] text-[#777]">Stake</dt>
              <dd className="mt-1 text-[13px] font-bold text-white tabular-nums">
                {formatE6(ticket.stakeE6)} USDC
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-[#777]">Possible</dt>
              <dd className="mt-1 text-[13px] font-bold text-white tabular-nums">
                {formatE6(ticket.potentialPayoutE6)} USDC
              </dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] text-[#777]">Payout</dt>
              <dd className="mt-1 text-[13px] font-bold text-[#80dbae] tabular-nums">
                {ticket.status === "paid" ? formatE6(ticket.potentialPayoutE6) : "0"} USDC
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </ModalShell>
  );
}
