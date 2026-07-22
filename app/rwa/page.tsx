"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ribbon } from "@/components/rwa/ribbon";
import { RwaHeader } from "@/components/rwa/rwa-header";
import { AssetAbout, AssetChart, AssetHeader, AssetStats } from "@/components/rwa/asset-detail";
import { OrderPanel } from "@/components/rwa/order-panel";
import { MarketsTable } from "@/components/rwa/markets-table";
import { RwaDetailModal } from "@/components/rwa/detail-modal";
import { OrderReviewModal } from "@/components/rwa/order-review-modal";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { FundsModal } from "@/components/dashboard/modals/funds-modal";
import { AccountModal } from "@/components/dashboard/modals/account-modal";
import { RWA_ASSETS } from "@/lib/data/rwa";
import { quoteOrder, type OrderMode } from "@/lib/rwa-order";
import type { RwaAsset } from "@/lib/types";

type RwaModal =
  | { type: "detail"; asset: RwaAsset }
  | { type: "order" }
  | { type: "orderDone" }
  | { type: "funds" }
  | { type: "fundsDone" }
  | { type: "account" }
  | null;

export default function RwaPage() {
  const [selKey, setSelKey] = useState(RWA_ASSETS[0].key);
  const [mode, setMode] = useState<OrderMode>("buy");
  const [modal, setModal] = useState<RwaModal>(null);
  const router = useRouter();

  const selected = RWA_ASSETS.find((a) => a.key === selKey) ?? RWA_ASSETS[0];
  const quote = quoteOrder(selected, mode);
  const close = () => setModal(null);

  const startOrder = (asset: RwaAsset) => {
    setSelKey(asset.key);
    setMode("buy");
    setModal({ type: "order" });
  };

  return (
    <div className="min-h-screen bg-black">
      <Ribbon />
      <RwaHeader
        onOpenFunds={() => setModal({ type: "funds" })}
        onOpenAccount={() => setModal({ type: "account" })}
      />

      <section className="mx-auto max-w-[1240px] px-4 pt-[26px] pb-2 sm:px-6">
        <AssetHeader asset={selected} />
        <div className="mt-[22px] grid grid-cols-1 items-start gap-5 min-[960px]:grid-cols-[1fr_356px]">
          <div className="flex flex-col gap-5">
            <AssetChart asset={selected} />
            <AssetStats asset={selected} />
            <AssetAbout asset={selected} />
          </div>
          <OrderPanel
            asset={selected}
            mode={mode}
            onModeChange={setMode}
            onOrder={() => setModal({ type: "order" })}
          />
        </div>
      </section>

      <MarketsTable
        selectedKey={selKey}
        onOpenDetail={(asset) => setModal({ type: "detail", asset })}
        onBuy={startOrder}
      />

      <ModalShell open={modal !== null} onClose={close}>
        {modal?.type === "detail" ? (
          <RwaDetailModal asset={modal.asset} onTrade={() => startOrder(modal.asset)} />
        ) : null}
        {modal?.type === "order" ? (
          <OrderReviewModal
            asset={selected}
            mode={mode}
            onConfirm={() => setModal({ type: "orderDone" })}
          />
        ) : null}
        {modal?.type === "orderDone" ? (
          <SuccessPanel title="Order filled" onDone={close}>
            You now own{" "}
            <span className="text-accent">
              {quote.getAmt} {selected.ticker}
            </span>
            . It&apos;s live in your portfolio and settles instantly.
          </SuccessPanel>
        ) : null}
        {modal?.type === "funds" ? (
          <FundsModal
            subtitle="Top up in Naira and start owning real-world assets in seconds."
            onConfirm={() => setModal({ type: "fundsDone" })}
          />
        ) : null}
        {modal?.type === "fundsDone" ? (
          <SuccessPanel title="Funds added" onDone={close}>
            <span className="text-accent">₦250,000</span> is now in your balance, ready to invest.
          </SuccessPanel>
        ) : null}
        {modal?.type === "account" ? (
          <AccountModal onPortfolio={() => router.push("/dashboard")} onClose={close} />
        ) : null}
      </ModalShell>
    </div>
  );
}
