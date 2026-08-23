"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { ConfirmPayload } from "@/lib/modal-types";

interface ConfirmModalProps {
  confirm: ConfirmPayload;
  onConfirm: () => void;
}

export function ConfirmModal({ confirm, onConfirm }: ConfirmModalProps) {
  return (
    <div>
      <Eyebrow>{confirm.eyebrow}</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        {confirm.badgeSym && confirm.badgeBg ? (
          <AssetIcon
            sym={confirm.badgeSym}
            bg={confirm.badgeBg}
            size={44}
            logo={confirm.badgeLogo}
          />
        ) : null}
        <div className="min-w-0">
          <div className="ws-display text-[23px] tracking-[-0.01em]">{confirm.title}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">{confirm.sub}</div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 text-[13.5px] font-normal text-white/60">
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
        className="ws-chrome text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        {confirm.cta}
      </button>
    </div>
  );
}
