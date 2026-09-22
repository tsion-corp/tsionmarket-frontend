"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MarketLogo } from "@/components/ui/market-logo";
import { SquareAvatar } from "@/components/ui/square-avatar";
import { useSquareAvatar } from "@/hooks/use-square-avatar";
import type { NavItem } from "@/components/layout/nav-items";
import type { DashboardSection } from "@/lib/modal-types";
import { deriveProfile } from "@/lib/user";
import { GoLiveControl } from "@/components/broadcast/go-live-control";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";
import { SQUARE_ZONE_PATH } from "@/lib/square-zone";
import { AccountPopover } from "@/components/layout/account-popover";

interface SidebarProps {
  items: NavItem[];
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
  /** Phone drawer state. Ignored from `md` up, where the sidebar is always shown. */
  open: boolean;
  onClose: () => void;
}

// The app's left rail. From `md` up it is fixed and always visible. On a phone
// it is a drawer: off-canvas until the topbar's menu button opens it, then it
// slides in over a dimmed page with the logo at its top, and closes on a
// choice, on the backdrop, on Escape, or on its own close button. One
// component for both, so the nav can never differ between the two.
export function Sidebar({ items, activeSection, onNavigate, open, onClose }: SidebarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  const squareAvatar = useSquareAvatar();
  // The footer's second line is the wallet, not the email: the topbar shows
  // the same address on the same screen, and an email is blank for anyone who
  // signed in with a wallet or a phone number.
  const t = useTranslations("topbar");
  // The square is a product with its own catalog namespace, so the rail reads
  // its name from there rather than repeating the string. The rail's word is
  // "Square" (asked for 2026-09-12); the page keeps the fuller title.
  const tSquare = useTranslations("square");
  // This reads MARKET_SQUARE_HIDDEN, the way-in switch, and nothing else. A
  // hidden square (no URL, or an operator takedown) has no page to open, so
  // the entry goes with it. What the portfolio renders of the square is
  // SQUARE_SECTIONS_HIDDEN's question, and the rail must not read it: the
  // entry stands while those sections are off.
  const squareShown = !MARKET_SQUARE_HIDDEN;

  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  // While the drawer is open the page behind it does not scroll, and Escape
  // closes it. Both undone on close and on unmount.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const choose = (id: DashboardSection) => {
    onNavigate(id);
    onClose();
  };

  const renderItem = (n: NavItem) => {
    const active = activeSection === n.id;
    return (
      <button
        key={n.id}
        data-tour-nav={n.id}
        onClick={() => choose(n.id)}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-[11px] text-left font-sans text-[14.5px] font-medium transition-colors ${
          active ? "bg-accent/14 text-white" : "text-white/60 hover:bg-white/6 hover:text-white"
        }`}
      >
        <span className="grid h-5 w-5 place-items-center">
          <n.icon size={20} />
        </span>
        <span className="flex-1">{n.label}</span>
      </button>
    );
  };

  // The design seats the square between Prediction and Arkade. Anchoring it to
  // the Arkade entry keeps that relationship when an onboarding interest
  // reorders the sections; with no Arkade entry it falls to the end of the rail.
  const arkadeIndex = items.findIndex((n) => n.id === "casino");
  const squareIndex = arkadeIndex === -1 ? items.length : arkadeIndex;

  return (
    <>
      {/* The dimmed page behind the phone drawer. */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-[105] bg-black/60 backdrop-blur-[3px] transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        id="app-sidebar"
        aria-label={t("menu")}
        className={`bg-panel fixed top-0 bottom-0 left-[var(--ws-frame-inset)] z-[110] flex w-[280px] flex-col border-r border-white/8 px-4 py-5 transition-transform duration-300 ease-out md:z-100 md:w-[248px] md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-2 pb-5">
          {/* The dashboard alone wears the mARKet lockup: the two-tone only
              reads on this dark chrome, so auth and the landing keep the Ark
              wordmark. */}
          <Link href="/portfolio" onClick={onClose} className="flex items-center">
            <MarketLogo className="h-[21px] w-auto" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* M3 puts the rail's primary action at the top, above a divider.
            Never a floating overlay on desktop. */}
        <div className="shrink-0 pb-3">
          <GoLiveControl variant="rail" />
        </div>
        <div className="mb-3 h-px shrink-0 bg-white/8" />

        {/* Short viewports, a phone in landscape or 150% zoom on a laptop, leave
            the rail taller than the screen. The nav list is the part that
            scrolls, so the logo above it and the account footer below it stay
            put and the footer stays reachable. min-h-0 is what lets it shrink
            below its content inside the flex column; without it the overflow
            lands back on the rail, which does not scroll. */}
        <nav className="flex min-h-0 flex-col gap-[3px] overflow-x-hidden overflow-y-auto">
          {items.slice(0, squareIndex).map(renderItem)}

          {/* Market Square lives at /square, and the design gives it an
              ordinary rail row between Prediction and Arkade. /square is the
              Square's OWN app (a Next.js Multi-Zone, lib/square-zone), so this
              is a plain anchor — a full page load — not a next/link, which
              would ask this build for a route it no longer has. The square is
              not in the reorderable section list, so it is seated here by
              hand. With the square hidden it renders nothing rather than a
              dead entry, and
              MARKET_SQUARE_HIDDEN in lib/market-square.ts is the off switch.
              It is not affected by SQUARE_SECTIONS_HIDDEN, which only governs
              the square's sections on the portfolio. */}
          {squareShown ? (
            <a
              href={SQUARE_ZONE_PATH}
              onClick={onClose}
              data-tour-nav="square"
              className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-[11px] text-left font-sans text-[14.5px] font-medium transition-colors ${
                activeSection === "square"
                  ? "bg-accent/14 text-white"
                  : "text-white/60 hover:bg-white/6 hover:text-white"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/nav/market-square.svg"
                  alt=""
                  width={17}
                  height={13}
                  className="h-[12.74px] w-[17.12px]"
                />
              </span>
              <span className="flex-1">{tSquare("navLabel")}</span>
            </a>
          ) : null}

          {items.slice(squareIndex).map(renderItem)}
        </nav>

        <div className="relative mt-auto shrink-0">
          <button
            ref={profileButtonRef}
            type="button"
            data-tour="profile"
            aria-haspopup="menu"
            aria-expanded={accountPopoverOpen}
            onClick={() => setAccountPopoverOpen((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 px-2 py-2.5 text-left transition-colors hover:bg-white/4"
          >
            <SquareAvatar src={squareAvatar} seed={user?.id ?? ""} name={profile.name} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-[13px] font-medium text-white">
                {profile.name}
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 9l4-4 4 4M8 15l4 4 4-4"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Always mounted: AccountPopover plays its own exit animation off
              the `open` prop, and unmounting it here would skip straight past
              that closing frame. */}
          <AccountPopover
            open={accountPopoverOpen}
            onClose={() => setAccountPopoverOpen(false)}
            triggerRef={profileButtonRef}
          />
        </div>
      </aside>
    </>
  );
}
