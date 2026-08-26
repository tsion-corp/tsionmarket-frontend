"use client";

// Bridges Privy's modal state into the broadcast session.
//
// Privy's dialog is where wallet export, recovery phrases, private-key reveal
// and MFA enrolment live. It is the exact case the financial-data guard exists
// for, and it renders through a portal into document.body, so there is no
// element of ours to wrap.
//
// `useModalStatus` is Privy's own public, typed, documented hook. Preferring it
// over matching `#privy-dialog` in the DOM is deliberate: an id inside a
// third-party bundle can be renamed by a patch release and the guard would go
// on looking correct while protecting nothing. A typed import cannot fail
// quietly — if Privy removes or renames the hook, `pnpm typecheck` fails and
// the build stops.
//
// ON ANY PRIVY VERSION BUMP, re-test this: start a broadcast, open Privy's
// wallet-export dialog, and confirm the live bar reads "Paused — sensitive
// screen" and the outgoing video is held. The DOM check below reports a
// disagreement between the two signals in development, which is the tripwire
// for Privy changing the meaning of `isOpen` rather than its name.
//
// Mounted separately from the session provider so the session does not depend
// on Privy: a tree without PrivyProvider (a unit test, a public page) simply
// does not mount this, and the DOM fallback inside the session still applies.

import { useEffect, useRef } from "react";
import { useModalStatus } from "@privy-io/react-auth";
import { useBroadcastSession } from "@/components/broadcast/broadcast-session";
import { PRIVY_DIALOG_SELECTOR } from "@/lib/broadcast/sensitive";

export function PrivyModalWatch() {
  const { isOpen } = useModalStatus();
  const session = useBroadcastSession();
  const setPrivyModalOpen = session.setPrivyModalOpen;
  const warned = useRef(false);

  useEffect(() => {
    setPrivyModalOpen(isOpen);
  }, [isOpen, setPrivyModalOpen]);

  // The tripwire. If Privy's hook and Privy's own dialog markup ever disagree,
  // one of the two signals has changed meaning and this guard needs re-testing
  // before it is trusted again. Development only: it is a message to whoever
  // bumped the dependency, not to a user.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || warned.current) return;
    // After paint, so the portal has had a chance to mount its dialog.
    const check = setTimeout(() => {
      const inDom = document.querySelector(PRIVY_DIALOG_SELECTOR) !== null;
      if (inDom === isOpen) return;
      warned.current = true;
      console.warn(
        `[broadcast guard] Privy's useModalStatus() says isOpen=${isOpen}, but ` +
          `${PRIVY_DIALOG_SELECTOR} ${inDom ? "IS" : "is NOT"} in the DOM. One of the two ` +
          "signals has changed meaning in @privy-io/react-auth. The broadcast guard " +
          "suspends video while Privy's wallet dialog is open (key export, recovery " +
          "phrase, MFA); re-test that path before trusting it, in " +
          "components/broadcast/privy-modal-watch.tsx."
      );
    }, 150);
    return () => clearTimeout(check);
  }, [isOpen]);

  return null;
}
