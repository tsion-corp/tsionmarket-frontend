"use client";

import { ArrowUpRightIcon, CheckIcon } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { CopyButton } from "@/components/ui/copy-button";
import type { ComboBetReceipt } from "../combo-receipt";

interface ComboBetReceiptModalProps {
  receipt: ComboBetReceipt | null;
  onClose: () => void;
}

export function ComboBetReceiptModal({ receipt, onClose }: ComboBetReceiptModalProps) {
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
            Combo confirmed
          </p>
          <h2 className="mt-1 text-[25px] leading-8 font-black tracking-[-0.03em] text-white">
            Order placed
          </h2>
          <p className="mt-2 text-[11px] leading-5 text-white/42">
            Keep this booking code to identify the Combo and its onchain settlement.
          </p>

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
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-white/9 bg-white/9">
            <div className="bg-[#17171a] p-3">
              <dt className="text-[9px] font-bold text-white/32">Stake</dt>
              <dd className="mt-1 text-[12px] font-black text-white">{receipt.stake}</dd>
            </div>
            <div className="bg-[#17171a] p-3">
              <dt className="text-[9px] font-bold text-white/32">Live odds</dt>
              <dd className="mt-1 text-[12px] font-black text-white">{receipt.decimalOdds}</dd>
            </div>
            <div className="bg-[#17171a] p-3">
              <dt className="text-[9px] font-bold text-white/32">Max return</dt>
              <dd className="mt-1 text-[12px] font-black text-white">{receipt.potentialReturn}</dd>
            </div>
          </dl>

          <div className="mt-4 max-h-[210px] overflow-y-auto rounded-[10px] border border-white/8 bg-black/20">
            {receipt.selections.map((selection, index) => (
              <div
                key={`${selection.eventTitle}:${selection.marketLabel}:${index}`}
                className="flex gap-3 border-b border-white/7 px-3 py-3 last:border-b-0"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/8 text-[9px] font-black text-white/48">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold text-white/32">
                    {selection.eventTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold text-white/72">
                    {selection.marketLabel} · {selection.outcome}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-[9px] text-white/28">
            <span>
              Placed{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(receipt.placedAt)}
            </span>
            <a
              href={`https://polygonscan.com/tx/${receipt.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-bold text-white/52 hover:text-white"
            >
              View transaction <ArrowUpRightIcon size={12} />
            </a>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 h-12 w-full cursor-pointer rounded-[9px] bg-[linear-gradient(180deg,#dedee2_0%,#aaaab0_100%)] text-[12px] font-black text-black hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
