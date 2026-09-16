"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  SCREENER_METRICS,
  type ScreenerMetric,
  type ScreenerSort,
  type SortOrder,
} from "@/lib/meme/screener";

// The screener's sort control (ADR-2026-09-15-meme-trending-screener §3). It
// is one menu of radio items: the default order and the seven metrics, then,
// once a sort is in force, the two directions for it. A menu rather than a
// radio group because picking a metric closes it, and a radio group would
// commit a new sort on every arrow press.

export const METRIC_KEYS: Record<ScreenerMetric, string> = {
  marketCap: "metricMarketCap",
  price: "metricPrice",
  age: "metricAge",
  transactions: "metricTransactions",
  volume: "metricVolume",
  traders: "metricTraders",
  liquidity: "metricLiquidity",
};

/** Newest first for age, since a younger pair has fewer minutes; high to low for the rest. */
export function defaultOrder(metric: ScreenerMetric): SortOrder {
  return metric === "age" ? "asc" : "desc";
}

/** The words for a direction: newest and oldest for age, high and low for the rest. */
export function directionKey(by: ScreenerMetric, order: SortOrder): string {
  if (by === "age") return order === "asc" ? "sortNewest" : "sortOldest";
  return order === "asc" ? "sortAsc" : "sortDesc";
}

/**
 * Open state for a toolbar popover or sheet. Escape closes it and hands focus
 * back to the trigger. On the desk a press outside closes it too, without
 * moving focus, since the press has already put focus where the reader wanted
 * it. The phone sheet's backdrop does that job there.
 */
export function useScreenerPanel(variant: "desk" | "phone") {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);

  const close = useCallback((returnFocus: boolean) => {
    refocus.current = returnFocus;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      if (refocus.current) {
        refocus.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      close(false);
    };
    window.addEventListener("keydown", onKey);
    if (variant === "desk") document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close, variant]);

  return { open, show: () => setOpen(true), close, triggerRef, wrapRef };
}

function SortIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 5v14M8 19l-3-3M8 19l3-3M16 19V5M16 5l-3 3M16 5l3 3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The metric's default direction first, so the pair reads the same way the
// metric sorts when it is picked.
function directionsFor(metric: ScreenerMetric): SortOrder[] {
  return metric === "age" ? ["asc", "desc"] : ["desc", "asc"];
}

interface MemeSortMenuProps {
  variant: "desk" | "phone";
  sort: ScreenerSort | null;
  onSortChange: (sort: ScreenerSort | null) => void;
}

export function MemeSortMenu({ variant, sort, onSortChange }: MemeSortMenuProps) {
  const t = useTranslations("memeScreener");
  const reduce = useReducedMotion();
  const { open, show: showPanel, close, triggerRef, wrapRef } = useScreenerPanel(variant);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const titleId = useId();
  const directionId = useId();
  const phone = variant === "phone";

  // Focus lands on the sort in force, so Enter on an unchanged menu is a no-op.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>("[data-current]")?.focus();
  }, [open]);

  const pick = (next: ScreenerSort | null) => {
    const same = next === null ? sort === null : sort?.by === next.by && sort.order === next.order;
    if (!same) onSortChange(next);
    close(true);
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    );
    const at = items.findIndex((item) => item === document.activeElement);
    let next: number;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = at <= 0 ? items.length - 1 : at - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else {
      // Tab leaves a menu. The desk popover goes with it; the sheet stays,
      // since tabbing inside a sheet is moving around it, not away from it.
      if (e.key === "Tab" && !phone) close(false);
      return;
    }
    e.preventDefault();
    items[next]?.focus();
  };

  const row = `flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left font-sans font-medium outline-none transition-colors hover:bg-white/6 focus-visible:bg-white/6 aria-checked:text-white ${
    phone ? "py-3 text-[14px] text-white/70" : "py-2 text-[13px] text-white/70"
  }`;
  const groupLabel =
    "px-3 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.1em] text-white/35 uppercase";

  const item = (
    key: string,
    label: string,
    checked: boolean,
    current: boolean,
    onPick: () => void
  ) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={current ? 0 : -1}
      data-current={current ? "" : undefined}
      onClick={onPick}
      className={row}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked ? (
        <span aria-hidden className="shrink-0">
          <CheckIcon size={16} className="text-accent" />
        </span>
      ) : null}
    </button>
  );

  const menu = (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-labelledby={titleId}
      onKeyDown={onMenuKey}
      className="flex flex-col"
    >
      {item("none", t("sortNone"), sort === null, sort === null, () => pick(null))}
      {SCREENER_METRICS.map((metric) =>
        item(metric, t(METRIC_KEYS[metric]), sort?.by === metric, sort?.by === metric, () =>
          pick({ by: metric, order: defaultOrder(metric) })
        )
      )}
      {sort !== null ? (
        <>
          <div role="separator" className="my-1.5 h-px bg-white/8" />
          <div role="group" aria-labelledby={directionId}>
            <div id={directionId} className={groupLabel}>
              {t(METRIC_KEYS[sort.by])}
            </div>
            {directionsFor(sort.by).map((order) =>
              // A direction keeps the menu open, so the reader sees the flip land.
              item(order, t(directionKey(sort.by, order)), sort.order === order, false, () => {
                if (sort.order !== order) onSortChange({ by: sort.by, order });
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : showPanel())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`flex h-[36px] cursor-pointer items-center gap-1.5 rounded-full border px-3 font-sans text-[12px] font-semibold transition-colors ${
          // The phone row shares its width with the timeframe track; the sort
          // chip under it carries the full wording.
          phone ? "max-w-[132px]" : "max-w-[220px]"
        } ${
          sort !== null
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/12 bg-white/4 text-white/60 hover:border-white/25 hover:text-white"
        }`}
      >
        <SortIcon />
        {sort === null ? (
          t("sortLabel")
        ) : (
          <span className="min-w-0 truncate">
            <span className="sr-only">{t("sortLabel")}</span>{" "}
            {t("sortApplied", {
              metric: t(METRIC_KEYS[sort.by]),
              direction: t(directionKey(sort.by, sort.order)),
            })}
          </span>
        )}
      </button>

      {phone ? (
        <ModalShell open={open} onClose={() => close(true)}>
          <div role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div id={titleId} className="ws-display mb-3 pr-10 text-[20px]">
              {t("sortTitle")}
            </div>
            {menu}
          </div>
        </ModalShell>
      ) : (
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="bg-panel absolute left-0 z-30 mt-2 w-[240px] rounded-[16px] border border-white/12 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
            >
              <div id={titleId} className={groupLabel}>
                {t("sortTitle")}
              </div>
              {menu}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}
    </div>
  );
}
