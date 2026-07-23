"use client";

import { useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { SectionChips } from "@/components/dashboard/section-chips";
import { buildNav } from "@/components/dashboard/nav-items";
import { PortfolioView } from "@/components/dashboard/views/portfolio-view";
import { TradeSection } from "@/components/dashboard/sections/trade-section";
import { RwaSection } from "@/components/dashboard/sections/rwa-section";
import { MarketsView } from "@/components/dashboard/views/markets-view";
import { PredictionView } from "@/components/dashboard/views/prediction-view";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { DetailModal } from "@/components/dashboard/modals/detail-modal";
import { ConfirmModal } from "@/components/dashboard/modals/confirm-modal";
import { FundsModal } from "@/components/dashboard/modals/funds-modal";
import { WithdrawModal } from "@/components/dashboard/modals/withdraw-modal";
import { SendModal } from "@/components/dashboard/modals/send-modal";
import { AccountModal } from "@/components/dashboard/modals/account-modal";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { scrollToSection } from "@/lib/scroll";
import { loadInterest } from "@/lib/preferences";
import type { SectionId } from "@/lib/sections";
import type {
  ConfirmPayload,
  DetailPayload,
  DashboardModal,
} from "@/components/dashboard/modal-types";

const SECTION_CLASS = "scroll-mt-[124px] md:scroll-mt-[76px]";

export default function DashboardPage() {
  const [modal, setModal] = useState<DashboardModal>(null);
  const nav = useMemo(() => buildNav(loadInterest()), []);
  const sectionIds = useMemo(() => nav.map((n) => n.id), [nav]);
  const activeSection = useScrollSpy(sectionIds);

  const close = () => setModal(null);
  const openDetail = (detail: DetailPayload) => setModal({ type: "detail", detail });
  const openConfirm = (confirm: ConfirmPayload) => setModal({ type: "confirm", confirm });
  const openFunds = () => setModal({ type: "funds" });
  const openWithdraw = () => setModal({ type: "withdraw" });
  const openSend = () => setModal({ type: "send" });
  const openAccount = () => setModal({ type: "account" });

  const sections: Record<SectionId, React.ReactNode> = {
    portfolio: (
      <PortfolioView
        onOpenFunds={openFunds}
        onOpenWithdraw={openWithdraw}
        onOpenSend={openSend}
        onOpenDetail={openDetail}
        onOpenConfirm={openConfirm}
      />
    ),
    trade: <TradeSection onOpenDetail={openDetail} onOpenConfirm={openConfirm} />,
    markets: <MarketsView onOpenDetail={openDetail} onOpenConfirm={openConfirm} />,
    rwa: <RwaSection onOpenDetail={openDetail} onOpenConfirm={openConfirm} />,
    prediction: <PredictionView onOpenConfirm={openConfirm} />,
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-black">
        <Sidebar
          items={nav}
          activeSection={activeSection}
          onNavigate={scrollToSection}
          onOpenAccount={openAccount}
        />

        <main className="min-h-screen md:ml-[248px]">
          <div className="sticky top-0 z-[60]">
            <Topbar onOpenAccount={openAccount} />
            <SectionChips sections={nav} activeId={activeSection} onSelect={scrollToSection} />
          </div>

          {nav.map((n) => (
            <section key={n.id} id={n.id} className={SECTION_CLASS}>
              {sections[n.id]}
            </section>
          ))}
        </main>

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
          {modal?.type === "funds" ? <FundsModal onClose={close} /> : null}
          {modal?.type === "withdraw" ? <WithdrawModal onClose={close} /> : null}
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
                close();
                scrollToSection("portfolio");
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
    </AuthGuard>
  );
}
