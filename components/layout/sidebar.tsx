"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MarketLogo } from "@/components/ui/market-logo";
import { AccountAvatar } from "@/components/ui/account-avatar";
import type { NavItem } from "@/components/layout/nav-items";
import type { DashboardSection } from "@/lib/modal-types";
import { truncateAddress } from "@/lib/format";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSignedIn } from "@/hooks/use-signed-in";
import { SignInButton } from "@/components/auth/sign-in-button";
import { useDisplayName } from "@/hooks/use-display-name";
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
  const { profile, evmAddress: address } = useAuthSession();
  const signedIn = useSignedIn();
  const displayName = useDisplayName();
  const t = useTranslations("topbar");

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

        {/* Short viewports, a phone in landscape or 150% zoom on a laptop, leave
            the rail taller than the screen. The nav list is the part that
            scrolls, so the logo above it and the account footer below it stay
            put and the footer stays reachable. min-h-0 is what lets it shrink
            below its content inside the flex column; without it the overflow
            lands back on the rail, which does not scroll. */}
        <nav className="flex min-h-0 flex-col gap-[3px] overflow-x-hidden overflow-y-auto">
          {items.map(renderItem)}
        </nav>

        <div className="relative mt-auto shrink-0">
          {/* Nothing while the session is starting, so Sign in doesn't flash. */}
          {signedIn === "no" ? <SignInButton variant="rail" /> : null}
          {signedIn === "unknown" ? <div className="h-[54px]" aria-hidden /> : null}
          {signedIn === "yes" ? (
            <button
              ref={profileButtonRef}
              type="button"
              data-tour="profile"
              aria-haspopup="menu"
              aria-expanded={accountPopoverOpen}
              onClick={() => setAccountPopoverOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 px-2 py-2.5 text-left transition-colors hover:bg-white/4"
            >
              <AccountAvatar seed={address ?? ""} name={profile.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-[13px] font-medium text-white">
                  {displayName}
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
          ) : null}

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
