"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BottomDock } from "@/components/dashboard/bottom-dock";
import { PortfolioView } from "@/components/dashboard/views/portfolio-view";
import { SwapView } from "@/components/dashboard/views/swap-view";
import { PerpsView } from "@/components/dashboard/views/perps-view";
import { MarketsView } from "@/components/dashboard/views/markets-view";
import { PredictionView } from "@/components/dashboard/views/prediction-view";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { DetailModal } from "@/components/dashboard/modals/detail-modal";
import { ConfirmModal } from "@/components/dashboard/modals/confirm-modal";
import { FundsModal } from "@/components/dashboard/modals/funds-modal";
import { SendModal } from "@/components/dashboard/modals/send-modal";
import { AccountModal } from "@/components/dashboard/modals/account-modal";
import type {
  ConfirmPayload,
  DashboardModal,
  DashboardView,
  DetailPayload,
} from "@/components/dashboard/modal-types";

export default function DashboardPage() {
  const [view, setView] = useState<DashboardView>("portfolio");
  const [modal, setModal] = useState<DashboardModal>(null);

  const close = () => setModal(null);
  const openDetail = (detail: DetailPayload) => setModal({ type: "detail", detail });
  const openConfirm = (confirm: ConfirmPayload) => setModal({ type: "confirm", confirm });
  const openFunds = () => setModal({ type: "funds" });
  const openSend = () => setModal({ type: "send" });
  const openAccount = () => setModal({ type: "account" });

  return (
    <div className="min-h-screen bg-black">
      <Sidebar view={view} onViewChange={setView} onOpenAccount={openAccount} />

      <main className="min-h-screen pb-[96px] md:ml-[248px] md:pb-0">
        <Topbar onOpenFunds={openFunds} onOpenAccount={openAccount} />

        {view === "portfolio" ? (
          <PortfolioView
            onOpenFunds={openFunds}
            onOpenSend={openSend}
            onOpenDetail={openDetail}
            onOpenConfirm={openConfirm}
          />
        ) : null}
        {view === "swap" ? <SwapView onOpenConfirm={openConfirm} /> : null}
        {view === "perps" ? (
          <PerpsView onOpenDetail={openDetail} onOpenConfirm={openConfirm} />
        ) : null}
        {view === "markets" ? (
          <MarketsView onOpenDetail={openDetail} onOpenConfirm={openConfirm} />
        ) : null}
        {view === "prediction" ? <PredictionView onOpenConfirm={openConfirm} /> : null}
      </main>

      <BottomDock view={view} onViewChange={setView} />

      <ModalShell open={modal !== null} onClose={close}>
        {modal?.type === "detail" ? <DetailModal detail={modal.detail} /> : null}
        {modal?.type === "confirm" ? (
          <ConfirmModal
            confirm={modal.confirm}
            onConfirm={() =>
              setModal({
                type: "done",
                title: modal.confirm.successTitle,
                msg: modal.confirm.successMsg,
              })
            }
          />
        ) : null}
        {modal?.type === "funds" ? (
          <FundsModal
            onConfirm={() =>
              setModal({
                type: "done",
                title: "Funds added",
                msg: "₦250,000 is now in your balance, ready to invest.",
              })
            }
          />
        ) : null}
        {modal?.type === "send" ? (
          <SendModal
            onConfirm={() =>
              setModal({
                type: "done",
                title: "Transfer sent",
                msg: "Your transfer is on its way and settles instantly.",
              })
            }
          />
        ) : null}
        {modal?.type === "account" ? (
          <AccountModal
            onPortfolio={() => {
              setView("portfolio");
              close();
            }}
            onClose={close}
          />
        ) : null}
        {modal?.type === "done" ? (
          <SuccessPanel title={modal.title} onDone={close}>
            {modal.msg}
          </SuccessPanel>
        ) : null}
      </ModalShell>
    </div>
  );
}
