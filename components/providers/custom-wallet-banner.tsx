"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCustomWallet } from "@/hooks/use-custom-wallet";

/**
 * Shown across the app when the new wallet is the one in use but is locked: it cannot
 * sign until the person unlocks it, and only they can. Nothing at all when the switch is
 * off or the account still uses Decane.
 */
export function CustomWalletBanner() {
  const custom = useCustomWallet();
  const pathname = usePathname();
  if (custom.status !== "locked" || pathname.startsWith("/upgrade")) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-[13px] font-medium text-black"
    >
      Your new wallet is locked.
      <Link href="/upgrade" className="rounded-full bg-black px-3 py-1 text-amber-200">
        Unlock it
      </Link>
    </div>
  );
}
