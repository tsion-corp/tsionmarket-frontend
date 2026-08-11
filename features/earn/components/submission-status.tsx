"use client";

import { ordinal } from "@/features/earn/lib/ordinal";
import type { SubmissionCheck } from "@/features/earn/lib/api/types";

// What the user's own entry is doing. Before winners are announced there is
// nothing to say beyond "received": the service does not expose a sponsor's
// in-progress opinion, and implying one would be a lie.
export function SubmissionStatus({ check }: { check: SubmissionCheck }) {
  if (!check.hasSubmitted) return null;

  const { headline, detail, tone } = describe(check);

  return (
    <div className="ws-inset mt-5 px-5 py-4">
      <div className={`ws-display text-[15px] ${tone === "win" ? "text-up" : "text-white/85"}`}>
        {headline}
      </div>
      <div className="mt-1 font-sans text-[12.5px] font-normal text-white/50">{detail}</div>
    </div>
  );
}

function describe(check: SubmissionCheck): {
  headline: string;
  detail: string;
  tone: "win" | "neutral";
} {
  if (!check.winnersAnnounced) {
    return {
      headline: "Entry received",
      detail: "You'll hear back here once the sponsor has picked winners.",
      tone: "neutral",
    };
  }

  if (!check.isWinner) {
    return {
      headline: "Not selected this time",
      detail: "The sponsor has announced their winners. Your entry wasn't one of them.",
      tone: "neutral",
    };
  }

  const place = check.winnerPosition ? ordinal(check.winnerPosition) : "a winning";
  if (check.isPaid) {
    return {
      headline: `Paid, ${place} place`,
      detail: "The sponsor has sent your reward.",
      tone: "win",
    };
  }
  if (!check.kycVerified) {
    return {
      headline: `You won ${place} place`,
      detail: "Complete identity verification to receive the reward.",
      tone: "win",
    };
  }
  return {
    headline: `You won ${place} place`,
    detail: "The sponsor is preparing your payment.",
    tone: "win",
  };
}
