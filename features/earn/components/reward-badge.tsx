"use client";

import { formatReward } from "@/features/earn/lib/reward";
import type { RewardAmount } from "@/features/earn/lib/api/types";

// A listing with no readable reward says so rather than rendering as free
// work. The sponsor still has to fix it before anyone can be paid.
export function RewardBadge({
  reward,
  size = "sm",
}: {
  reward: RewardAmount | null;
  size?: "sm" | "lg";
}) {
  const text = reward ? formatReward(reward) : "Reward not set";
  const muted = !reward;

  return (
    <span
      className={`ws-display tnum ${size === "lg" ? "text-[22px]" : "text-[14px]"} ${
        muted ? "text-white/35" : "text-grey-100"
      }`}
    >
      {text}
    </span>
  );
}
