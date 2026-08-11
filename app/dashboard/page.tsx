"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { PortfolioView } from "@/features/portfolio";
import { SpotSection } from "@/features/trade/components/spot-section";
import { PerpsSection } from "@/features/trade/components/perps-section";
import { MemeSection } from "@/features/trade/components/meme-section";
import { ExploreBanners } from "@/components/layout/explore-banners";
import { RecentActivity } from "@/features/activity";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { DetailModal } from "@/components/layout/modals/detail-modal";
import { ConfirmModal } from "@/components/layout/modals/confirm-modal";
import { FundsModal, WithdrawModal } from "@/features/funds";
import { CrossBorderBanner, CrossBorderModal } from "@/features/remit";
import { BuySheet, SellSheet, MemeTradeSheet } from "@/features/trade";
import { RwaSection, RwaTradeModal } from "@/features/rwa";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { useDepositPrefill } from "@/hooks/use-deposit-prefill";
import type { DepositPrefill } from "@/lib/voice/intent";
import { loadInterest } from "@/lib/preferences";
import type { SectionId } from "@/lib/sections";
import type { MemeToken } from "@/lib/meme/api";
import type {
  BuyPayload,
  ConfirmPayload,
  DetailPayload,
  DashboardModal,
  RwaTradePayload,
  SellPayload,
} from "@/lib/modal-types";
import { AccountModal } from "@/components/layout/modals/account-modal";

const SECTION_CLASS = "scroll-mt-[124px] md:scroll-mt-[76px]";

// The scroll-spy sections mounted inline on this page. Prediction, earn and
// casino live on their own routes and are never one of these — the dashboard
// points at them through the explore banners instead.
const ROUTED_SECTIONS = ["casino", "earn", "prediction", "activity"] as const;
type RoutedSectionId = (typeof ROUTED_SECTIONS)[number];
type ScrollSectionId = Exclude<SectionId, RoutedSectionId>;

function isScrollSection(id: SectionId): id is ScrollSectionId {
  return !(ROUTED_SECTIONS as readonly SectionId[]).includes(id);
}

// The five scroll-spy sections stay mounted at once, so memoize them: with
// stable handler props they skip re-rendering when the page re-renders for a
// modal open/close or an active-section scroll change. Each still re-renders
// on its own data.
const Portfolio = memo(PortfolioView);
const Spot = memo(SpotSection);
const Perps = memo(PerpsSection);
const Meme = memo(MemeSection);
const Rwa = memo(RwaSection);

export default function DashboardPage() {
  const [modal, setModal] = useState<DashboardModal>(null);
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);
  const scrollSectionIds = useMemo(() => nav.map((n) => n.id).filter(isScrollSection), [nav]);
  const activeSection = useScrollSpy(scrollSectionIds);

  // A spoken deposit ("deposit USDC on Solana") lands here as URL params: open
  // the funds modal on the crypto screen with the chain/token pre-selected. The
  // hook returns a NEW prefill object each time a fresh deposit command arrives
  // and clears the URL params so a reload doesn't re-open it. We guard on the
  // prefill's identity (not a one-shot boolean) so a SECOND spoken deposit while
  // the page is still mounted re-opens the modal — the boolean latch used to
  // block every deposit after the first, which is why it only worked on refresh.
  const depositPrefill = useDepositPrefill();
  const openedDepositRef = useRef<DepositPrefill | null>(null);
  useEffect(() => {
    if (!depositPrefill || openedDepositRef.current === depositPrefill) return;
    openedDepositRef.current = depositPrefill;
    setModal({ type: "funds", deposit: depositPrefill });
  }, [depositPrefill]);

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
  const openMemeSell = useCallback(
    (memeSell: MemeToken) => setModal({ type: "memeSell", memeSell }),
    []
  );
  const openRwaTrade = useCallback(
    (rwaTrade: RwaTradePayload) => setModal({ type: "rwaTrade", rwaTrade }),
    []
  );
  const openFunds = useCallback(() => setModal({ type: "funds" }), []);
  const openWithdraw = useCallback(() => setModal({ type: "withdraw" }), []);
  const openCrossBorder = useCallback(() => setModal({ type: "crossBorder" }), []);

  const sections: Record<ScrollSectionId, React.ReactNode> = {
    portfolio: (
      <Portfolio
        onOpenFunds={openFunds}
        onOpenWithdraw={openWithdraw}
        crossBorderSlot={<CrossBorderBanner onClick={openCrossBorder} />}
        onOpenDetail={openDetail}
        onOpenBuy={openBuy}
        onOpenSell={openSell}
        onOpenMemeSell={openMemeSell}
        onOpenRwaTrade={openRwaTrade}
      />
    ),
    spot: <Spot onOpenDetail={openDetail} onOpenBuy={openBuy} />,
    perps: <Perps />,
    meme: <Meme />,
    rwa: <Rwa onOpenDetail={openDetail} onOpenConfirm={openConfirm} onAddFunds={openFunds} />,
  };

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection={activeSection}>
        {scrollSectionIds.map((id) => (
          <section key={id} id={id} className={SECTION_CLASS}>
            {sections[id]}
          </section>
        ))}
        {/* The routed destinations, pitched where the prediction section used
            to scroll: one banner each for Prediction, Earn and Casino. */}
        <ExploreBanners />
        {/* History closes the page: the last few transfers, then the way to
            the full record. */}
        <RecentActivity />
      </DashboardShell>

      <ModalShell
        open={modal !== null}
        onClose={close}
        contentKey={modal?.type ?? "none"}
        size={modal?.type === "funds" || modal?.type === "withdraw" ? "lg" : "md"}
      >
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
        {modal?.type === "memeSell" ? (
          <MemeTradeSheet token={modal.memeSell} defaultSide="SELL" onClose={close} />
        ) : null}
        {modal?.type === "rwaTrade" ? <RwaTradeModal payload={modal.rwaTrade} /> : null}
        {modal?.type === "funds" ? <FundsModal onClose={close} deposit={modal.deposit} /> : null}
        {modal?.type === "withdraw" ? <WithdrawModal onClose={close} /> : null}
        {modal?.type === "crossBorder" ? <CrossBorderModal /> : null}
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
