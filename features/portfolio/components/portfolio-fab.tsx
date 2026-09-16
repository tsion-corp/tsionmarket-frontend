"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WalletIcon, ArrowUpRightIcon } from "@/components/ui/icons";

/**
 * Global floating quick-action button — mobile only.
 *
 * Lives in DashboardShell so it appears on every page. Sits on the left edge
 * (above the tab bar) to stay clear of the support button, which owns the
 * right corner. Tapping the + opens a two-item speed dial; tapping an item
 * closes the dial before the modal opens so scrim and sheet never overlap.
 */
export function PortfolioFab({
  onOpenFunds,
  onOpenWithdraw,
}: {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
}) {
  const t = useTranslations("balance");
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Full-screen scrim — dismisses the dial on tap-outside. It has to
          outrank the chrome it is dimming: the tab bar sits at z-90 and the
          support launcher at z-80, and under those the dial dimmed the page
          while leaving both lit and tappable, so a tap meant to dismiss
          navigated instead and the open dial followed the user to the next
          page. Still under the support chat panel (95) and every modal (300). */}
      <div
        aria-hidden
        data-testid="fab-scrim"
        className={
          "fixed inset-0 z-[91] bg-black/55 backdrop-blur-[3px] md:hidden " +
          "transition-opacity duration-200 " +
          (open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={() => setOpen(false)}
      />

      {/* Column — FAB at bottom, dial items stack above it */}
      <div
        className={
          "fixed left-4 z-[92] flex flex-col items-start gap-3 md:hidden " +
          "bottom-[calc(96px+env(safe-area-inset-bottom))]"
        }
      >
        {/* Withdraw — farther from FAB */}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenWithdraw();
          }}
          className={
            "flex items-center gap-2.5 " +
            "transition-all delay-[60ms] duration-200 " +
            (open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-3 opacity-0")
          }
        >
          <span
            className={
              "grid size-[52px] shrink-0 place-items-center rounded-full " +
              "border border-white/20 bg-[rgba(10,11,14,0.72)] " +
              "text-white backdrop-blur-[10px] " +
              "shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
            }
          >
            <ArrowUpRightIcon size={19} />
          </span>
          <span className="font-sans text-[14px] font-semibold whitespace-nowrap text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {t("withdraw")}
          </span>
        </button>

        {/* Add funds — closer to FAB */}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenFunds();
          }}
          className={
            "flex items-center gap-2.5 " +
            "transition-all delay-[30ms] duration-200 " +
            (open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-3 opacity-0")
          }
        >
          <span
            className={
              "grid size-[52px] shrink-0 place-items-center rounded-full " +
              "border border-white/20 bg-[rgba(10,11,14,0.72)] " +
              "text-white backdrop-blur-[10px] " +
              "shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
            }
          >
            <WalletIcon size={19} />
          </span>
          <span className="font-sans text-[14px] font-semibold whitespace-nowrap text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {t("addFunds")}
          </span>
        </button>

        {/* Main FAB — + spins to × */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? t("closeQuickActions") : t("quickActions")}
          aria-expanded={open}
          className={
            "grid size-[56px] place-items-center rounded-full " +
            "border border-white/[0.18] bg-[rgba(10,11,14,0.78)] " +
            "backdrop-blur-[12px] " +
            "shadow-[0_8px_40px_-4px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)] " +
            "transition-transform duration-150 hover:scale-105 active:scale-95 " +
            "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
          }
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className={
              "h-[26px] w-[26px] text-white transition-transform duration-300 " +
              "ease-[cubic-bezier(0.34,1.56,0.64,1)] " +
              (open ? "rotate-45" : "rotate-0")
            }
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </>
  );
}
