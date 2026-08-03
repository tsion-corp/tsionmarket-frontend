"use client";

import type { StepStatus } from "@/hooks/use-solana-funding";

export interface ProgressStep {
  id: string;
  label: string;
  // What this step is doing right now. Shown under the label while it runs.
  detail?: string;
  status: StepStatus;
}

function Marker({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="border-up/40 bg-up/15 text-up grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[10px] font-bold">
        ✓
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="border-down/40 bg-down/15 text-down grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[10px] font-bold">
        !
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
        <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-white/25 border-t-white" />
      </span>
    );
  }
  return (
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
      <span className="h-[7px] w-[7px] rounded-full bg-white/25" />
    </span>
  );
}

// The run, one line per step, so a stall is always attributable: which leg it
// stopped on and what it was doing when it stopped. Replaces a single spinner
// that said only "working".
export function RwaProgress({ steps }: { steps: ProgressStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-start gap-2.5">
          <span className="relative flex flex-col items-center self-stretch">
            <Marker status={step.status} />
            {i < steps.length - 1 ? <span className="w-px flex-1 bg-white/12" /> : null}
          </span>
          <span className="min-w-0 flex-1 pb-0.5">
            <span
              className={`block text-[12.5px] leading-[1.4] font-medium ${
                step.status === "pending" ? "text-white/40" : "text-white/85"
              }`}
            >
              {step.label}
            </span>
            {step.detail ? (
              <span className="block text-[11.5px] leading-[1.4] font-normal text-white/45">
                {step.detail}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
