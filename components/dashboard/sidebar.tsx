"use client";

import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { Avatar } from "@/components/dashboard/avatar";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";
import type { DashboardView } from "@/components/dashboard/modal-types";
import { DEMO_USER } from "@/lib/data/dashboard";

interface SidebarProps {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  onOpenAccount: () => void;
}

export function Sidebar({ view, onViewChange, onOpenAccount }: SidebarProps) {
  return (
    <aside className="bg-panel fixed top-0 bottom-0 left-0 z-[100] hidden w-[248px] flex-col border-r border-white/8 px-4 py-5 md:flex">
      <div className="px-2 pb-5">
        <Wordmark href="/dashboard" />
      </div>

      <nav className="flex flex-col gap-[3px]">
        {NAV_ITEMS.map((n) => {
          const active = view === n.key;
          const className = `flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-[11px] text-left font-sans text-[14.5px] font-medium transition-colors ${
            active
              ? "bg-accent/14 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.3)]"
              : "text-white/60 hover:bg-white/6 hover:text-white"
          }`;
          const content = (
            <>
              <span className="grid h-5 w-5 place-items-center">
                <n.icon size={20} />
              </span>
              <span className="flex-1">{n.label}</span>
              {n.badge ? (
                <span className="border-accent/35 bg-accent/16 text-accent rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.03em]">
                  {n.badge}
                </span>
              ) : null}
            </>
          );
          return n.href ? (
            <Link key={n.key} href={n.href} className={className}>
              {content}
            </Link>
          ) : (
            <button
              key={n.key}
              onClick={() => onViewChange(n.key as DashboardView)}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        <Link
          href="/rwa"
          className="border-accent/30 block rounded-2xl border bg-[linear-gradient(140deg,rgba(167,139,250,0.18),rgba(167,139,250,0.04))] p-4"
        >
          <div className="text-accent flex items-center gap-[7px] text-xs font-semibold">
            <span className="bg-accent h-1.5 w-1.5 rounded-full" />
            RWA · rwa.worldstreet.xyz
          </div>
          <div className="ws-serif mt-2 text-[19px] leading-[1.05]">Own the real world</div>
          <div className="mt-1.5 text-xs text-white/70">
            Tokenized stocks, T-bills, gold &amp; real estate →
          </div>
        </Link>
        <button
          onClick={onOpenAccount}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 px-2 py-2.5 text-left hover:bg-white/4"
        >
          <Avatar seed={DEMO_USER.address} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sans text-[13px] font-medium text-white">
              {DEMO_USER.name}
            </span>
            <span className="block text-[11px] text-white/50">{DEMO_USER.email}</span>
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
      </div>
    </aside>
  );
}
