"use client";

import type { ReactNode } from "react";

export type PredictionTicketTab = "slip" | "bets";

export function PredictionBetEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-14 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full border border-[#333] bg-[#242424] text-[#777]">
        +
      </div>
      <p className="mt-4 text-[13px] font-semibold text-[#ebebeb]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[230px] text-[10px] leading-4 text-[#777]">{body}</p>
    </div>
  );
}

export function PredictionBetPanel({
  count,
  tab,
  busy,
  onTabChange,
  onClose,
  slip,
  bets,
}: {
  count: number;
  tab: PredictionTicketTab;
  busy: boolean;
  onTabChange: (tab: PredictionTicketTab) => void;
  onClose?: () => void;
  slip: ReactNode;
  bets: ReactNode;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden bg-[#111] ${onClose ? "h-[min(86dvh,720px)] rounded-t-xl border border-[#333]" : "h-full"}`}
    >
      <header className="flex min-h-14 items-center border-b border-[#242424] p-2">
        <div className="grid h-10 flex-1 grid-cols-2 rounded-xl bg-[#171717] p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onTabChange("slip")}
            className={`cursor-pointer rounded-lg text-xs ${tab === "slip" ? "bg-[#242424] text-white" : "text-[#999]"}`}
          >
            Ticket ({count})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onTabChange("bets")}
            className={`cursor-pointer rounded-lg text-xs ${tab === "bets" ? "bg-[#242424] text-white" : "text-[#999]"}`}
          >
            My tickets
          </button>
        </div>
        {onClose ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close ticket"
            className="ml-2 grid size-9 cursor-pointer place-items-center rounded-full bg-[#242424] text-[#999]"
          >
            x
          </button>
        ) : null}
      </header>
      {tab === "slip" ? slip : bets}
    </section>
  );
}

export function PredictionBetSidebarFrame({
  count,
  desktopOpen,
  mobileOpen,
  onDesktopOpenChange,
  onMobileOpenChange,
  renderPanel,
}: {
  count: number;
  desktopOpen: boolean;
  mobileOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
  onMobileOpenChange: (open: boolean) => void;
  renderPanel: (close?: () => void) => ReactNode;
}) {
  return (
    <>
      <aside
        className={`fixed top-0 right-0 z-[110] hidden h-screen bg-[#171717] transition-[width] duration-300 xl:block ${desktopOpen ? "w-[326px]" : "w-0"}`}
      >
        <button
          type="button"
          aria-label={desktopOpen ? "Collapse ticket" : "Open ticket"}
          aria-expanded={desktopOpen}
          onClick={() => onDesktopOpenChange(!desktopOpen)}
          className="absolute top-1/2 left-0 grid size-10 -translate-x-full -translate-y-1/2 cursor-pointer place-items-center rounded-l-md bg-[#171717] text-[#999]"
        >
          <span className={desktopOpen ? "" : "rotate-180"}>›</span>
        </button>
        <div className="h-full overflow-hidden pt-14">
          <div className="h-full w-[326px] border-l border-[#242424]">
            {desktopOpen ? renderPanel() : null}
          </div>
        </div>
      </aside>
      <button
        type="button"
        onClick={() => onMobileOpenChange(true)}
        aria-label="Open ticket"
        className="fixed right-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-[105] h-12 rounded-xl bg-[#b9fcff] px-4 text-xs font-semibold text-[#171717] xl:hidden"
      >
        Ticket {count ? `(${count})` : ""}
      </button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end bg-black/75 xl:hidden">
          <button
            type="button"
            aria-label="Close ticket"
            onClick={() => onMobileOpenChange(false)}
            className="absolute inset-0"
          />
          <div className="relative w-full">{renderPanel(() => onMobileOpenChange(false))}</div>
        </div>
      ) : null}
    </>
  );
}
