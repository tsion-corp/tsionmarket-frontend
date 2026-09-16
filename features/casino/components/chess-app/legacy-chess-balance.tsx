"use client";

import { useState } from "react";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { useMoney } from "@/components/ui/currency-select";
import { ModalShell } from "@/components/ui/modal-shell";
import { SheetNav } from "@/components/ui/sheet-nav";
import { useChessCashierWithdrawal } from "@/features/casino/hooks/use-chess-cashier";
import { hasPositiveUsdc } from "@/features/casino/lib/api/cashier";
import {
  CHESS_MODAL_CLOSE_BUTTON_CLASS,
  CHESS_MODAL_PANEL_CLASS,
  CHESS_PRIMARY_BUTTON_CLASS,
} from "@/features/casino/lib/chess/ui";
import { usePortfolio } from "@/hooks/use-portfolio";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import styles from "./chess-profile-balance.module.css";

export function LegacyChessBalance() {
  const cashier = useChessCashierWithdrawal();
  const portfolio = usePortfolio({ scope: "base" });
  const money = useMoney();
  const { mask } = useBalanceVisibility();
  const [open, setOpen] = useState(false);

  if (!cashier.configured || !hasPositiveUsdc(cashier.total)) return null;

  const displayBalance = mask(money.format(Number(cashier.total)));
  const canMove = hasPositiveUsdc(cashier.available) && !cashier.withdrawing;

  const moveToProfile = async () => {
    const amount = cashier.available;
    if (!canMove) return;

    const toastId = toast.loading("Moving in-play balance to your profile...");
    try {
      await cashier.withdraw(amount);
      toast.success(`${amount} USD is moving to your profile.`, {
        id: toastId,
        sensitive: true,
      });
      setOpen(false);
      // The cashier returns as soon as the sponsored call is durable. Keep
      // bypassing the portfolio cache until the confirmed USDC transfer is
      // indexed instead of racing it with a single immediate refresh.
      void portfolio.refetchUntilChanged(["base-mainnet"]);
    } catch (error) {
      toast.error(friendlyError(error, "Could not move the in-play balance."), {
        id: toastId,
      });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${styles.legacyAction} flex h-10 min-w-[104px] shrink-0 items-center justify-end rounded-[10px] border border-amber-300/20 bg-amber-300/[0.07] px-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:border-amber-300/35 hover:bg-amber-300/[0.11]`}
        aria-label={`Legacy in-play balance ${displayBalance}. Move to profile`}
        data-sensitive="balance"
      >
        <span>
          <span className="block text-[8px] leading-none font-bold tracking-[0.11em] text-amber-100/45 uppercase">
            In play
          </span>
          <span className="tnum mt-1 block text-[12px] leading-none font-semibold text-amber-50/90">
            {displayBalance}
          </span>
        </span>
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        contentKey="legacy-chess-balance"
        panelClassName={CHESS_MODAL_PANEL_CLASS}
        closeButtonClassName={CHESS_MODAL_CLOSE_BUTTON_CLASS}
      >
        <div>
          <SheetNav
            title="Move to profile"
            subtitle="Move your legacy in-play funds back to your profile balance."
            onBack={() => setOpen(false)}
          />

          <div className="ws-inset mt-1 flex items-center justify-between px-4 py-3.5">
            <span className="text-[13px] font-normal text-white/55">Available to move</span>
            <span
              className="ws-display tnum text-[18px] text-white"
              data-sensitive="balance"
            >
              {cashier.available} USD
            </span>
          </div>

          {hasPositiveUsdc(cashier.locked) ? (
            <p className="mt-3 text-[12.5px] leading-normal text-white/55">
              {cashier.locked} USD is still locked and will become movable after it is released.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void moveToProfile()}
            disabled={!canMove}
            className={`${CHESS_PRIMARY_BUTTON_CLASS} mt-[18px] w-full rounded-[14px] p-3.5 font-sans text-[15px] font-semibold`}
          >
            {cashier.withdrawing
              ? "Moving to profile..."
              : canMove
                ? `Move ${cashier.available} USD to profile`
                : "Funds are still locked"}
          </button>

          {cashier.config?.withdrawalFeeBps ? (
            <p className="mt-3 text-center text-[11.5px] text-white/45">
              A {cashier.config.withdrawalFeeBps / 100}% withdrawal fee applies.
            </p>
          ) : null}
        </div>
      </ModalShell>
    </>
  );
}
