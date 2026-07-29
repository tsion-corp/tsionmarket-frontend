"use client";

import { ChevronLeftIcon } from "@/components/ui/icons";

interface SheetNavProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

// Header for a sub-screen inside the funds and withdraw sheets. The back button
// steps one screen back without closing the sheet.
export function SheetNav({ title, subtitle, onBack }: SheetNavProps) {
  return (
    <div className="mb-4">
      <button
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-normal text-white/60 hover:text-white"
      >
        <ChevronLeftIcon size={14} />
        Back
      </button>
      <div className="ws-display text-[24px] tracking-[-0.01em]">{title}</div>
      {subtitle ? (
        <p className="mt-1.5 text-[13.5px] leading-normal font-normal text-white/60">{subtitle}</p>
      ) : null}
    </div>
  );
}
