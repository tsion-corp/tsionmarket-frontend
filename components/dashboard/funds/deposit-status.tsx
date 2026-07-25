"use client";

import { ProgressBar } from "@/components/ui/progress-bar";
import { CheckIcon } from "@/components/ui/icons";
import { depositProgress, type DepositStage } from "@/lib/deposit";

const STEPS: { stage: DepositStage; label: string }[] = [
  { stage: "detected", label: "Detected" },
  { stage: "processing", label: "Bridging" },
  { stage: "settled", label: "Settled" },
];

const RANK: Record<DepositStage, number> = {
  waiting: 0,
  detected: 1,
  processing: 2,
  settled: 3,
  refunded: 3,
  failed: 3,
};

interface DepositStatusProps {
  status: string;
  executionStatus?: string;
  // The status poll failed. Shown so a provider error never reads as a stall.
  isError?: boolean;
  onRetry?: () => void;
}

// Live progress for a cross-chain deposit. Reads the provider status strings and
// renders the detected to bridged to settled path.
export function DepositStatus({
  status,
  executionStatus = "",
  isError = false,
  onRetry,
}: DepositStatusProps) {
  const progress = depositProgress(status, executionStatus);
  const failed = progress.stage === "failed" || progress.stage === "refunded";
  const current = RANK[progress.stage];
  const color = failed ? "#f6a5a5" : progress.stage === "settled" ? "#7ce7b0" : "#a78bfa";

  return (
    <div className="ws-inset mt-4 p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-white">{progress.label}</span>
        {!progress.terminal ? (
          <span className="text-accent inline-flex items-center gap-1.5 text-[11.5px] font-normal">
            <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" />
            Live
          </span>
        ) : null}
      </div>
      <ProgressBar pct={progress.pct} color={color} />
      {!failed ? (
        <div className="mt-3 flex justify-between">
          {STEPS.map((step) => {
            const done = current >= RANK[step.stage];
            return (
              <span key={step.stage} className="flex items-center gap-1.5">
                <span
                  className={`grid h-[16px] w-[16px] place-items-center rounded-full ${
                    done ? "bg-up text-up-ink" : "bg-white/10 text-white/40"
                  }`}
                >
                  {done ? <CheckIcon size={10} /> : null}
                </span>
                <span
                  className={`text-[11.5px] font-normal ${done ? "text-white/80" : "text-white/40"}`}
                >
                  {step.label}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[12px] leading-normal font-normal text-white/60">
          {progress.stage === "refunded"
            ? "The deposit was refunded to the sending wallet."
            : "The deposit could not be completed. Any funds are refunded to the sender."}
        </p>
      )}
      {isError ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-2.5">
          <span className="text-down text-[12px] font-normal">Couldn&apos;t check status</span>
          <button
            onClick={onRetry}
            className="text-accent cursor-pointer text-[12px] font-medium hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
