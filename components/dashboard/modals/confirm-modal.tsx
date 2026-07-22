"use client";

import { CoinBadge } from "@/components/ui/coin-badge";
import type { ConfirmPayload } from "@/components/dashboard/modal-types";

interface ConfirmModalProps {
  confirm: ConfirmPayload;
  onConfirm: () => void;
}

export function ConfirmModal({ confirm, onConfirm }: ConfirmModalProps) {
  return (
    <div>
      <div className="text-[13px] font-normal text-white/55">{confirm.eyebrow}</div>
      <div className="mt-3 flex items-center gap-[13px]">
        {confirm.badgeSym && confirm.badgeBg ? (
          <CoinBadge sym={confirm.badgeSym} bg={confirm.badgeBg} size={44} />
        ) : null}
        <div className="min-w-0">
          <div className="ws-serif text-[23px] tracking-[-0.01em]">{confirm.title}</div>
          <div className="truncate text-[12.5px] text-white/50">{confirm.sub}</div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 text-[13.5px] text-white/60">
        {confirm.lines.map((l) => (
          <div key={l.k} className="flex justify-between gap-4">
            <span>{l.k}</span>
            <span className="text-right" style={{ color: l.c || "#fff" }}>
              {l.v}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onConfirm}
        className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        {confirm.cta}
      </button>
    </div>
  );
}
