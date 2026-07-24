"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { SectionChips } from "@/components/dashboard/section-chips";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
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
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { scrollToSection } from "@/lib/scroll";
import { loadInterest } from "@/lib/preferences";
import type { SectionId } from "@/lib/sections";
import type {
  ConfirmPayload,
  DetailPayload,
  DashboardModal,
} from "@/components/dashboard/modal-types";

const SECTION_CLASS = "scroll-mt-[124px] md:scroll-mt-[76px]";

// All five sections stay mounted at once, so memoize them: with stable handler
// props they skip re-rendering when the page re-renders for a modal open/close
// or an active-section scroll change. Each still re-renders on its own data.
const Portfolio = memo(PortfolioView);
const Trade = memo(TradeSection);
const Markets = memo(MarketsView);
const Rwa = memo(RwaSection);
const Prediction = memo(PredictionView);

export default function DashboardPage() {
  const [modal, setModal] = useState<DashboardModal>(null);
  const nav = useMemo(() => buildNav(loadInterest()), []);
  const sectionIds = useMemo(() => nav.map((n) => n.id), [nav]);
  const activeSection = useScrollSpy(sectionIds);
  usePrefetchDepositCatalog();

  // Stable handler identities so the memoized section views below don't
  // re-render when this page re-renders (modal open/close, active-section scroll).
  const close = useCallback(() => setModal(null), []);
  const openDetail = useCallback(
    (detail: DetailPayload) => setModal({ type: "detail", detail }),
    []
  );
  const openConfirm = useCallback(
    (confirm: ConfirmPayload) => setModal({ type: "confirm", confirm }),
    []
  );
  const openFunds = useCallback(() => setModal({ type: "funds" }), []);
  const openWithdraw = useCallback(() => setModal({ type: "withdraw" }), []);
  const openSend = useCallback(() => setModal({ type: "send" }), []);
  const openAccount = useCallback(() => setModal({ type: "account" }), []);

  const sections: Record<SectionId, React.ReactNode> = {
    portfolio: (
      <Portfolio
        onOpenFunds={openFunds}
        onOpenWithdraw={openWithdraw}
        onOpenSend={openSend}
        onOpenDetail={openDetail}
        onOpenConfirm={openConfirm}
      />
    ),
    trade: <Trade onOpenDetail={openDetail} />,
    markets: <Markets onOpenDetail={openDetail} />,
    rwa: <Rwa onOpenDetail={openDetail} onOpenConfirm={openConfirm} />,
    prediction: <Prediction />,
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

          <DashboardFooter sections={nav} />
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
          {modal?.type === "account" ? <AccountModal onClose={close} /> : null}
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
