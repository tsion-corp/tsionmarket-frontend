"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useCustomWallet } from "@/hooks/use-custom-wallet";
import { onWalletUnlockRequested } from "@/lib/signer/unlock-request";

// Loaded only when the button is pressed: it carries the wallet's crypto, which the
// first paint of every page must not pay for.
const UnlockWalletModal = dynamic(
  () =>
    import("@/features/wallet-upgrade/components/unlock-wallet-modal").then(
      (m) => m.UnlockWalletModal
    ),
  { ssr: false }
);

/**
 * Shown across the app when the new wallet is the one in use but is locked: it cannot
 * sign until the person unlocks it, and only they can. Nothing at all when the switch is
 * off or the account still uses Decane. The button opens an unlock sheet in place.
 */
export function CustomWalletBanner() {
  const custom = useCustomWallet();
  const pathname = usePathname();
  const { userId } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Other screens (Add WSK, say) can ask for the unlock sheet without leaving where they are.
  useEffect(
    () =>
      onWalletUnlockRequested(() => {
        setMounted(true);
        setOpen(true);
      }),
    []
  );
  if (custom.status !== "locked" || pathname.startsWith("/upgrade")) return null;
  return (
    <>
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-[13px] font-medium text-black"
      >
        Your new wallet is locked.
        <button
          type="button"
          className="rounded-full bg-black px-3 py-1 text-amber-200"
          onClick={() => {
            setMounted(true);
            setOpen(true);
          }}
        >
          Unlock it
        </button>
      </div>
      {mounted && userId ? (
        <UnlockWalletModal open={open} onClose={() => setOpen(false)} uid={userId} />
      ) : null}
    </>
  );
}
