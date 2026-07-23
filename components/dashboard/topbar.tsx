"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { SearchIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/dashboard/avatar";
import { deriveProfile } from "@/lib/user";

interface TopbarProps {
  onOpenAccount: () => void;
}

export function Topbar({ onOpenAccount }: TopbarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  return (
    <div className="flex items-center gap-3 border-b border-white/7 bg-black/70 px-4 py-3.5 backdrop-blur-[14px] sm:px-5">
      <Link href="/dashboard" className="flex items-center text-white md:hidden">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-white/18 bg-white/8">
          <span className="ws-serif text-accent text-[19px] leading-none">w</span>
        </span>
      </Link>
      <div className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
        <SearchIcon />
        <input
          placeholder="Search assets, markets, tickers"
          className="min-w-0 flex-1 border-none bg-transparent text-sm font-normal text-white outline-none"
        />
      </div>
      <button
        onClick={onOpenAccount}
        aria-label="Account"
        className="ml-auto cursor-pointer rounded-full border border-white/14 md:hidden"
      >
        <Avatar seed={profile.avatarSeed} size={34} />
      </button>
    </div>
  );
}
