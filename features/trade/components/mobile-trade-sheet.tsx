"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, CloseIcon } from "@/components/ui/icons";

interface MobileTradeSheetProps {
  open: boolean;
  onClose: () => void;
  /** The market being traded, e.g. "ETH/USD" or "BTC". */
  title: string;
  subtitle?: string;
  /** Live price, rendered at the right of the header. */
  priceSlot?: React.ReactNode;
  /**
   * The market list for switching without leaving this screen. Given one, the
   * title becomes a button that reveals it. Call `close` after a selection so
   * the list dismisses itself and the caller keeps ownership of what was
   * chosen.
   */
  marketPicker?: (close: () => void) => React.ReactNode;
  /** Row under the header, e.g. an interface switch. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

// The chart and the order ticket for one market, as a screen of their own.
//
// A phone cannot carry a market list, a chart and a ticket down one page: the
// section turns into a scroll nobody reaches the end of. So the dashboard shows
// the list, and choosing a market opens it here, the way the exchange apps do
// it. Full height rather than a part-height sheet, because a chart and an order
// form need the room.
// The open screen. Split out so its state — notably whether the market list is
// showing — is created on open and discarded on close, rather than being reset
// by an effect every time the sheet is dismissed.
function SheetContents({
  onClose,
  title,
  subtitle,
  priceSlot,
  marketPicker,
  toolbar,
  children,
}: Omit<MobileTradeSheetProps, "open">) {
  const t = useTranslations("common");
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("back")}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/75 transition-colors active:bg-white/12"
        >
          <ChevronLeftIcon size={16} />
        </button>
        {marketPicker ? (
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-sans text-[15px] font-semibold">{title}</span>
                <span
                  aria-hidden
                  className={`text-[10px] text-white/45 transition-transform ${
                    pickerOpen ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </span>
              {subtitle ? (
                <span className="block truncate text-[11.5px] font-normal text-white/50">
                  {subtitle}
                </span>
              ) : null}
            </span>
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate font-sans text-[15px] font-semibold">{title}</div>
            {subtitle ? (
              <div className="truncate text-[11.5px] font-normal text-white/50">{subtitle}</div>
            ) : null}
          </div>
        )}
        {priceSlot ? <div className="shrink-0 text-right">{priceSlot}</div> : null}
      </header>

      {toolbar ? (
        <div className="shrink-0 border-b border-white/8 px-4 py-2.5">{toolbar}</div>
      ) : null}

      {pickerOpen && marketPicker ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
            <span className="text-[11.5px] tracking-[0.06em] text-white/40 uppercase">
              {t("switchMarket")}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label={t("close")}
              className="grid size-7 cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(28px,env(safe-area-inset-bottom))]">
            {marketPicker(() => setPickerOpen(false))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      )}
    </>
  );
}

export function MobileTradeSheet({
  open,
  onClose,
  title,
  subtitle,
  priceSlot,
  marketPicker,
  toolbar,
  children,
}: MobileTradeSheetProps) {
  const reduce = useReducedMotion();

  // The page behind the sheet does not scroll while it is open, and Escape
  // closes it. Both undone on close and on unmount.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-[200] flex flex-col bg-black md:hidden"
        >
          <SheetContents
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            priceSlot={priceSlot}
            marketPicker={marketPicker}
            toolbar={toolbar}
          >
            {children}
          </SheetContents>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
