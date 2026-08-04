"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import { useMyMarkets } from "@/hooks/use-prediction-portfolio";
import type { MarketGroup } from "@/lib/prediction/types";

interface EventResolvePanelProps {
  group: MarketGroup;
}

// Creator-only panel to resolve a MULTI-OUTCOME event. An event has no single
// resolve() of its own — each outcome IS a standalone binary market, so the
// creator resolves each one independently (Yes = this outcome happened, No = it
// didn't). Unlike a single market's one Yes/No, this is a per-outcome grid:
// several candidates might resolve No and one Yes, or results may land over time,
// so each row carries its own control and its own on-chain resolve tx.
//
// Only rendered when the connected wallet created these markets — determined via
// the /markets/mine list (reliable even before the indexer backfills the
// on-chain creator), the same signal the single-market detail page uses.
export function EventResolvePanel({ group }: EventResolvePanelProps) {
  const t = useTranslations("prediction");
  const actions = usePredictionActions();
  const { data: myMarkets } = useMyMarkets();

  // Which member markets this wallet created. A group is not owned as a whole;
  // ownership is per underlying market. In practice one creator makes the whole
  // event, but we gate each row on its own market so a mixed group still behaves.
  const myMarketIds = useMemo(
    () => new Set((myMarkets ?? []).map((m) => m.marketId.toString())),
    [myMarkets]
  );
  const ownedOutcomes = group.outcomes.filter((o) => myMarketIds.has(o.marketId.toString()));

  // Tracks which single outcome's tx is in flight, so only that row's buttons
  // disable/spin — the others stay tappable (resolves are independent).
  const [resolving, setResolving] = useState<string | null>(null);

  // Nothing to show unless the wallet owns at least one outcome AND at least one
  // is still resolvable (Open/Closed, not already Resolved/Invalid).
  const anyResolvable = ownedOutcomes.some((o) => o.status === "Open" || o.status === "Closed");
  if (ownedOutcomes.length === 0 || !anyResolvable) return null;

  const resolve = async (marketId: bigint, outcome: "Yes" | "No") => {
    setResolving(marketId.toString());
    try {
      await actions.resolveMarket(marketId, outcome);
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="ws-card flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <span className="ws-display text-[16px]">{t("resolveEventTitle")}</span>
        <p className="text-[12.5px] font-normal text-white/55">{t("resolveEventNote")}</p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {ownedOutcomes.map((o) => {
          const marketId = o.marketId;
          const isBusy = resolving === marketId.toString();
          const settled = o.status === "Resolved" || o.status === "Invalid";
          return (
            <li key={o.memberId} className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-normal text-white/80">
                {o.label}
              </span>

              {settled ? (
                // Already resolved on-chain — show the settled outcome instead of
                // live buttons (Yes = it happened, No = it didn't).
                <span
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                    o.outcome === "Yes"
                      ? "border-up/40 bg-up/14 text-up border"
                      : "border-down/40 bg-down/14 text-down border"
                  }`}
                >
                  {o.outcome === "Yes" ? t("resolvedYes") : t("resolvedNo")}
                </span>
              ) : (
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <button
                    onClick={() => resolve(marketId, "Yes")}
                    disabled={actions.busy}
                    className="border-up/45 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                  >
                    {isBusy ? t("resolving") : t("resolveYes")}
                  </button>
                  <button
                    onClick={() => resolve(marketId, "No")}
                    disabled={actions.busy}
                    className="border-down/45 bg-down/16 text-down hover:bg-down/22 cursor-pointer rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                  >
                    {isBusy ? t("resolving") : t("resolveNo")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
