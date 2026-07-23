"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Wordmark } from "@/components/ui/wordmark";
import { Avatar } from "@/components/dashboard/avatar";
import type { NavItem } from "@/components/dashboard/nav-items";
import type { DashboardSection } from "@/components/dashboard/modal-types";
import { deriveProfile } from "@/lib/user";

interface SidebarProps {
  items: NavItem[];
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
  onOpenAccount: () => void;
}

export function Sidebar({ items, activeSection, onNavigate, onOpenAccount }: SidebarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  return (
    <aside className="bg-panel fixed top-0 bottom-0 left-0 z-[100] hidden w-[248px] flex-col border-r border-white/8 px-4 py-5 md:flex">
      <div className="px-2 pb-5">
        <Wordmark href="/dashboard" />
      </div>

      <nav className="flex flex-col gap-[3px]">
        {items.map((n) => {
          const active = activeSection === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onNavigate(n.id)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-[11px] text-left font-sans text-[14.5px] font-medium transition-colors ${
                active
                  ? "bg-accent/14 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.3)]"
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
        onClick={onOpenAccount}
        className="mt-auto flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 px-2 py-2.5 text-left hover:bg-white/4"
      >
        <Avatar seed={profile.avatarSeed} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[13px] font-medium text-white">
            {profile.name}
          </span>
          <span className="block truncate text-xs font-normal text-white/50">{profile.email}</span>
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
  );
}
