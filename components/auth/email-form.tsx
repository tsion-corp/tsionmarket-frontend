"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, WalletIcon } from "@/components/ui/icons";

export function EmailForm() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  const next = () => router.push("/interests");
  return (
    <div className="flex flex-col gap-[11px]">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="focus:border-accent/50 w-full rounded-[14px] border border-white/14 bg-black/40 px-4 py-3.5 text-[15px] text-white outline-none"
      />
      <button
        onClick={next}
        className="text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90"
      >
        Continue with email
        <ArrowRightIcon className="text-arrow" />
      </button>
      <button
        onClick={next}
        className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border border-white/14 bg-transparent p-[13px] font-sans text-sm font-medium text-white/90 transition-colors hover:border-white/28 hover:bg-white/6"
      >
        <WalletIcon className="text-accent" />
        Connect an existing wallet
      </button>
    </div>
  );
}
