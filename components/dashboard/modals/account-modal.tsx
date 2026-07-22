"use client";

import Link from "next/link";
import { Avatar } from "@/components/dashboard/avatar";
import { GridIcon, HelpIcon, SettingsIcon, SignOutIcon } from "@/components/ui/icons";
import { DEMO_USER } from "@/lib/data/dashboard";

interface AccountModalProps {
  onPortfolio: () => void;
  onClose: () => void;
}

export function AccountModal({ onPortfolio, onClose }: AccountModalProps) {
  const item =
    "flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-3 font-sans text-[14.5px] font-medium hover:bg-white/8 transition-colors cursor-pointer w-full text-left";
  return (
    <div>
      <div className="flex items-center gap-[13px]">
        <Avatar seed={DEMO_USER.address} size={46} />
        <div>
          <div className="ws-serif text-[21px]">{DEMO_USER.name}</div>
          <div className="text-[12.5px] text-white/50">{DEMO_USER.email}</div>
        </div>
      </div>
      <div className="mt-[18px] flex flex-col gap-1.5">
        <button onClick={onPortfolio} className={`${item} text-white`}>
          <GridIcon size={20} />
          Portfolio
        </button>
        <button onClick={onClose} className={`${item} text-white`}>
          <SettingsIcon size={20} />
          Settings
        </button>
        <button onClick={onClose} className={`${item} text-white`}>
          <HelpIcon size={20} />
          Help &amp; support
        </button>
        <Link href="/auth" className={`${item} text-down`}>
          <SignOutIcon size={20} />
          Sign out
        </Link>
      </div>
    </div>
  );
}
