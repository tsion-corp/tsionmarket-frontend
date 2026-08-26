"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MarketLogo } from "@/components/ui/market-logo";
import { Avatar } from "@/components/ui/avatar";
import type { NavItem } from "@/components/layout/nav-items";
import type { DashboardSection } from "@/lib/modal-types";
import { deriveProfile } from "@/lib/user";
import { GoLiveControl } from "@/components/broadcast/go-live-control";

interface SidebarProps {
  items: NavItem[];
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
  onOpenAccount: () => void;
  /** Phone drawer state. Ignored from `md` up, where the sidebar is always shown. */
  open: boolean;
  onClose: () => void;
}

// The app's left rail. From `md` up it is fixed and always visible. On a phone
// it is a drawer: off-canvas until the topbar's menu button opens it, then it
// slides in over a dimmed page with the logo at its top, and closes on a
// choice, on the backdrop, on Escape, or on its own close button. One
// component for both, so the nav can never differ between the two.
export function Sidebar({
  items,
  activeSection,
  onNavigate,
  onOpenAccount,
  open,
  onClose,
}: SidebarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  const t = useTranslations("topbar");

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
        className={`bg-panel fixed top-0 bottom-0 left-0 z-[110] flex w-[280px] flex-col border-r border-white/8 px-4 py-5 transition-transform duration-300 ease-out md:z-100 md:w-[248px] md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-5">
          {/* The dashboard alone wears the mARKet lockup: the two-tone only
              reads on this dark chrome, so auth and the landing keep the Ark
              wordmark. */}
          <Link href="/dashboard" onClick={onClose} className="flex items-center">
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
        <div className="pb-3">
          <GoLiveControl variant="rail" />
        </div>
        <div className="mb-3 h-px bg-white/8" />

        <nav className="flex flex-col gap-[3px]">
          {items.map((n) => {
            const active = activeSection === n.id;
            return (
              <button
                key={n.id}
                data-tour-nav={n.id}
                onClick={() => choose(n.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-[11px] text-left font-sans text-[14.5px] font-medium transition-colors ${
                  active
                    ? "bg-accent/14 shadow-[inset_0_0_0_1px_rgba(255, 255, 255, 0.3)] text-white"
                    : "text-white/60 hover:bg-white/6 hover:text-white"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center">
                  <n.icon size={20} />
                </span>
                <span className="flex-1">{n.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          data-tour="profile"
          onClick={() => {
            onOpenAccount();
            onClose();
          }}
          className="mt-auto flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 px-2 py-2.5 text-left hover:bg-white/4"
        >
          <Avatar seed={profile.avatarSeed} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sans text-[13px] font-medium text-white">
              {profile.name}
            </span>
            <span className="block truncate text-xs font-normal text-white/50">
              {profile.email}
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
      </aside>
    </>
  );
}
