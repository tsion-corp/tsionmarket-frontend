"use client";

import Link from "next/link";
import { SearchIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/dashboard/avatar";
import { DEMO_USER } from "@/lib/data/dashboard";

interface TopbarProps {
  onOpenFunds: () => void;
  onOpenAccount: () => void;
}

export function Topbar({ onOpenFunds, onOpenAccount }: TopbarProps) {
  return (
    <div className="sticky top-0 z-[60] flex items-center gap-3 border-b border-white/7 bg-black/70 px-4 py-3.5 backdrop-blur-[14px] sm:px-5">
      <Link href="/dashboard" className="flex items-center text-white md:hidden">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-white/18 bg-white/8">
          <span className="ws-serif text-accent text-[19px] leading-none">w</span>
        </span>
      </Link>
      <div className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
        <SearchIcon />
        <input
          placeholder="Search assets, markets, tickers"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none"
        />
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={onOpenFunds}
          className="border-accent/28 bg-accent/12 hover:bg-accent/18 inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-[9px] font-sans text-[13px] font-medium text-white"
        >
          <span className="ws-serif text-accent text-[15px]">₦</span>
          <span className="hidden sm:inline">Add funds</span>
        </button>
        <button
          onClick={onOpenAccount}
          aria-label="Account"
          className="cursor-pointer rounded-full border border-white/14 md:hidden"
        >
          <Avatar seed={DEMO_USER.address} size={34} />
        </button>
      </div>
    </div>
  );
}
