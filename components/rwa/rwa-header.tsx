"use client";

import { Wordmark } from "@/components/ui/wordmark";
import { SearchIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/dashboard/avatar";
import { DEMO_USER } from "@/lib/data/dashboard";

interface RwaHeaderProps {
  onOpenFunds: () => void;
  onOpenAccount: () => void;
}

export function RwaHeader({ onOpenFunds, onOpenAccount }: RwaHeaderProps) {
  return (
    <header className="sticky top-0 z-[60] flex items-center gap-4 border-b border-white/7 bg-black/70 px-4 py-3.5 backdrop-blur-[14px] sm:px-6">
      <Wordmark href="/dashboard" suffix="RWA" size="sm" />
      <div className="ml-3.5 hidden max-w-[360px] flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-[9px] md:flex">
        <SearchIcon size={15} />
        <input
          placeholder="Search assets"
          className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] text-white outline-none"
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
          className="inline-flex cursor-pointer items-center gap-[9px] rounded-full border border-white/10 bg-white/5 p-[5px] hover:bg-white/8 sm:pr-[13px]"
        >
          <Avatar seed={DEMO_USER.address} size={26} />
          <span className="hidden font-sans text-[13px] font-medium text-white sm:inline">
            {DEMO_USER.name}
          </span>
        </button>
      </div>
    </header>
  );
}
