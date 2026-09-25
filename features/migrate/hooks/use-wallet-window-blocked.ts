"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getEmbeddedWallets } from "@/lib/user";
import { useFreshLegacySession } from "@/features/migrate/hooks/use-fresh-legacy-session";

// How long the wallet object may take to arrive after sign-in before the
// wallet window is judged blocked. Normally it lands within a second or two of
// the iframe initialising; a blocked iframe never lands at all. Generous,
// because the verdict shuts the flow: a restored session on a slow connection
// took longer than the eight seconds this used to allow, and the person was
// told their browser was blocking a window that was still loading.
const WALLET_WINDOW_GRACE_MS = 20_000;
// While overdue, how often to look again before deciding.
const WALLET_WINDOW_RECHECK_MS = 2_000;

/**
 * Is the provider's window on the page at all? A blocker that refuses the
 * iframe leaves no element behind, or one that never loads; a slow one is
 * simply there and not ready yet. Only the first is a block.
 */
function walletWindowPresent(): boolean {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll("iframe")).some((frame) =>
    /privy/iu.test(frame.getAttribute("src") ?? "")
  );
}

/**
 * Whether this browser is refusing to load Privy's wallet window.
 *
 * The tell: the user is signed in to the legacy account, the account has an
 * embedded wallet (its ADDRESS is on the user record the moment sign-in lands),
 * but the wallet OBJECT — which only exists once the iframe has initialised —
 * still has not arrived after the grace. Without this the no-signer screen
 * had only two explanations, "sign in" and "wrong account", and a blocked
 * browser was wrongly told it was on the wrong account.
 *
 * Detects the block BEFORE a sweep is attempted, so the user is told what is
 * wrong instead of finding out from a failed transfer.
 */
export function useWalletWindowBlocked(): boolean {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const fresh = useFreshLegacySession();

  const hasEmbedded = getEmbeddedWallets(user).length > 0;
  const arrived = wallets.some((w) => w.walletClientType === "privy");
  const pending = fresh && ready && authenticated && hasEmbedded && !arrived;

  // Overdue flips in a timer, never synchronously; and it is cleared the
  // moment the wallet arrives (adjusting state during render is the
  // documented pattern for that).
  const [overdue, setOverdue] = useState(false);
  if (!pending && overdue) setOverdue(false);
  useEffect(() => {
    if (!pending) return;
    let timer: ReturnType<typeof setTimeout>;
    // Past the grace, blocked only while the window is ABSENT: a window that
    // is on the page and not yet ready is looked at again, not condemned.
    const judge = () => {
      if (!walletWindowPresent()) {
        setOverdue(true);
        return;
      }
      timer = setTimeout(judge, WALLET_WINDOW_RECHECK_MS);
    };
    timer = setTimeout(judge, WALLET_WINDOW_GRACE_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  return pending && overdue;
}
