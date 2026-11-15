"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useHasCustomWallet } from "@/hooks/use-has-custom-wallet";
import { walletSwitchEnabled } from "@/lib/signer/preference";
import { readUpgradeEnv, walletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { useDecaneAccount } from "../hooks/use-decane-account";
import { useMoveScan } from "../hooks/use-move-funds";
import { nothingToMove } from "../lib/move-funds";

/**
 * Tells someone, once they are signed in, that money is still in their legacy wallet and should
 * be moved to the new one; or, with no new wallet yet, that it is time to make one. Dismissible,
 * and back the next day while it is still true. Only reads; it moves nothing.
 */
const DAY = 24 * 60 * 60 * 1000;
const key = (uid: string) => `tsion.legacy-notice.v1.${uid}`;

function dismissedRecently(uid: string): boolean {
  try {
    const at = Number(window.localStorage.getItem(key(uid)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DAY;
  } catch {
    return false;
  }
}

export function LegacyFundsNotice() {
  const config = walletUpgradeConfig(readUpgradeEnv());
  const session = useAuthSession();
  const legacy = useDecaneAccount();
  const pathname = usePathname();
  const uid = session.userId;
  const hasNew = useHasCustomWallet(uid);
  const [hidden, setHidden] = useState(false);

  const scan = useMoveScan(
    { evm: legacy.evmAddress, solana: legacy.solanaAddress },
    config.moveFundsAvailable && hasNew && session.authenticated
  );

  const onOwnPage = pathname.startsWith("/upgrade") || pathname.startsWith("/legacy-wallet");
  if (
    !walletSwitchEnabled() ||
    !config.enabled ||
    !session.authenticated ||
    !uid ||
    hidden ||
    onOwnPage ||
    dismissedRecently(uid)
  ) {
    return null;
  }

  const fundsLeft = hasNew && scan.data !== undefined && !nothingToMove(scan.data.plan);
  const needsWallet = !hasNew && session.ready;
  if (!fundsLeft && !needsWallet) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(key(uid), String(Date.now()));
    } catch {
      // Without storage it is simply hidden until the next visit.
    }
    setHidden(true);
  };

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 left-4 z-[55] flex items-start gap-3 rounded-2xl border border-amber-300/30 bg-[#1b1608] p-4 text-[13.5px] text-amber-50 shadow-2xl sm:left-auto sm:max-w-[380px]"
    >
      <div className="flex-1">
        <p className="font-medium text-white">
          {fundsLeft ? "Move your funds to your new wallet" : "Upgrade to your new wallet"}
        </p>
        <p className="mt-1 text-amber-100/80">
          {fundsLeft
            ? "You still have funds in your legacy wallet. Move them across so they are in the wallet the app now uses."
            : "Make your new wallet, then move your funds across. It takes a few minutes."}
        </p>
        <Link
          href={fundsLeft ? "/legacy-wallet" : "/upgrade"}
          onClick={dismiss}
          className="mt-3 inline-block rounded-full bg-amber-200 px-4 py-1.5 text-[13px] font-semibold text-black"
        >
          {fundsLeft ? "Move my funds" : "Get started"}
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="cursor-pointer text-amber-100/60 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
