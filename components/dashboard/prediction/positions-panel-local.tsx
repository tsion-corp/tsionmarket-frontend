"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import { ChevronLeftIcon, ChartBarsIcon } from "@/components/ui/icons";
import {
  usePositions,
  usePendingWithdrawals,
  useMyMarkets,
} from "@/hooks/use-prediction-portfolio";
import { useMarkets } from "@/hooks/use-prediction-markets";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import { useLpAutoReturn } from "@/hooks/use-lp-auto-return";
import { ClaimWindow } from "@/components/dashboard/prediction/claim-window";
import { sideLabel, toNumber } from "@/lib/prediction/format";
import type { Market, Position } from "@/lib/prediction/types";

// Portfolio (Portfolio pillar): the wallet's open positions and its claimable
// balance. Selling and redeeming happen on each market's detail page where the
// live pool and resolution context exist; here a resolved winning position gets a
// direct Redeem, and the pull-payment balance gets a global Claim.
export function PortfolioPanel() {
  const t = useTranslations("prediction");
  const money = useMoney();
  const { data: positions, isLoading, isError } = usePositions();
  const { data: markets, isSuccess: marketsLoaded } = useMarkets();
  const { data: myMarkets } = useMyMarkets();
  const withdrawable = usePendingWithdrawals();
  const actions = usePredictionActions();
  // Seed liquidity from any market of theirs that has resolved comes back here,
  // without the creator having to ask. Mounted on the portfolio because it is
  // where the LP and created-market data already live.
  useLpAutoReturn();

  const byId = useMemo(() => {
    const map = new Map<string, Market>();
    for (const m of markets ?? []) map.set(m.marketId.toString(), m);
    return map;
  }, [markets]);

  // A position whose market is not in the read-model is a leftover from an
  // older contract deployment: the indexer still reports the share balance, but
  // the market itself is gone. It rendered as a row titled "Market" with no
  // question, linking to a detail page that does not exist, and no action on it
  // could succeed. Hide those rather than show a row nobody can use.
  //
  // Keyed on the market being ABSENT, not on its question being null: a real
  // market whose off-chain metadata has not been attached yet also has no
  // question, and that one has to stay.
  //
  // Only filtered once the list has actually loaded. While it is in flight or
  // after it fails, every position shows: hiding real money because a fetch
  // failed would be the worse error.
  const list = useMemo(() => {
    const all = positions ?? [];
    if (!marketsLoaded) return all;
    return all.filter((p) => byId.has(p.marketId.toString()));
  }, [positions, marketsLoaded, byId]);

  const claimable = withdrawable.data ?? 0n;

  // Positions the user just redeemed this session, keyed "<marketId>-<side>".
  // redeem() burns the shares ON-CHAIN immediately, but usePositions reads the
  // INDEXER, which lags — so without this the just-claimed position (and its
  // Claim button) lingers until the indexer catches up, letting the user tap
  // Claim again and hit an on-chain "balance" revert (the shares are already
  // gone). Marking it here hides the button the moment the redeem tx confirms.
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set());
  const keyOf = (p: Position) => `${p.marketId.toString()}-${p.side}`;

  // A position wins when its market resolved and the held side matches the
  // outcome. Winning shares can be redeemed 1:1 for USDC. A position already
  // redeemed this session is no longer claimable (see claimedKeys).
  const isWinner = (p: Position, m: Market | undefined): boolean =>
    !!m &&
    m.status === "Resolved" &&
    m.outcome.toLowerCase() === p.side &&
    !claimedKeys.has(keyOf(p));

  const onRedeem = async (p: Position) => {
    const ok = await actions.redeem(p.marketId, p.side, p.shares);
    if (ok) {
      // Optimistically retire this position's Claim button right away — don't
      // wait for the indexer to reflect the burned shares.
      setClaimedKeys((prev) => new Set(prev).add(keyOf(p)));
      void actions.claim();
    }
  };

  // The pull-payment balance the global Claim button pays out. It is read from
  // chain state that lags a confirmed claim, so the row would keep offering a
  // balance that is already in the wallet, and a second tap would revert.
  //
  // Remembering the amount claimed (rather than a plain "done" flag) makes this
  // self-healing: the row reappears as soon as the balance reads as anything
  // other than what was just taken, including a later win.
  const [claimedBalance, setClaimedBalance] = useState<bigint | null>(null);
  const balanceAlreadyClaimed = claimedBalance !== null && claimedBalance === claimable;

  const onClaimBalance = async () => {
    const amount = claimable;
    if (await actions.claim()) setClaimedBalance(amount);
  };

  const created = myMarkets ?? [];

  return (
    <>
      <div className="ws-card relative mt-7 overflow-hidden sm:mt-9">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[92px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="bg-accent/16 text-accent grid h-12 w-12 shrink-0 place-items-center rounded-[14px]">
              <ChartBarsIcon size={24} />
            </span>
            <div className="min-w-0">
              <span className="ws-display text-[21px] tracking-[-0.01em]">
                {t("positionsTitle")}
              </span>
              <div className="tnum mt-0.5 text-[13px] font-normal text-white/60">
                {t("positionsSubtitle")}
              </div>
            </div>
          </div>
        </div>

        {isError ? (
          <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
            {t("positionsError")}
          </div>
        ) : isLoading ? (
          <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
            {t("loading")}
          </div>
        ) : list.length === 0 ? (
          <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
            {t("noPositions")}
          </div>
        ) : (
          list.map((p) => {
            const m = byId.get(p.marketId.toString());
            const winner = isWinner(p, m);
            return (
              <div
                key={`${p.marketId}-${p.side}`}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3 sm:px-6"
              >
                <Link href={`/prediction/${p.marketId}`} className="min-w-0">
                  <div className="truncate font-sans text-[13.5px] font-medium">
                    {m?.question ?? t("marketFallback")}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-normal text-white/50">
                    <span className="truncate">
                      {sideLabel(p.side)} ·{" "}
                      {t("sharesCount", { count: toNumber(p.shares).toFixed(2) })}
                    </span>
                    <span className="text-accent inline-flex shrink-0 items-center">
                      · {t("viewSlip")}
                      <ChevronLeftIcon size={12} className="-scale-x-100" />
                    </span>
                  </div>
                </Link>
                {winner ? (
                  // Creator resolutions carry a 24h challenge window; inside it
                  // redeem() reverts, so the button waits behind a countdown.
                  <ClaimWindow marketId={p.marketId}>
                    <button
                      onClick={() => onRedeem(p)}
                      disabled={actions.busy}
                      className="border-accent/45 bg-accent/12 cursor-pointer rounded-lg border px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
                    >
                      {actions.busy ? t("claiming") : t("claim")}
                    </button>
                  </ClaimWindow>
                ) : claimedKeys.has(keyOf(p)) ? (
                  // Just redeemed this session — the shares are burned on-chain;
                  // show a settled label instead of a re-clickable Claim button.
                  <span className="text-accent text-right text-[12.5px] font-medium">
                    {t("claimed")}
                  </span>
                ) : m?.status === "Resolved" ? (
                  <span className="text-down text-right text-[12.5px] font-medium">
                    {t("resolvedNoWin")}
                  </span>
                ) : (
                  <span className="tnum text-right font-sans text-sm font-medium">
                    {money.format(toNumber(p.costUsdc))}
                  </span>
                )}
              </div>
            );
          })
        )}

        {claimable > 0n && !balanceAlreadyClaimed ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6">
            <span className="text-[12.5px] font-normal text-white/55">
              {t("claimableBalance", { amount: money.format(toNumber(claimable)) })}
            </span>
            <button
              onClick={onClaimBalance}
              disabled={actions.busy}
              className="text-ink cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actions.busy ? t("claiming") : t("claim")}
            </button>
          </div>
        ) : null}
      </div>

      {created.length > 0 ? (
        <div className="ws-card mt-5 overflow-hidden">
          <div className="px-5 pt-5 pb-3 sm:px-6">
            <span className="ws-display text-[18px] tracking-[-0.01em]">{t("yourMarkets")}</span>
            <div className="mt-0.5 text-[12.5px] font-normal text-white/60">
              {t("yourMarketsSubtitle")}
            </div>
          </div>
          {created.map((m) => (
            <Link
              key={m.marketId.toString()}
              href={`/prediction/${m.marketId}`}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3 transition-colors hover:bg-white/4 sm:px-6"
            >
              <div className="min-w-0">
                <div className="truncate font-sans text-[13.5px] font-medium">
                  {m.question ?? t("marketFallback")}
                </div>
                <div className="text-xs font-normal text-white/50">{t(`status_${m.status}`)}</div>
              </div>
              <span className="text-accent inline-flex shrink-0 items-center text-[12.5px] font-medium">
                {m.status === "Open" || m.status === "Closed" ? t("resolveTitle") : t("viewSlip")}
                <ChevronLeftIcon size={12} className="-scale-x-100" />
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
