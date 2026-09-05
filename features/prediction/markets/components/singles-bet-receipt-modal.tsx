"use client";

import { ArrowUpRightIcon, CheckIcon } from "@/components/ui/icons";
import { CopyButton } from "@/components/ui/copy-button";
import { ModalShell } from "@/components/ui/modal-shell";
import type { SinglesBetReceipt, SinglesOrderStatus } from "../singles-receipt";

interface SinglesBetReceiptModalProps {
  receipt: SinglesBetReceipt | null;
  onClose: () => void;
  onRetrySave: () => void;
  onViewActiveBets: () => void;
}

const STATUS_STYLES: Record<SinglesOrderStatus, string> = {
  filled: "bg-emerald-400/12 text-emerald-200",
  pending: "bg-amber-300/12 text-amber-100",
  failed: "bg-red-400/12 text-red-200",
};

function receiptHeading(receipt: SinglesBetReceipt) {
  if (receipt.status === "filled") return "Order successful";
  if (receipt.status === "partial") return "Ticket partially filled";
  if (receipt.status === "pending") return "Orders submitted";
  return "No orders filled";
}

export function SinglesBetReceiptModal({
  receipt,
  onClose,
  onRetrySave,
  onViewActiveBets,
}: SinglesBetReceiptModalProps) {
  return (
    <ModalShell
      open={receipt != null}
      onClose={onClose}
      contentKey={receipt?.bookingCode}
      panelClassName="border-white/12 bg-[#111114]"
    >
      {receipt ? (
        <div className="pt-2">
          <div className="grid size-12 place-items-center rounded-full border border-white/14 bg-[linear-gradient(145deg,#e0e0e3_0%,#96969d_100%)] text-black shadow-[0_12px_35px_rgba(0,0,0,0.45)]">
            <CheckIcon size={23} />
          </div>
          <p className="mt-5 text-[10px] font-black tracking-[0.16em] text-white/38 uppercase">
            Order confirmation
          </p>
          <h2 className="mt-1 text-[25px] leading-8 font-black tracking-[-0.03em] text-white">
            {receiptHeading(receipt)}
          </h2>
          <p className="mt-2 text-[11px] leading-5 text-white/42">
            Your selections were submitted. One booking code groups the independent Polymarket
            orders; each order settles on its own.
          </p>

          {receipt.persistence === "unsaved" ? (
            <div className="mt-4 rounded-[10px] border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[10px] leading-4 text-amber-100/80">
              {receipt.acceptedCount === 0
                ? "No order was accepted. Ark could not save this failed attempt; you can try again after fixing the order error."
                : "The orders were submitted, but Ark could not save this receipt. Do not place them again. Check your Polymarket positions before taking any action."}
              {receipt.saveError ? <span className="mt-1 block">{receipt.saveError}</span> : null}
              <button
                type="button"
                onClick={onRetrySave}
                className="mt-2 h-8 cursor-pointer rounded-[6px] border border-amber-100/20 px-3 text-[9px] font-black text-amber-50 hover:bg-amber-100/8"
              >
                Retry saving receipt
              </button>
            </div>
          ) : null}

          <div className="mt-5 rounded-[12px] border border-white/10 bg-[linear-gradient(180deg,#252529_0%,#18181b_100%)] p-4">
            <p className="text-[9px] font-bold tracking-[0.14em] text-white/35 uppercase">
              Booking code
            </p>
            <div className="mt-2 flex items-center gap-3">
              <strong className="min-w-0 flex-1 text-[19px] font-black tracking-[0.08em] text-white tabular-nums">
                {receipt.bookingCode}
              </strong>
              <CopyButton value={receipt.bookingCode} />
            </div>
            <p className="mt-2 text-[9px] font-semibold text-white/30">
              {receipt.persistence === "saving"
                ? "Saving receipt..."
                : receipt.persistence === "saved"
                  ? "Saved to Ark"
                  : "Receipt not saved"}
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-white/9 bg-white/9">
            <div className="bg-[#17171a] p-3">
              <dt className="text-[9px] font-bold text-white/32">Requested</dt>
              <dd className="mt-1 text-[12px] font-black text-white">{receipt.requestedStake}</dd>
            </div>
            <div className="bg-[#17171a] p-3">
              <dt className="text-[9px] font-bold text-white/32">Filled</dt>
              <dd className="mt-1 text-[12px] font-black text-white">
                {receipt.filledCount}/{receipt.orders.length}
              </dd>
            </div>
            <div className="bg-[#17171a] p-3">
              <dt className="text-[9px] font-bold text-white/32">Est. return</dt>
              <dd className="mt-1 text-[12px] font-black text-white">{receipt.referenceReturn}</dd>
            </div>
          </dl>

          <div className="mt-4 max-h-[260px] overflow-y-auto rounded-[10px] border border-white/8 bg-black/20">
            {receipt.orders.map((order, index) => (
              <div
                key={`${order.eventTitle}:${order.marketLabel}:${index}`}
                className="border-b border-white/7 px-3 py-3 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/8 text-[9px] font-black text-white/48">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[9px] font-semibold text-white/32">
                      {order.eventTitle}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-white/72">
                      {order.marketLabel} · {order.outcome}
                    </p>
                    {order.error ? (
                      <p className="mt-1 text-[9px] leading-4 text-red-200/70">{order.error}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${STATUS_STYLES[order.status]}`}
                    >
                      {order.status}
                    </span>
                    {order.transactionHash ? (
                      <a
                        href={`https://polygonscan.com/tx/${order.transactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View transaction for ${order.marketLabel}`}
                        className="text-white/45 hover:text-white"
                      >
                        <ArrowUpRightIcon size={12} />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-[9px] text-white/28">
            <span>
              Submitted{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(receipt.placedAt)}
            </span>
            <span>Spent now: {receipt.spent}</span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 cursor-pointer rounded-[9px] border border-white/10 bg-white/5 text-[11px] font-black text-white/68 hover:bg-white/9"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onViewActiveBets}
              className="h-12 cursor-pointer rounded-[9px] bg-[linear-gradient(180deg,#dedee2_0%,#aaaab0_100%)] text-[11px] font-black text-black hover:opacity-90"
            >
              View positions
            </button>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}
