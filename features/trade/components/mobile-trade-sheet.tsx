"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronLeftIcon, CloseIcon } from "@/components/ui/icons";
import { Portal } from "@/components/ui/portal";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getAttribute("aria-hidden") !== "true"
  );
}

// Is this the dialog on top? Both phone sheets stack: tapping a coin on the
// market screen opens the trade sheet over it, and Escape belongs to whichever
// went up last. Read off the DOM rather than a shared counter so it also
// defers to a confirmation dialog or a wallet prompt neither sheet knows about.
function isTopmostDialog(node: HTMLElement): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return dialogs.length === 0 || dialogs[dialogs.length - 1] === node;
}

export interface SheetDismissOptions {
  open: boolean;
  onClose: () => void;
  /** While true the sheet refuses to dismiss: a signature is mid-flight. */
  locked?: boolean;
}

/**
 * The four things a modal sheet owes a keyboard user: focus moves in on open,
 * Tab stays inside, Escape closes the topmost sheet, and focus goes back to
 * whatever opened it. Plus the page behind it does not scroll.
 *
 * Both phone trade sheets need this and there is no cross-cutting home for it
 * yet; it belongs in `hooks/` next to the other shared behaviours, which is a
 * move for whoever owns that directory.
 */
export function useSheetDismiss({ open, onClose, locked = false }: SheetDismissOptions) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  // Consumers pass an inline arrow, so a new identity arrives every render.
  // Kept in a ref, the effects below key on `open` alone instead of re-running
  // (and re-reading the body's overflow) on each of the parent's renders.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || locked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const node = ref.current;
      if (node && !isTopmostDialog(node)) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // After paint, so the sheet's own contents exist to receive it. The
    // container takes the focus rather than the first control, which is what
    // makes a screen reader announce the dialog instead of a stray button.
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const node = ref.current;
    if (!node) return;
    const items = focusableIn(node);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && (index <= 0 || document.activeElement === node)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && index === items.length - 1) {
      event.preventDefault();
      first.focus();
    }
  };

  return { ref, onKeyDown };
}

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
      <header className="flex shrink-0 items-center gap-2 border-b border-white/8 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        {/* 44px of hit area around a 36px ring: the ring is what the design
            draws, the box is what a thumb has to land on. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("back")}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full"
        >
          <span className="grid size-9 place-items-center rounded-full border border-white/12 bg-white/6 text-white/75 transition-colors active:bg-white/12">
            <ChevronLeftIcon size={16} />
          </span>
        </button>
        {marketPicker ? (
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            aria-controls="mobile-trade-market-picker"
            className="flex min-w-0 flex-1 cursor-pointer items-center text-left"
          >
            <span className="min-w-0">
              {/* The comp draws the market as a pill with a chevron, not as
                  bare text. */}
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/12 bg-white/6 py-1 pr-2 pl-3">
                <span className="truncate font-sans text-[15px] font-semibold">{title}</span>
                <ChevronDownIcon
                  size={11}
                  className={`shrink-0 text-white/45 transition-transform ${
                    pickerOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
              {subtitle ? (
                <span className="mt-0.5 block truncate pl-3 text-[11.5px] font-normal text-white/50">
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
        {priceSlot ? <div className="shrink-0 pr-1 text-right">{priceSlot}</div> : null}
      </header>

      {toolbar ? (
        <div className="shrink-0 border-b border-white/8 px-4 py-2.5">{toolbar}</div>
      ) : null}

      {pickerOpen && marketPicker ? (
        <div id="mobile-trade-market-picker" className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between py-1 pr-1 pl-4">
            <span className="text-[11.5px] tracking-[0.06em] text-white/40 uppercase">
              {t("switchMarket")}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label={t("close")}
              className="grid size-11 cursor-pointer place-items-center rounded-full"
            >
              <span className="grid size-7 place-items-center rounded-full border border-white/12 bg-white/6 text-white/70">
                <CloseIcon />
              </span>
            </button>
          </div>
          <div className="ws-no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(28px,env(safe-area-inset-bottom))]">
            {marketPicker(() => setPickerOpen(false))}
          </div>
        </div>
      ) : (
        <div className="ws-no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(28px,env(safe-area-inset-bottom))]">
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
  const { ref, onKeyDown } = useSheetDismiss({ open, onClose });

  return (
    // Portalled for the same reason ModalShell is: an ancestor with a
    // transform becomes the containing block for `position: fixed`, and this
    // screen must always be measured against the viewport.
    <Portal>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[200] flex flex-col bg-black outline-none md:hidden"
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
    </Portal>
  );
}
