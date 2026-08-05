"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import { useMyMarkets } from "@/hooks/use-prediction-portfolio";
import { useMarketGroupId } from "@/hooks/use-prediction-neg-risk";
import type { GroupOutcome, MarketGroup } from "@/lib/prediction/types";

interface EventResolvePanelProps {
  group: MarketGroup;
}

// Creator-only panel to resolve a MULTI-OUTCOME event.
//
// Contract v1.2.0 made an event a real on-chain neg-risk group: exactly one
// member settles Yes and the rest settle No, in one transaction. So the creator
// picks THE winner rather than judging each outcome separately, and there is no
// way to publish two winners or leave the event half-settled.
//
// Events created before the upgrade have no on-chain group, and their members
// still resolve one at a time. Both shapes exist in the wild, so this reads the
// group id off the chain and renders whichever applies.
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

  // Any member answers "is this event grouped on-chain", since registration
  // covers the whole set. Uses the first outcome so the read is stable.
  const probeId = group.outcomes[0]?.marketId ?? null;
  const { data: groupId } = useMarketGroupId(probeId);

  const [winnerId, setWinnerId] = useState<string | null>(null);
  // Tracks which single outcome's tx is in flight on the legacy path, so only
  // that row's buttons disable while the others stay tappable.
  const [resolving, setResolving] = useState<string | null>(null);

  // Nothing to show unless the wallet owns at least one outcome AND at least one
  // is still resolvable (Open/Closed, not already Resolved/Invalid).
  const anyResolvable = ownedOutcomes.some((o) => o.status === "Open" || o.status === "Closed");
  if (ownedOutcomes.length === 0 || !anyResolvable) return null;

  const resolveOne = async (marketId: bigint, outcome: "Yes" | "No") => {
    setResolving(marketId.toString());
    try {
      await actions.resolveMarket(marketId, outcome);
    } finally {
      setResolving(null);
    }
  };

  const settledLabel = (o: GroupOutcome) => (
    <span
      className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
        o.outcome === "Yes"
          ? "border-up/40 bg-up/14 text-up border"
          : "border-down/40 bg-down/14 text-down border"
      }`}
    >
      {o.outcome === "Yes" ? t("resolvedYes") : t("resolvedNo")}
    </span>
  );

  // ── Grouped (v1.2.0): pick one winner, settle the whole event in one tx ──
  if (groupId != null) {
    const selected = group.outcomes.find((o) => o.marketId.toString() === winnerId) ?? null;
    // The whole group settles at once, so a single settled member means the
    // event is done and the picker has nothing left to do.
    const alreadySettled = group.outcomes.find(
      (o) => o.status === "Resolved" || o.status === "Invalid"
    );

    return (
      <div className="ws-card flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <span className="ws-display text-[16px]">{t("resolveEventTitle")}</span>
          <p className="text-[12.5px] font-normal text-white/55">{t("resolveEventNoteGrouped")}</p>
        </div>

        {alreadySettled ? (
          <ul className="flex flex-col gap-2.5">
            {group.outcomes.map((o) => (
              <li key={o.memberId} className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-normal text-white/80">
                  {o.label}
                </span>
                {settledLabel(o)}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {/* A radio group, not a set of buttons: picking the winner is one
                choice among many, and the control should say so before the
                irreversible action is taken. */}
            <ul
              role="radiogroup"
              aria-label={t("resolveEventTitle")}
              className="flex flex-col gap-2"
            >
              {group.outcomes.map((o) => {
                const id = o.marketId.toString();
                const checked = winnerId === id;
                return (
                  <li key={o.memberId}>
                    <button
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setWinnerId(id)}
                      disabled={actions.busy}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        checked
                          ? "border-accent/50 bg-accent/12"
                          : "border-white/10 bg-white/4 hover:bg-white/8"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                          checked ? "border-accent" : "border-white/25"
                        }`}
                      >
                        {checked ? <span className="bg-accent h-2 w-2 rounded-full" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white/85">
                        {o.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => selected && actions.resolveEvent(groupId, selected.marketId)}
              disabled={actions.busy || !selected}
              className="text-ink mt-1 w-full cursor-pointer rounded-xl bg-white py-2.5 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actions.busy
                ? t("resolving")
                : selected
                  ? t("resolveEventCta", { winner: selected.label })
                  : t("resolveEventPick")}
            </button>
            <p className="text-[11.5px] leading-[1.5] font-normal text-white/45">
              {t("resolveEventWarning")}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Legacy (pre-v1.2.0): no on-chain group, each outcome resolves alone ──
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
                settledLabel(o)
              ) : (
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <button
                    onClick={() => resolveOne(marketId, "Yes")}
                    disabled={actions.busy}
                    className="border-up/45 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                  >
                    {isBusy ? t("resolving") : t("resolveYes")}
                  </button>
                  <button
                    onClick={() => resolveOne(marketId, "No")}
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
