"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProgressBar } from "@/components/ui/progress-bar";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useDepositChains, useDepositStatus } from "@/hooks/use-deposit";
import { useBuyDestinations } from "@/features/trade/hooks/use-buy-catalog";
import { useBuy } from "@/features/trade/hooks/use-buy";
import { useMemeTrade } from "@/features/trade/hooks/use-meme-trade";
import { NetworkPicker, NetworkSelect } from "@/features/trade/components/network-select";
import { belowMinimumBuy, isSolanaChainId, minimumBuyUsd } from "@/lib/trade/minimums";
import { routesForSymbol } from "@/lib/buy";
import { swapRouteForSymbol } from "@/lib/spot-swap";
import { depositProgress, usdcBaseUnits, type DepositStage } from "@/lib/deposit";
import { formatAmount, fromBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";
import { tradeShareRef } from "@/lib/trade-share";
import { useMoney } from "@/components/ui/currency-select";
import { ShareToSquare } from "@/components/share/share-to-square";
import { track } from "@/lib/analytics/mixpanel";
import { useSpotMode } from "@/features/trade/components/spot-mode";
import { friendlyError } from "@/lib/errors";
import type { BuyPayload } from "@/lib/modal-types";

// 1% price tolerance, kept out of the UI. Non-crypto users should not have to
// reason about slippage.
const SLIPPAGE_BPS = 100;
const PRESETS = [10, 50, 100];
const DECIMAL = /^\d*\.?\d*$/;

// Plain-language order status, no bridging or settlement jargon. Values are
// message keys in the buySell namespace.
const STAGE_KEY: Record<DepositStage, string> = {
  waiting: "stagePlacingOrder",
  detected: "stagePaymentReceived",
  processing: "stageAlmostThere",
  settled: "stageAllDone",
  refunded: "stageMoneyReturned",
  failed: "stageOrderFailed",
};

interface BuySheetProps {
  payload: BuyPayload;
  onClose: () => void;
}

export function BuySheet({ payload, onClose }: BuySheetProps) {
  const t = useTranslations("buySell");
  const portfolio = usePortfolio();
  const destinations = useBuyDestinations();

  const routes = useMemo(
    () => routesForSymbol(destinations.data ?? [], payload.symbol),
    [destinations.data, payload.symbol]
  );
  const [chainId, setChainId] = useState<number | null>(null);
  const route = routes.find((r) => r.destinationChainId === chainId) ?? routes[0] ?? null;

  // A symbol Dextopus does not offer (see lib/spot-swap.ts) settles through
  // the meme swap engine instead. A symbol never has both a route and a
  // swap route.
  const swapRoute = useMemo(() => swapRouteForSymbol(payload.symbol), [payload.symbol]);
  const isSwapMarket = swapRoute != null;
  const memeTrade = useMemeTrade();
  const swapBusy = isSwapMarket && memeTrade.phase !== "idle" && memeTrade.phase !== "failed";

  // Network display name and logo come from the Dextopus chain catalog, keyed by
  // the route's destination chain.
  const chainMeta = useDepositChains();
  const networkOptions = useMemo(() => {
    const meta = new Map((chainMeta.data ?? []).map((c) => [c.chainId, c]));
    return routes.map((r) => {
      const c = meta.get(r.destinationChainId);
      return {
        chainId: r.destinationChainId,
        name: c?.name ?? r.chainName.charAt(0).toUpperCase() + r.chainName.slice(1),
        logoUrl: c?.logoUrl ?? null,
      };
    });
  }, [routes, chainMeta.data]);

  const [amount, setAmount] = useState("");
  const buy = useBuy();
  const [requestId, setRequestId] = useState<string | null>(null);
  // The settled transaction for the order path. The swap path carries its own
  // on the trade hook, since only it knows which of its calls was the swap.
  const [settledTx, setSettledTx] = useState<{ txHash: string; chainId: number } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [bought, setBought] = useState<string>("");
  const [picking, setPicking] = useState(false);
  const status = useDepositStatus(requestId, "trade");

  // Your spendable dollars: the USDC balance on Base, shown as a plain balance.
  const balance = useMemo(
    () =>
      portfolio.tokens
        .filter((t) => t.symbol === "USDC" && t.network === "base-mainnet")
        .reduce((sum, t) => sum + t.balance, 0),
    [portfolio.tokens]
  );

  const value = Number(amount) || 0;
  // The same formatter the activity rows use, so a shared figure reads
  // identically wherever it is shared from.
  const money = useMoney();
  // Only flag a shortfall once the balance has actually loaded; until then we
  // don't know it, and a zero must block like any other insufficient balance.
  const notEnough = !portfolio.loading && value > balance;
  // Solana buys start at 2 USDC, everything else at 1 (lib/trade/minimums).
  const minUsd = minimumBuyUsd(isSolanaChainId(route?.destinationChainId));
  const belowMin = belowMinimumBuy(value, isSolanaChainId(route?.destinationChainId));
  // A buy is always a USDC send on Base, and every Base send is gas-sponsored
  // (EIP-7702 through our bundler), so no native ETH is ever required here.
  const canBuy =
    (Boolean(route) || isSwapMarket) &&
    value >= minUsd &&
    !portfolio.loading &&
    value <= balance &&
    !buy.isPending &&
    !swapBusy;

  // Instant estimate from market price: dollars spent divided by the asset's
  // unit price. This is a preview; the exact amount is quoted at buy time and
  // confirmed on the receipt.
  const preview = value > 0 && payload.priceUsd > 0 ? formatAmount(value / payload.priceUsd) : "";

  // Which spot screen the fill came from, so the two can be compared.
  const { mode: spotMode } = useSpotMode();

  const dextopusProgress = useMemo(
    () =>
      status.data
        ? depositProgress(status.data.status, status.data.executionStatus)
        : depositProgress("", ""),
    [status.data]
  );
  // A swap market reports its own phase from useMemeTrade directly, since it
  // never goes through Dextopus's deposit-status polling. `received` is an
  // on-chain-verified balanceOf delta that lands before the backend's own
  // slower confirmation — treated as settled immediately, so this screen
  // never sits on "still buying" for a trade that has already landed in the
  // wallet.
  const swapStage: DepositStage =
    memeTrade.phase === "confirmed" || memeTrade.received != null
      ? "settled"
      : memeTrade.phase === "failed"
        ? "failed"
        : memeTrade.phase === "signing" || memeTrade.phase === "confirming"
          ? "processing"
          : "waiting";
  const swapPct: Record<typeof memeTrade.phase, number> = {
    idle: 0,
    linking: 10,
    quoting: 25,
    signing: 50,
    confirming: 75,
    confirmed: 100,
    failed: 0,
  };
  const progress = isSwapMarket
    ? { stage: swapStage, pct: memeTrade.received != null ? 100 : swapPct[memeTrade.phase] }
    : dextopusProgress;
  const stage = progress.stage;
  // Shows the order-tracking view: requestId once a Dextopus buy is placed,
  // or any non-idle phase once a swap-market buy starts.
  const showTracking = isSwapMarket ? memeTrade.phase !== "idle" : requestId != null;

  // Once the order settles, refresh holdings so the new asset appears, and thank
  // the user once.
  const settledRef = useRef(false);
  // Id of the processing toast opened on confirm, resolved when the order settles.
  const toastRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!showTracking || settledRef.current) return;
    if (stage === "settled") {
      settledRef.current = true;
      // Reported on settlement rather than on confirm, so the number counts
      // filled orders and not attempts.
      track("trade_completed", {
        vertical: "spot",
        asset: payload.symbol,
        side: "buy",
        amount_usd: value,
        network: route?.chainName,
        mode: spotMode,
      });
      toast.success(t("boughtToast", { name: payload.name }), { id: toastRef.current });
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged();
    } else if (stage === "failed" || stage === "refunded") {
      settledRef.current = true;
      track("trade_failed", { vertical: "spot", asset: payload.symbol, reason: stage });
      // A swap-market failure is already toasted, with the real reason, from
      // confirm()'s own catch below — trade() only resolves or rejects once
      // the whole flow (including confirmation polling) is done, so there is
      // no later, separate failure for this effect to catch. The Dextopus
      // path is different: buy.mutateAsync resolves as soon as the order is
      // placed, and settlement (or its failure) is detected later, here.
      if (!isSwapMarket) {
        toast.error(t("purchaseRefundedToast"), { id: toastRef.current });
        toastRef.current = undefined;
      }
    }
  }, [
    showTracking,
    stage,
    isSwapMarket,
    payload.name,
    payload.symbol,
    route?.chainName,
    value,
    portfolio,
    t,
    spotMode,
  ]);

  // A loading toast never times out, and closing the sheet unmounts the settle
  // effect that would resolve it, leaving it spinning forever. Every resolution
  // path clears the ref, so on unmount anything still in it is an orphan to
  // dismiss.
  useEffect(
    () => () => {
      if (toastRef.current !== undefined) toast.dismiss(toastRef.current);
    },
    []
  );

  // Opening the sheet is opening that market. Keyed by symbol so it reports
  // once per asset rather than on every re-render of the same sheet.
  useEffect(() => {
    track("market_viewed", { vertical: "spot", asset: payload.symbol });
  }, [payload.symbol]);

  const confirm = async () => {
    if (!route && !swapRoute) return;
    // The attempt, as opposed to the fill reported on settlement. The two
    // together are what make the drop-off between them visible.
    track("trade_previewed", {
      vertical: "spot",
      asset: payload.symbol,
      side: "buy",
      amount_usd: value,
    });
    toastRef.current = toast.loading(t("buyingToast", { name: payload.name }));
    if (swapRoute) {
      try {
        await memeTrade.trade({
          side: "BUY",
          tokenAddress: swapRoute.tokenAddress,
          amount,
          slippageBps: SLIPPAGE_BPS,
        });
        toast.dismiss(toastRef.current);
        toastRef.current = undefined;
      } catch (e) {
        // useMemeTrade already records phase "failed" for the tracking view
        // below; the toast leads with its actual reason (a stale quote, a
        // reverted swap, a rejected signature) instead of a generic line that
        // hides what happened. friendlyError strips raw wallet/RPC dumps
        // (calldata, signatures, gas fields) down to plain English.
        toast.error(friendlyError(e, t("buyFailedToast", { name: payload.name })), {
          id: toastRef.current,
        });
        toastRef.current = undefined;
      }
      return;
    }
    if (!route) return;
    try {
      const result = await buy.mutateAsync({
        route,
        amount: usdcBaseUnits(amount),
        slippageBps: SLIPPAGE_BPS,
      });
      setBought(formatAmount(Number(fromBaseUnits(result.estimatedOutput, route.decimals))));
      setRequestId(result.requestId);
      // Kept so the confirmation can offer to share it. It was discarded
      // before, which is why the settled screen had nothing to point at.
      setSettledTx({ txHash: result.txHash, chainId: route.destinationChainId });
    } catch {
      // The detailed message is surfaced from buy.error below; resolve the toast.
      toast.error(t("buyFailedToast", { name: payload.name }), { id: toastRef.current });
      toastRef.current = undefined;
    }
  };

  // Order-tracking view: shown once the payment is on its way.
  if (showTracking) {
    const failed = stage === "failed" || stage === "refunded";
    const done = stage === "settled";
    // Whichever path settled. Null means the trade cannot be pointed at, and
    // then no share is offered at all.
    const settlement = isSwapMarket ? memeTrade.settled : settledTx;
    const shareRef = tradeShareRef(settlement?.chainId ?? null, settlement?.txHash ?? null);
    const color = failed ? "#f6a5a5" : done ? "#7ce7b0" : "#d4d4d8";
    const boughtAmount = isSwapMarket ? (memeTrade.received?.amount ?? "") : bought;
    return (
      <div>
        <Eyebrow>{done ? t("allDone") : t("buying")}</Eyebrow>
        <div className="mt-3 flex items-center gap-[13px]">
          <AssetIcon sym={payload.symbol} bg="#26262b" size={44} logo={payload.logo} />
          <div className="min-w-0 flex-1">
            <div className="ws-display text-[22px]">{payload.name}</div>
            <div className="truncate text-[12.5px] font-normal text-white/50">{payload.symbol}</div>
          </div>
        </div>

        <div className="ws-inset mt-4 p-4">
          <div className="mb-2.5 text-[13px] font-medium text-white">{t(STAGE_KEY[stage])}</div>
          <ProgressBar pct={progress.pct} color={color} />
          {done ? (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/70">
              {boughtAmount
                ? t("amountInAccount", { amount: boughtAmount, symbol: payload.symbol })
                : t("assetInAccount", { name: payload.name })}
            </p>
          ) : failed ? (
            <>
              <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/70">
                {t("orderFailedBody")}
              </p>
              {isSwapMarket && memeTrade.error ? (
                <p className="mt-1 text-[11px] leading-[1.4] font-normal text-white/40">
                  {friendlyError(memeTrade.error, t("orderFailedBody"))}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/60">
              {t("takesAMoment")}
            </p>
          )}
        </div>

        {/* Offered at the moment it happened, which is the only moment somebody
            actually wants to post about it. Until now the only way to share a
            trade was to leave, open the activity list and find the row.

            Only when the trade can be pointed at: an unknown chain or a hash
            that is not one yields no ref and no button, because a share that
            posts a dead link is worse than no share. */}
        {done && shareRef && (
          <button
            onClick={() => setSharing(true)}
            className="ws-press mt-5 w-full cursor-pointer rounded-[14px] border border-white/20 p-3.5 font-sans text-[15px] font-semibold text-white hover:bg-white/8"
          >
            {t("shareToSquare")}
          </button>
        )}

        <button
          onClick={onClose}
          className={`ws-chrome text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 ${
            done && shareRef ? "mt-3" : "mt-5"
          }`}
        >
          {t("done")}
        </button>

        {sharing && shareRef && (
          <ShareToSquare
            draft={{
              title: t("boughtShareTitle", { name: payload.name }),
              subtitle: boughtAmount ? `${boughtAmount} ${payload.symbol}` : payload.symbol,
              deepLink: { kind: "trade", ref: shareRef },
              suggestedText: "",
              // Same rule the activity rows follow: the figure is opt-in,
              // never carried into the card because the sharing code knew it.
              amount: value > 0 ? money.format(value) : undefined,
            }}
            open
            onClose={() => setSharing(false)}
          />
        )}
      </div>
    );
  }

  // Network chooser sub-screen, opened from the network row below.
  if (picking) {
    return (
      <NetworkPicker
        options={networkOptions}
        selected={route?.destinationChainId ?? networkOptions[0]?.chainId ?? 0}
        onSelect={(id) => {
          setChainId(id);
          setPicking(false);
        }}
        onBack={() => setPicking(false)}
      />
    );
  }

  // Order form.
  return (
    <div data-sensitive="other">
      <Eyebrow>{t("buy")}</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={payload.symbol} bg="#26262b" size={44} logo={payload.logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-display text-[22px]">{payload.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">{payload.symbol}</div>
        </div>
      </div>
      <div className="ws-inset mt-4 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>{t("amount")}</span>
          <button
            onClick={() => setAmount(String(balance))}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            {t("balanceUsd", { amount: formatAmount(balance) })}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="ws-display text-[28px] text-white/70">$</span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
            className="ws-display tnum w-full min-w-0 bg-transparent text-right text-[28px] text-white outline-none placeholder:text-white/30"
          />
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8"
          >
            ${p}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[13.5px] font-normal">
        <span className="text-white/55">{t("youGetAbout")}</span>
        <span className="tnum text-white">{preview ? `${preview} ${payload.symbol}` : "—"}</span>
      </div>
      {networkOptions.length > 0 ? (
        <div className="mt-3">
          <NetworkSelect
            options={networkOptions}
            selected={route?.destinationChainId ?? networkOptions[0].chainId}
            onOpen={() => setPicking(true)}
          />
        </div>
      ) : null}
      {buy.error ? (
        <p className="text-down mt-3 text-[13px] font-normal">
          {friendlyError(buy.error, t("purchaseFailedFallback"))}
        </p>
      ) : isSwapMarket && memeTrade.error ? (
        <p className="text-down mt-3 text-[13px] font-normal">{memeTrade.error}</p>
      ) : null}
      <button
        onClick={() => void confirm()}
        disabled={!canBuy}
        className="ws-chrome text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!route && !isSwapMarket
          ? t("unavailable")
          : value <= 0
            ? t("enterAmount")
            : belowMin
              ? t("minimumUsd", { amount: minUsd })
              : notEnough
                ? t("notEnoughBalance")
                : buy.isPending || swapBusy
                  ? t("confirming")
                  : t("buyToken", { name: payload.name })}
      </button>
    </div>
  );
}
