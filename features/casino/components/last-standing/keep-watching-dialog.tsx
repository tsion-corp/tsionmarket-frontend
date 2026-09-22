"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Portal } from "@/components/ui/portal";

interface KeepWatchingDialogProps {
  open: boolean;
  /** Yes: open the pop-out, then go. Runs inside this click, which is what
   *  lets it request a picture-in-picture window. */
  onKeep: () => void;
  /** No, and every other dismissal: stay in the arena. Nothing navigates. */
  onStay: () => void;
}

/**
 * Asked when a player walks out of a live round.
 *
 * The round's clock resets on anyone's wager, so leaving the page is how a
 * player stops being last without meaning to. Rather than opening a pop-out
 * uninvited, this asks — and the answer doubles as the gesture the browser
 * requires before it will hand over a picture-in-picture window.
 */
export function KeepWatchingDialog({ open, onKeep, onStay }: KeepWatchingDialogProps) {
  return open ? <Dialog onKeep={onKeep} onStay={onStay} /> : null;
}

function Dialog({ onKeep, onStay }: Omit<KeepWatchingDialogProps, "open">) {
  const t = useTranslations("casino.lastStanding");
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);

  // Escape and the backdrop mean the same as No: stay. Only Yes leaves, so a
  // stray keypress can never walk somebody out of a live round.
  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onStay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onStay]);

  // Keeps Tab inside the dialog: two buttons decide where the player goes
  // next, and tabbing out to the page behind loses them.
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = ref.current?.querySelectorAll<HTMLElement>("button");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <Portal>
      <div className="fixed inset-0 z-[460] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t("keepWatchingNo")}
          tabIndex={-1}
          onClick={onStay}
          className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        />
        <div
          ref={ref}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="ws-card relative w-full max-w-[380px] bg-[#101013] p-5 outline-none"
        >
          <h2 id={titleId} className="ws-display text-[19px] tracking-[-0.01em]">
            {t("keepWatchingTitle")}
          </h2>
          <p id={bodyId} className="mt-2 text-[13px] leading-[1.55] font-normal text-white/60">
            {t("keepWatchingBody")}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onStay}
              className="min-h-11 cursor-pointer rounded-[13px] border border-white/14 bg-white/6 p-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10"
            >
              {t("keepWatchingNo")}
            </button>
            <button
              type="button"
              onClick={onKeep}
              className="bg-accent min-h-11 cursor-pointer rounded-[13px] p-3 font-sans text-[14px] font-semibold text-black hover:opacity-90"
            >
              {t("keepWatchingYes")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
