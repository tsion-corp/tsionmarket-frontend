"use client";

import { useEffect } from "react";

// Signing is headless on Base, so this dialog is the user's only checkpoint
// before money moves.

export interface ConfirmRow {
  label: string;
  value: string;
  tone?: "up" | "down";
}

interface ConfirmDialogProps {
  title: string;
  rows: ConfirmRow[];
  warning: string;
  cancelLabel: string;
  continueLabel: string;
  onCancel: () => void;
  onContinue: () => void;
}

export function ConfirmDialog({
  title,
  rows,
  warning,
  cancelLabel,
  continueLabel,
  onCancel,
  onContinue,
}: ConfirmDialogProps) {
  // Escape cancels — the safe default for a money confirmation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
    >
      <button
        aria-label={cancelLabel}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
      />
      <div className="ws-card relative w-full max-w-[380px] bg-[#101013] p-5">
        <div className="ws-display text-[19px]">{title}</div>

        <div className="ws-inset mt-3.5 flex flex-col gap-2 p-3.5 text-[13px] font-normal">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <span className="text-white/55">{row.label}</span>
              <span
                className={`tnum text-right font-medium ${
                  row.tone === "up" ? "text-up" : row.tone === "down" ? "text-down" : "text-white"
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12.5px] leading-[1.5] font-normal text-white/55">{warning}</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            onClick={onCancel}
            className="cursor-pointer rounded-[13px] border border-white/14 bg-white/6 p-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onContinue}
            className="ws-chrome text-ink cursor-pointer rounded-[13px] bg-white p-3 font-sans text-[14px] font-semibold hover:opacity-90"
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
