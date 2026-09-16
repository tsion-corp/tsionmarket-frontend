"use client";

import { useState, type ReactNode } from "react";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { ModalShell } from "@/components/ui/modal-shell";
import { HoldingsModal } from "@/features/portfolio/components/holdings-modal";

// The holdings list behind the coins button on both balance cards, and the
// buy and sell stack it hands assets to. Nothing here mounts until the button
// is pressed for the first time: the cards are on the dashboard's first paint,
// and neither a second portfolio query nor the trade sheets belong in that
// load. Shared by the phone and desktop cards so the two cannot drift.
export function useHoldingsLauncher(): {
  open: boolean;
  openHoldings: () => void;
  /** The modal and the sheets behind it; render inside the card root. */
  host: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const modals = useAppModals();

  const openHoldings = () => {
    setMounted(true);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const host = mounted ? (
    <>
      {/* Wider than the standard 440px sheet: a holdings row carries a
          symbol, a network line and a value, and at the default width the
          three were fighting for the same inches. On a phone the shell is
          full width regardless. */}
      <ModalShell open={open} onClose={close} panelClassName="md:w-[min(760px,100%)]">
        <HoldingsModal
          onClose={close}
          onOpenDetail={modals.openDetail}
          onOpenBuy={modals.openBuy}
          onOpenSell={modals.openSell}
          onOpenRwaTrade={modals.openRwaTrade}
          onOpenMemeSell={modals.openMemeSell}
          onAddFunds={() => {
            close();
            modals.openFunds();
          }}
        />
      </ModalShell>

      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </>
  ) : null;

  return { open, openHoldings, host };
}
