"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
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
import { BuySheet } from "@/components/dashboard/buy/buy-sheet";
import { SellSheet } from "@/components/dashboard/sell/sell-sheet";
import { RwaTradeModal } from "@/components/dashboard/rwa/rwa-trade-modal";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { loadInterest } from "@/lib/preferences";
import type { SectionId } from "@/lib/sections";
import type {
  BuyPayload,
  ConfirmPayload,
  DetailPayload,
  DashboardModal,
  RwaTradePayload,
  SellPayload,
} from "@/components/dashboard/modal-types";
import { AccountModal } from "@/components/dashboard/modals/account-modal";

const SECTION_CLASS = "scroll-mt-[124px] md:scroll-mt-[76px]";

// The scroll-spy sections mounted inline on this page. Vault lives on its
// own route (/vault) and is never one of these.
type ScrollSectionId = Exclude<SectionId, "vault">;

// The five scroll-spy sections stay mounted at once, so memoize them: with
// stable handler props they skip re-rendering when the page re-renders for a
// modal open/close or an active-section scroll change. Each still re-renders
// on its own data.
const Portfolio = memo(PortfolioView);
const Trade = memo(TradeSection);
const Markets = memo(MarketsView);
const Rwa = memo(RwaSection);
const Prediction = memo(PredictionView);

export default function DashboardPage() {
  const [modal, setModal] = useState<DashboardModal>(null);
  const nav = useMemo(() => buildNav(loadInterest()), []);
  const scrollSectionIds = useMemo(
    () => nav.map((n) => n.id).filter((id): id is ScrollSectionId => id !== "vault"),
    [nav]
  );
  const activeSection = useScrollSpy(scrollSectionIds);

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
  const openBuy = useCallback((buy: BuyPayload) => setModal({ type: "buy", buy }), []);
  const openSell = useCallback((sell: SellPayload) => setModal({ type: "sell", sell }), []);
  const openRwaTrade = useCallback(
    (rwaTrade: RwaTradePayload) => setModal({ type: "rwaTrade", rwaTrade }),
    []
  );
  const openFunds = useCallback(() => setModal({ type: "funds" }), []);
  const openWithdraw = useCallback(() => setModal({ type: "withdraw" }), []);

  const sections: Record<ScrollSectionId, React.ReactNode> = {
    portfolio: (
      <Portfolio
        onOpenFunds={openFunds}
        onOpenWithdraw={openWithdraw}
        onOpenDetail={openDetail}
        onOpenBuy={openBuy}
        onOpenSell={openSell}
        onOpenRwaTrade={openRwaTrade}
      />
    ),
    trade: <Trade />,
    markets: <Markets onOpenDetail={openDetail} onOpenBuy={openBuy} />,
    rwa: <Rwa onOpenDetail={openDetail} onOpenConfirm={openConfirm} />,
    prediction: <Prediction />,
  };

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection={activeSection}>
        {scrollSectionIds.map((id) => (
          <section key={id} id={id} className={SECTION_CLASS}>
            {sections[id]}
          </section>
        ))}
      </DashboardShell>

      <ModalShell open={modal !== null} onClose={close} contentKey={modal?.type ?? "none"}>
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
        {modal?.type === "buy" ? <BuySheet payload={modal.buy} onClose={close} /> : null}
        {modal?.type === "sell" ? <SellSheet payload={modal.sell} onClose={close} /> : null}
        {modal?.type === "rwaTrade" ? <RwaTradeModal payload={modal.rwaTrade} /> : null}
        {modal?.type === "funds" ? <FundsModal onClose={close} /> : null}
        {modal?.type === "withdraw" ? <WithdrawModal onClose={close} /> : null}
        {modal?.type === "account" ? <AccountModal onClose={close} /> : null}
        {modal?.type === "done" ? (
          <SuccessPanel title={modal.title} onDone={close}>
            {modal.msg}
          </SuccessPanel>
        ) : null}
      </ModalShell>
    </AuthGuard>
  );
}
