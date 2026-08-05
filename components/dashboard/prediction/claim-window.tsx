"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRedeemableAt } from "@/hooks/use-prediction-neg-risk";
import { timeUntil } from "@/lib/prediction/format";

interface ClaimWindowProps {
  marketId: bigint;
  // Rendered once the winnings are unlocked. Held as a render prop so the
  // ticking clock in here never re-renders the row around it.
  children: React.ReactNode;
}

// Gate around a winning position's Claim button.
//
// Contract v1.2.0 gives a creator-resolved market a 24h challenge window:
// redeem() reverts with "challenge window" until `redeemableAt`. Showing a
// button that always fails is worse than showing the wait, so this renders a
// live "Claimable in 3h 20m" until the deadline passes.
//
// redeemableAt is 0 for owner resolutions, invalidated markets, and everything
// created before the upgrade, all of which claim immediately.
export function ClaimWindow({ marketId, children }: ClaimWindowProps) {
  const t = useTranslations("prediction");
  const { data: redeemableAt, isPending } = useRedeemableAt(marketId);
  const [now, setNow] = useState(() => Date.now());

  const locked = redeemableAt != null && redeemableAt > 0 && redeemableAt * 1000 > now;

  // Tick only while locked, and only once a minute: the label's smallest unit
  // is minutes, so a faster clock would re-render for nothing.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [locked]);

  // While the read is in flight, show the claim action rather than a flash of
  // "locked": the window applies to a minority of markets, and a button that
  // briefly appears is better than a countdown that briefly lies.
  if (isPending || !locked) return <>{children}</>;

  const remaining = timeUntil(redeemableAt, now);
  return (
    <span className="text-right text-[12.5px] font-medium text-white/50">
      {remaining ? t("claimableIn", { time: remaining }) : t("claimableSoon")}
    </span>
  );
}
