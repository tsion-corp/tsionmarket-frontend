"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { tokenBg } from "@/lib/trade/assets";
import { ProgressBar } from "@/components/ui/progress-bar";

// The confirm-and-execute step for a spot order, as a sheet that slides up from
// the bottom. The amount is already entered on the ticket, so this is purely a
// checkpoint before money moves: a summary, then Confirm. Once confirmed it
// stays open to show settlement progress, since a buy bridges cross-chain and
// takes a moment.

export interface SpotConfirmRow {
  label: string;
  value: string;
  tone?: "up" | "down";
}

export type SpotOrderPhase = "confirm" | "working" | "settled" | "failed";

interface SpotConfirmSheetProps {
  open: boolean;
  side: "buy" | "sell";
  base: string;
  logo?: string | null;
  rows: SpotConfirmRow[];
  phase: SpotOrderPhase;
  progressPct: number;
  stageLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function SpotConfirmSheet({
  open,
  side,
  base,
  logo,
  rows,
  phase,
  progressPct,
  stageLabel,
  onConfirm,
  onClose,
}: SpotConfirmSheetProps) {
  const t = useTranslations("spot");
  const buying = side === "buy";
  const inProgress = phase === "working";
  const done = phase === "settled";
  const failed = phase === "failed";
  // Monochrome while working; the up/down palette only marks the outcome.
  const barColor = failed ? "#f6a5a5" : done ? "#7ce7b0" : "#e6e6e6";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label={t("cancel")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            // While the order is settling there is nothing safe to cancel, so
            // the backdrop does not dismiss.
            onClick={inProgress ? undefined : onClose}
            className="fixed inset-0 z-[420] cursor-default bg-black/65 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="bg-sheet fixed inset-x-0 bottom-0 z-[421] mx-auto w-full max-w-[460px] rounded-t-[24px] border border-white/12 p-5 pb-7 shadow-[0_-24px_90px_-30px_rgba(0,0,0,0.9)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

            <div className="flex items-center gap-3">
              <AssetIcon
                sym={base || "?"}
                bg={tokenBg(base || "?")}
                logo={logo}
                size={34}
                fallback="gradient"
              />
              <div className="min-w-0">
                <div className="ws-display text-[18px]">
                  {done
                    ? t("orderComplete")
                    : failed
                      ? t("orderFailed")
                      : inProgress
                        ? t("orderWorking")
                        : `${buying ? t("confirmBuy") : t("confirmSell")} · ${base}`}
                </div>
                <div className="text-xs font-normal text-white/50">{base}/USDC</div>
              </div>
            </div>

            {phase === "confirm" ? (
              <>
                <div className="ws-inset mt-4 flex flex-col gap-2 p-4 text-[13px] font-normal">
                  {rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3">
                      <span className="text-white/55">{r.label}</span>
                      <span
                        className={`tnum text-right font-medium ${
                          r.tone === "up"
                            ? "text-up"
                            : r.tone === "down"
                              ? "text-down"
                              : "text-white"
                        }`}
                      >
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-2.5">
                  <button
                    onClick={onClose}
                    className="cursor-pointer rounded-[14px] border border-white/14 bg-white/6 p-3.5 font-sans text-[15px] font-semibold text-white hover:bg-white/10"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    onClick={onConfirm}
                    className={`cursor-pointer rounded-[14px] p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 ${
                      buying ? "bg-up text-up-ink" : "bg-down text-down-ink"
                    }`}
                  >
                    {buying ? t("confirmBuy") : t("confirmSell")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ws-inset mt-4 p-4">
                  <div className="mb-2.5 text-[13px] font-medium text-white">{stageLabel}</div>
                  <ProgressBar pct={progressPct} color={barColor} />
                  <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/60">
                    {done ? t("settledNote") : failed ? t("orderFailedNote") : t("workingNote")}
                  </p>
                </div>
                {!inProgress ? (
                  <button
                    onClick={onClose}
                    className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
                  >
                    {t("done")}
                  </button>
                ) : null}
              </>
            )}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
