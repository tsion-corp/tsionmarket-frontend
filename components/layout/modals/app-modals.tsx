"use client";

import { useCallback, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
// Dynamic: DetailModal pulls lightweight-charts (~168KB) through AssetChart,
// and it only renders once a detail view is actually opened. Imported
// statically it shipped in the initial payload of every route that mounts this
// host, none of which draws a chart on load.
const DetailModal = dynamic(
  () => import("@/components/layout/modals/detail-modal").then((m) => m.DetailModal),
  { ssr: false }
);
import { ConfirmModal } from "@/components/layout/modals/confirm-modal";
import { AccountModal } from "@/components/layout/modals/account-modal";
import { FundsModal, WithdrawModal } from "@/features/funds";
import { BuySheet, SellSheet, MemeTradeSheet } from "@/features/trade";
import { RwaTradeModal } from "@/features/rwa";
import type { DepositPrefill } from "@/lib/voice/intent";
import type { MemeToken } from "@/lib/meme/api";
import type {
  BuyPayload,
  ConfirmPayload,
  DashboardModal,
  DetailPayload,
  RwaTradePayload,
  SellPayload,
} from "@/lib/modal-types";
import dynamic from "next/dynamic";

export interface AppModals {
  modal: DashboardModal;
  close: () => void;
  openDetail: (detail: DetailPayload) => void;
  openConfirm: (confirm: ConfirmPayload) => void;
  openBuy: (buy: BuyPayload) => void;
  openSell: (sell: SellPayload) => void;
  openMemeSell: (token: MemeToken) => void;
  openRwaTrade: (trade: RwaTradePayload) => void;
  /**
   * Takes no argument, deliberately.
   *
   * Callers hand this straight to `onClick`, which would otherwise pass the
   * click event as the prefill — and TypeScript permits it, since a function
   * with an optional parameter satisfies a `() => void` prop. A spoken deposit
   * uses openDeposit instead.
   */
  openFunds: () => void;
  /** Funding with the chain and token already chosen, for a spoken deposit. */
  openDeposit: (deposit: DepositPrefill) => void;
  openWithdraw: () => void;
  showDone: (title: string, msg: string) => void;
}

// The sheet stack every market screen needs. It lives here rather than in
// /dashboard because the dashboard is no longer the only page that opens a buy
// sheet: each service page does too, and four copies of this wiring would drift
// apart the first time a payload gained a field.
//
// Every opener keeps a stable identity so a page can hand them to memoized
// section components without re-rendering them on each modal change.
export function useAppModals(): AppModals {
  const [modal, setModal] = useState<DashboardModal>(null);

  return {
    modal,
    close: useCallback(() => setModal(null), []),
    openDetail: useCallback((detail: DetailPayload) => setModal({ type: "detail", detail }), []),
    openConfirm: useCallback(
      (confirm: ConfirmPayload) => setModal({ type: "confirm", confirm }),
      []
    ),
    openBuy: useCallback((buy: BuyPayload) => setModal({ type: "buy", buy }), []),
    openSell: useCallback((sell: SellPayload) => setModal({ type: "sell", sell }), []),
    openMemeSell: useCallback(
      (memeSell: MemeToken) => setModal({ type: "memeSell", memeSell }),
      []
    ),
    openRwaTrade: useCallback(
      (rwaTrade: RwaTradePayload) => setModal({ type: "rwaTrade", rwaTrade }),
      []
    ),
    openFunds: useCallback(() => setModal({ type: "funds" }), []),
    openDeposit: useCallback((deposit: DepositPrefill) => setModal({ type: "funds", deposit }), []),
    openWithdraw: useCallback(() => setModal({ type: "withdraw" }), []),
    showDone: useCallback(
      (title: string, msg: string) => setModal({ type: "done", title, msg }),
      []
    ),
  };
}

interface AppModalHostProps {
  /** What to show. A page may pass something other than `modals.modal` when a
   *  URL has staged a sheet the user has not opened by hand. */
  active: DashboardModal;
  onClose: () => void;
  /** Where a confirm lands once accepted. */
  onConfirmed: (title: string, msg: string) => void;
}

// Renders whichever sheet is active. Openness is derived from `active`, not
// from the hook's own state, so a URL-staged sheet actually appears.
export function AppModalHost({ active, onClose, onConfirmed }: AppModalHostProps) {
  return (
    <ModalShell
      open={active !== null}
      onClose={onClose}
      contentKey={active?.type ?? "none"}
      size={active?.type === "funds" || active?.type === "withdraw" ? "lg" : "md"}
    >
      {active?.type === "detail" ? <DetailModal detail={active.detail} /> : null}
      {active?.type === "confirm" ? (
        <ConfirmModal
          confirm={active.confirm}
          onConfirm={() => onConfirmed(active.confirm.successTitle, active.confirm.successMsg)}
        />
      ) : null}
      {active?.type === "buy" ? <BuySheet payload={active.buy} onClose={onClose} /> : null}
      {active?.type === "sell" ? <SellSheet payload={active.sell} onClose={onClose} /> : null}
      {active?.type === "memeSell" ? (
        <MemeTradeSheet
          token={active.memeSell}
          defaultSide="SELL"
          onClose={onClose}
          showRisk={false}
        />
      ) : null}
      {active?.type === "rwaTrade" ? (
        <RwaTradeModal payload={active.rwaTrade} onContinueInBackground={onClose} />
      ) : null}
      {active?.type === "funds" ? <FundsModal onClose={onClose} deposit={active.deposit} /> : null}
      {active?.type === "withdraw" ? <WithdrawModal onClose={onClose} /> : null}
      {active?.type === "account" ? <AccountModal onClose={onClose} /> : null}
      {active?.type === "done" ? (
        <SuccessPanel title={active.title} onDone={onClose}>
          {active.msg}
        </SuccessPanel>
      ) : null}
    </ModalShell>
  );
}
