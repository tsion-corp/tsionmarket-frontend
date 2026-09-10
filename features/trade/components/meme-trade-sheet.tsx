"use client";

import { SOLANA_CHAIN_ID, chainSlug, networkOf } from "@/lib/meme/chain";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Portal } from "@/components/ui/portal";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/features/trade/components/meme-bits";
import { useSheetDismiss } from "@/features/trade/components/mobile-trade-sheet";
import { useMemeToken } from "@/features/trade/hooks/use-meme-tokens";
import {
  useMemePreview,
  useMemeTrade,
  type TradePhase,
} from "@/features/trade/hooks/use-meme-trade";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useReroutedWithdraw } from "@/hooks/use-withdraw";
import { usePrivy } from "@privy-io/react-auth";
import { displaySymbol } from "@/lib/buy";
import { settlementFor } from "@/lib/deposit";
import { friendlyError } from "@/lib/errors";
import { TradeApiError, isValidTradeAmount, visibleWarnings, type MemeToken } from "@/lib/meme/api";
import { buyFunding, estimateReceive } from "@/lib/meme/funding";
import { exceedsHeld, maxSellAmount } from "@/lib/meme/sell-amount";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { formatAmount, formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { belowMinimumBuy, minimumBuyUsd } from "@/lib/trade/minimums";
import {
  clearPendingRwaSettlement,
  savePendingRwaSettlement,
  type PendingRwaSettlement,
} from "@/lib/trade/pending-settlement";
import { fetchConfirmedSolanaBalance } from "@/lib/trade/solana-balance";
import { getWalletAddress } from "@/lib/user";

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const PREVIEW_DEBOUNCE_MS = 600;
// How long a phase that cannot be dismissed is allowed to run before the sheet
// admits something has gone wrong and opens the door. A wallet prompt the user
// closed without answering, or a sponsor that never replies, otherwise leaves
// the sheet on a spinner with no exit.
const STUCK_MS = 60_000;
// Same shape as the Dextopus buy/sell tracking screens: a bare percentage per
// technical phase, topped out once the trade is visually done.
const PHASE_PCT: Record<TradePhase, number> = {
  idle: 0,
  linking: 15,
  quoting: 35,
  signing: 60,
  confirming: 80,
  confirmed: 100,
  failed: 0,
};
// The USDC pre-move is its own step with its own progress, not part of the
// trade's phase machine: the trade has not started yet.
const FUNDING_PCT = 40;

// Where the Solana pre-move has got to. It runs before the trade hook is ever
// called, so it cannot borrow the trade's phase.
type FundingStep = "idle" | "moving" | "queued";

interface MemeTradeSheetProps {
  token: MemeToken;
  onClose: () => void;
  // Opens on this side; a portfolio-initiated sell starts on SELL.
  defaultSide?: "BUY" | "SELL";
  // The generic on-chain risk scanner (contract-upgradeable, low-liquidity
  // warnings) is genuinely useful for arbitrary memecoins, but confusing for
  // known-safe wrapped spot assets (cbBTC, cbDOGE) that route through this
  // same trade engine only because Dextopus can't source them. Off by default
  // for spot call sites; the meme discovery pages opt back in explicitly.
  showRisk?: boolean;
}

// Display edge, and only the display edge: group the whole part and clamp the
// fraction, on strings, so a holding never routes through a float on its way
// to the screen. A memecoin balance routinely runs past 2^53 base units.
function formatHeld(raw: string, decimals: number): string {
  const [whole = "0", frac = ""] = fromBaseUnits(BigInt(raw), decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const shown = frac.slice(0, 4).replace(/0+$/, "");
  return shown ? `${grouped}.${shown}` : grouped;
}

// The two records handed to the background settlement tracker. Built here
// rather than inline in the sheet: a record's id and the moment it was created
// are facts about the record, and they belong with it.
function purchaseHandoff(input: {
  requestId: string;
  assetAddress: string;
  assetSymbol: string;
  amountInRaw: string;
  startingUsdcRaw: string;
  minimumDeliveryRaw?: string;
  slippageBps: number;
}): PendingRwaSettlement {
  return {
    requestId: input.requestId,
    product: "meme",
    direction: "base-to-solana",
    assetSymbol: input.assetSymbol,
    createdAt: Date.now(),
    purchase: {
      assetAddress: input.assetAddress,
      assetSymbol: input.assetSymbol,
      amountInRaw: input.amountInRaw,
      startingUsdcRaw: input.startingUsdcRaw,
      minimumDeliveryRaw: input.minimumDeliveryRaw,
      slippageBps: input.slippageBps,
    },
  };
}

function saleHandoff(input: {
  assetSymbol: string;
  startingUsdcRaw: string;
  minimumProceedsRaw: string;
  expectedProceedsRaw: string;
  slippageBps: number;
}): PendingRwaSettlement {
  return {
    requestId: `meme-sale:${crypto.randomUUID()}`,
    product: "meme",
    direction: "solana-to-base",
    assetSymbol: input.assetSymbol,
    createdAt: Date.now(),
    sale: {
      startingUsdcRaw: input.startingUsdcRaw,
      minimumProceedsRaw: input.minimumProceedsRaw,
      expectedProceedsRaw: input.expectedProceedsRaw,
      slippageBps: input.slippageBps,
    },
  };
}

// The whole trade flow in one sheet: side + amount → live indicative preview →
// explicit confirm → firm quote, sponsored calls, submission registration and
// status polling. Success is only ever the backend's CONFIRMED.
export function MemeTradeSheet({
  token: listed,
  onClose,
  defaultSide = "BUY",
  showRisk = true,
}: MemeTradeSheetProps) {
  const t = useTranslations("meme");
  // Fresh risk/tradability for the trade surface; the list row may be stale.
  const { token: fresh } = useMemeToken(listed);
  const token = fresh ?? listed;

  // Known-safe wrapped spot assets (cbBTC, cbDOGE) show as the coin they
  // represent everywhere in this sheet; trade() below still sends
  // token.address, the real contract, so execution never sees the alias.
  const rawSymbol = token.symbol ?? "";
  const displaySym = displaySymbol(rawSymbol);
  const aliased = displaySym !== rawSymbol;
  const displayName = aliased ? displaySym : (token.name ?? "—");

  const [side, setSide] = useState<"BUY" | "SELL">(defaultSide);
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const { walletFor, phase, error, received, trade, reset, linkForPreview } = useMemeTrade();
  // The token's chain picks the wallet that pays and holds, and the network
  // the portfolio files its balances under.
  const wallet = walletFor(token.chainId);
  const network = networkOf(token.chainId);
  // The USD side is always Base; the coin side is the token's chain.
  const tradedNetworks = scopeOf("base-mainnet", network);
  const portfolio = usePortfolio();
  const linkTriedRef = useRef(false);
  const { user } = usePrivy();
  const { withdraw: routeUsdc } = useReroutedWithdraw("trade");
  const [funding, setFunding] = useState<FundingStep>("idle");
  const [fundError, setFundError] = useState<unknown>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedAmount(amount), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [amount]);

  const buying = side === "BUY";
  const sideEnabled = buying ? token.buyEnabled : token.sellEnabled;
  // BUY spends formatted USDC (6dp); SELL spends the token at its decimals.
  const maxDecimals = buying ? 6 : (token.decimals ?? 18);
  const amountValid = isValidTradeAmount(debouncedAmount, maxDecimals);

  // The user has one USD balance: their Base USDC. A coin on Solana is paid
  // for by moving that USDC to the Solana wallet first, so on Solana both
  // sides of the move count as spendable. Which chain any of this is on is
  // never shown.
  const usdcOn = (net: string) =>
    portfolio.tokens.find((p) => p.network === net && p.symbol.toUpperCase() === "USDC")?.balance ??
    0;
  const baseUsdc = usdcOn("base-mainnet");
  const solanaUsdc = usdcOn("solana-mainnet");
  const onSolana = token.chainId === SOLANA_CHAIN_ID;
  const payValue = amountValid ? Number(debouncedAmount) : 0;
  const {
    spendableUsd,
    needsFunding: shortOnSolana,
    fundingUsd,
    canFund,
  } = buyFunding({ chainId: token.chainId, payUsd: payValue, baseUsdc, solanaUsdc });
  const minBuyUsd = minimumBuyUsd(onSolana);
  const belowMin = buying && belowMinimumBuy(payValue, onSolana);
  // EVM addresses compare case-insensitively; a Solana mint is case-sensitive.
  const sameAddress = (a: string | null | undefined) =>
    onSolana ? a === token.address : a?.toLowerCase() === token.address.toLowerCase();
  const held = portfolio.tokens.find((p) => p.network === network && sameAddress(p.address));
  const heldBalance = held?.balance ?? 0;
  // The exact holding, in base units, sizes a sale; the float is for display.
  const heldRaw = held?.rawBalance ?? "0";
  const heldDecimals = held?.decimals ?? token.decimals ?? 18;
  const balance = buying ? spendableUsd : heldBalance;
  const overBalance =
    amountValid &&
    (buying
      ? Number(debouncedAmount) > balance + 1e-9
      : exceedsHeld(debouncedAmount, heldRaw, heldDecimals));
  // A Solana buy that needs the move cannot be previewed by the trade service
  // yet (it checks the Solana wallet's balance), so the sheet shows an
  // estimate from the listed price until the USDC has landed.
  const needsFunding = buying && shortOnSolana;
  const fundingBlocked = needsFunding && !canFund;

  // One-tap full balance: buys floor to cents so 100% never rounds above the
  // USDC balance; sells are the exact base-unit holding, because a float
  // rendered at the token's decimals invents digits the wallet never held
  // and the trade service refuses an amount one base unit over.
  const fillMax = () => {
    if (balance <= 0) return;
    if (buying) {
      setAmount((Math.floor(balance * 100) / 100).toFixed(2));
      return;
    }
    setAmount(maxSellAmount(heldRaw, heldDecimals));
  };

  // The compiler memoizes this; a manual useMemo here fought its inference.
  // Off from the moment a trade starts: a refetch after the sale would ask
  // for the amount just sold and be refused for a balance no longer there.
  const previewOpen = phase === "idle" || phase === "failed";
  const previewInput =
    previewOpen &&
    amountValid &&
    sideEnabled &&
    !overBalance &&
    !belowMin &&
    !needsFunding &&
    wallet
      ? {
          side,
          tokenAddress: token.address,
          amount: debouncedAmount,
          walletAddress: wallet,
          chainId: token.chainId,
        }
      : null;
  const preview = useMemePreview(previewInput);

  // A first-ever preview 403s until the wallet is linked; link once (headless
  // signature) and refetch. One attempt per sheet — a second mismatch is real.
  const previewError = preview.error;
  const previewRefetch = preview.refetch;
  useEffect(() => {
    if (
      previewError instanceof TradeApiError &&
      previewError.code === "WALLET_OWNERSHIP_MISMATCH" &&
      !linkTriedRef.current
    ) {
      linkTriedRef.current = true;
      void linkForPreview(token.chainId)
        .then(() => previewRefetch())
        .catch(() => {});
    }
  }, [previewError, linkForPreview, previewRefetch, token.chainId]);

  // A quote has a lifetime and the service publishes it. Watch for the moment
  // it lapses so the figures stop being presented as a price the user can act
  // on, rather than sitting on screen looking current for as long as the sheet
  // is open.
  const quoteExpiresAt = preview.data ? Date.parse(preview.data.expiresAt) : null;
  // The lapse is recorded by a timer rather than read off the clock in render,
  // so the sheet re-renders exactly once, at the moment the price stops being
  // one the user can act on. A quote that arrived already stale gets a
  // zero-delay timer, which is the same path one second later.
  const [lapsedAt, setLapsedAt] = useState<number | null>(null);
  useEffect(() => {
    if (quoteExpiresAt === null || Number.isNaN(quoteExpiresAt)) return;
    const id = setTimeout(
      () => setLapsedAt(quoteExpiresAt),
      Math.max(0, quoteExpiresAt - Date.now())
    );
    return () => clearTimeout(id);
  }, [quoteExpiresAt]);

  // Tied to the quote it belongs to, so the record of the last lapse can never
  // condemn the quote that replaced it.
  const quoteExpired = lapsedAt !== null && lapsedAt === quoteExpiresAt;
  // The quote describes the debounced amount. While the field holds something
  // newer, the numbers on screen belong to a trade the user is no longer
  // asking for, so they are not shown as if they did.
  const quoteMatchesField = amount.trim() === debouncedAmount.trim();
  // The one value the rest of the sheet reads. Null means there is no figure
  // to show and nothing to trade on: nothing here invents one.
  const quote = preview.data && !quoteExpired && quoteMatchesField ? preview.data : null;
  const quotePending = preview.isFetching || !quoteMatchesField;

  const tradeBusy = phase !== "idle" && phase !== "failed" && phase !== "confirmed";
  const busy = tradeBusy || funding === "moving";
  // The balanceOf delta (received) is on-chain proof of delivery, landing
  // before the backend's own slower confirmation — treat it as done rather
  // than making the tracking screen sit on "confirming" for a trade that has
  // already, verifiably, settled.
  const settled = phase === "confirmed" || received != null;
  const estimate = needsFunding ? estimateReceive(payValue, token.priceUsd) : null;
  const submitDisabled =
    busy ||
    !amountValid ||
    !sideEnabled ||
    overBalance ||
    belowMin ||
    fundingBlocked ||
    !wallet ||
    (needsFunding ? fundingUsd <= 0 : !quote);
  // A quote that fails for any reason other than the auto-retried wallet-link
  // mismatch above leaves the details card empty with no other visible signal.
  // Surface it explicitly once there is a real amount to quote.
  const previewFailed =
    amountValid &&
    sideEnabled &&
    !overBalance &&
    !belowMin &&
    !needsFunding &&
    !preview.isFetching &&
    !preview.data
      ? (previewError ?? null)
      : null;

  // Every reason the action cannot be taken, in the order the user should hear
  // them. The action is never both disabled and silent: a greyed button that
  // still reads "Buy PEPE" is indistinguishable from one the user simply has
  // not filled in yet.
  const ctaLabel = !sideEnabled
    ? t("sideDisabled")
    : !wallet
      ? t("connectWallet")
      : overBalance || fundingBlocked
        ? t("notEnough")
        : belowMin
          ? t("minimumUsd", { amount: minBuyUsd })
          : quoteExpired && quoteMatchesField
            ? t("quoteExpired")
            : amountValid && !needsFunding && !quote
              ? t("phaseQuoting")
              : buying
                ? t("ctaBuy", { symbol: displaySym })
                : t("ctaSell", { symbol: displaySym });

  // Toasts fire even after the sheet is dismissed mid-confirmation, so the
  // terminal result always reaches the user.
  useEffect(() => {
    track("market_viewed", { vertical: "memecoin", asset: token.symbol ?? token.address });
  }, [token.symbol, token.address]);

  // Id of the loading toast opened on confirm — same pattern as the Dextopus
  // sell/buy sheets, so a spot asset routed through this engine (cbBTC,
  // cbDOGE) gives the same "something is happening" feedback atop the screen
  // as every other spot asset, instead of only the sheet's own inline phase
  // text.
  const toastRef = useRef<string | number | undefined>(undefined);
  // True between handing an order to the network and its terminal toast. The
  // unmount cleanup below must not dismiss the toast in that window: it is the
  // whole of what "close and notify me" promises.
  const inFlightRef = useRef(false);
  useEffect(
    () => () => {
      if (toastRef.current !== undefined && !inFlightRef.current) toast.dismiss(toastRef.current);
    },
    []
  );

  // Solana buy that needs the move: send Base USDC to the user's Solana
  // wallet through the strict Dextopus route and hand the order to the
  // dashboard-level tracker, which buys the coin once the USDC lands. The
  // sheet's part is over at that point, and it says so rather than vanishing.
  async function fundAndQueue() {
    if (submitDisabled) return;
    const baseWallet = getWalletAddress(user, "ethereum");
    const solanaWallet = getWalletAddress(user, "solana");
    if (!baseWallet || !solanaWallet) {
      setFundError(new Error(t("connectWallet")));
      toast.error(t("connectWallet"));
      return;
    }
    setFundError(null);
    setStuckFlag(false);
    setFunding("moving");
    inFlightRef.current = true;
    toastRef.current = toast.loading(t("fundWorking"));
    try {
      const base = settlementFor("ethereum");
      const solana = settlementFor("solana");
      const startingUsdcRaw = await fetchConfirmedSolanaBalance(solanaWallet, solana.asset);
      const result = await routeUsdc({
        originNetwork: "base-mainnet",
        originChainId: base.chainId,
        originTokenAddress: base.asset,
        originDecimals: base.decimals,
        destinationChainId: solana.chainId,
        destinationAsset: solana.asset,
        to: solanaWallet,
        amount: toBaseUnits(fundingUsd.toFixed(6), base.decimals),
        refundTo: baseWallet,
      });
      savePendingRwaSettlement(
        purchaseHandoff({
          requestId: result.depositRequestId,
          assetAddress: token.address,
          assetSymbol: displaySym || token.address,
          amountInRaw: toBaseUnits(debouncedAmount, solana.decimals).toString(),
          startingUsdcRaw: startingUsdcRaw.toString(),
          minimumDeliveryRaw: result.minAmountOut,
          slippageBps: 100,
        })
      );
      track("trade_previewed", {
        vertical: "memecoin",
        asset: token.symbol ?? token.address,
        side: "buy",
        amount_usd: payValue,
      });
      inFlightRef.current = false;
      toast.success(t("purchaseQueued", { symbol: displaySym }), { id: toastRef.current });
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged(tradedNetworks);
      setFunding("queued");
    } catch (e) {
      inFlightRef.current = false;
      setFunding("idle");
      // The toast can be gone by the time the user looks up. The sheet is
      // still open, so the reason belongs in it as well.
      setFundError(e);
      toast.error(friendlyError(e, t("fundFailed")), { id: toastRef.current });
      toastRef.current = undefined;
    }
  }

  async function onTrade() {
    if (submitDisabled) return;
    setStuckFlag(false);
    track("trade_previewed", {
      vertical: "memecoin",
      asset: token.symbol ?? token.address,
      side: buying ? "buy" : "sell",
      amount_usd: Number(debouncedAmount),
    });
    inFlightRef.current = true;
    toastRef.current = toast.loading(
      buying ? t("buyingToast", { symbol: displaySym }) : t("sellingToast", { symbol: displaySym })
    );
    // A Solana sale pays out in Solana USDC. Record what it should deliver
    // before signing, so the tracker can route exactly those proceeds back to
    // the user's USD balance, and nothing else in that wallet.
    let saleHandoffId: string | null = null;
    try {
      if (!buying && onSolana && wallet && quote) {
        const startingUsdcRaw = await fetchConfirmedSolanaBalance(
          wallet,
          settlementFor("solana").asset
        );
        const minimum = BigInt(quote.minimumBuyAmountAtomic);
        const expected = BigInt(quote.expectedBuyAmountAtomic);
        const handoff = saleHandoff({
          assetSymbol: displaySym || token.address,
          startingUsdcRaw: startingUsdcRaw.toString(),
          minimumProceedsRaw: minimum.toString(),
          expectedProceedsRaw: (expected < minimum ? minimum : expected).toString(),
          slippageBps: quote.slippageBps,
        });
        saleHandoffId = handoff.requestId;
        savePendingRwaSettlement(handoff);
      }
      await trade({
        side,
        tokenAddress: token.address,
        amount: debouncedAmount,
        chainId: token.chainId,
      });
      // Settles on the token's own chain, and carries the risk label the
      // screen showed the user before they confirmed.
      track("trade_completed", {
        vertical: "memecoin",
        token: token.symbol ?? token.address,
        side: buying ? "buy" : "sell",
        amount_usd: Number(debouncedAmount),
        network: chainSlug(token.chainId) ?? "base",
      });
      inFlightRef.current = false;
      toast.success(
        buying
          ? t("toastBought", { symbol: displaySym })
          : saleHandoffId
            ? t("proceedsWorking")
            : t("toastSold", { symbol: displaySym }),
        { id: toastRef.current }
      );
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged(tradedNetworks);
    } catch (e) {
      inFlightRef.current = false;
      if (saleHandoffId) clearPendingRwaSettlement(saleHandoffId);
      // A failure after signing may still have moved the balance. Read it
      // fresh so the form does not argue with an amount the wallet no longer
      // holds, or refuse one it now does.
      void portfolio.refetchFresh(tradedNetworks);
      track("trade_failed", {
        vertical: "memecoin",
        asset: token.symbol ?? token.address,
        reason: "order_failed",
      });
      toast.error(friendlyError(e, t("orderFailed")), { id: toastRef.current });
      toastRef.current = undefined;
    }
  }

  // Signing must not be interrupted, but backend verification can run without
  // the sheet — the poll continues and the toast above delivers the outcome.
  const locked = phase === "linking" || phase === "quoting" || phase === "signing";

  // A locked phase that never ends is a trap: no backdrop, no Escape, no close
  // button. It happens for real — a wallet prompt dismissed without an answer,
  // a sponsor that never replies. After a bounded wait the sheet says so and
  // lets the user out, while being honest that leaving does not cancel a
  // signature already sent.
  const [stuckFlag, setStuckFlag] = useState(false);
  useEffect(() => {
    if (!locked) return;
    const id = setTimeout(() => setStuckFlag(true), STUCK_MS);
    return () => clearTimeout(id);
  }, [locked]);
  // Only ever raised by the timer above, and cleared where a new attempt
  // starts, so leaving a locked phase cannot leave the warning behind.
  const stuck = locked && stuckFlag;

  const heldShut = locked && !stuck;
  const closeSheet = () => {
    if (heldShut) return;
    if (!locked && phase !== "confirming") reset();
    onClose();
  };

  const { ref: sheetRef, onKeyDown } = useSheetDismiss({
    open: true,
    onClose: closeSheet,
    locked: heldShut,
  });

  // Verification usually lands in under a minute; past that, say so honestly
  // and point at the door.
  const [confirmingLong, setConfirmingLong] = useState(false);
  useEffect(() => {
    if (phase !== "confirming") return;
    const id = setTimeout(() => setConfirmingLong(true), 90_000);
    return () => {
      clearTimeout(id);
      setConfirmingLong(false);
    };
  }, [phase]);

  const phaseLabel: Record<string, string> = {
    linking: t("phaseLinking"),
    quoting: t("phaseQuoting"),
    signing: t("phaseSigning"),
    confirming: t("phaseConfirming"),
  };

  const moving = funding === "moving";
  const queued = funding === "queued";
  const tracking = busy || phase === "confirmed" || queued;
  const trackTitle = queued
    ? t("queuedTitle")
    : moving
      ? t("fundWorking")
      : phase === "confirmed"
        ? t("confirmedTitle")
        : received
          ? t("receivedTitle", { amount: received.amount, symbol: displaySymbol(received.symbol) })
          : (phaseLabel[phase] ?? "");
  const trackBody = queued
    ? t("purchaseQueued", { symbol: displaySym })
    : moving
      ? t("workingNote")
      : phase === "confirmed"
        ? t("confirmedBody")
        : received
          ? t("receivedBody")
          : phase !== "confirming"
            ? t("workingNote")
            : confirmingLong
              ? t("confirmingLong")
              : t("confirmingNote");
  const trackPct = queued || settled ? 100 : moving ? FUNDING_PCT : PHASE_PCT[phase];
  const warnings = showRisk ? visibleWarnings(token.warnings) : [];
  const balanceLabel = buying ? formatAmount(balance) : formatHeld(heldRaw, heldDecimals);

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          key="sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={displaySym || displayName}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 340, damping: 34 }}
          className="bg-sheet fixed inset-x-0 bottom-0 z-[421] mx-auto w-full max-w-[480px] rounded-t-[24px] border border-white/12 p-5 pb-[max(28px,env(safe-area-inset-bottom))] outline-none"
        >
          <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

          {tracking ? (
            <Eyebrow>
              {settled || queued ? t("allDone") : buying ? t("buyingLabel") : t("sellingLabel")}
            </Eyebrow>
          ) : null}

          <div className={`flex items-center gap-3 ${tracking ? "mt-3" : ""}`}>
            <MemeCoin token={token} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="ws-display truncate text-[18px]">{displaySym || "?"}</span>
                {showRisk ? <RiskBadge level={token.riskLevel} /> : null}
              </div>
              <div className="truncate text-xs font-normal text-white/50">{displayName}</div>
            </div>
            <div className="text-right">
              <div className="tnum text-[15px]">{priceLabel(token.priceUsd)}</div>
              <div className="text-xs">
                <PctChange value={token.priceChange24hPercent} />
              </div>
            </div>
          </div>

          {tracking ? (
            <div className="mt-5">
              <div className="ws-inset p-4">
                <div
                  data-testid="meme-phase-title"
                  className="mb-2.5 text-[13px] font-medium text-white"
                >
                  {trackTitle}
                </div>
                {/* The primitive draws the bar; the role and the value are what
                    make it readable to anything that is not looking at it. */}
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={trackPct}
                  aria-label={trackTitle}
                >
                  <ProgressBar pct={trackPct} color={settled || queued ? "#7ce7b0" : "#e6e6e6"} />
                </div>
                <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/60">
                  {trackBody}
                </p>
                {stuck ? (
                  <p
                    data-testid="meme-stuck"
                    role="alert"
                    className="text-down mt-3 text-[12.5px] leading-[1.5] font-normal"
                  >
                    {t("stuckNote")}
                  </p>
                ) : null}
              </div>
              {/* Signing needs the sheet to stay put — closing here does not cancel
                  the in-flight signature request, only hides it mid-flow. Once the
                  calls are submitted (confirming) or done, closing is always safe,
                  and a signature that has hung past STUCK_MS opens the door too. */}
              {!heldShut ? (
                <button
                  type="button"
                  onClick={closeSheet}
                  className="ws-chrome text-ink mt-4 min-h-11 w-full cursor-pointer rounded-full p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 md:min-h-auto md:rounded-[14px]"
                >
                  {settled || queued ? t("done") : t("closeAndNotify")}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("BUY")}
                  aria-pressed={buying}
                  className={`min-h-11 cursor-pointer rounded-full p-3 font-sans text-sm font-semibold transition-colors md:min-h-auto md:rounded-xl ${
                    buying
                      ? "border-up/40 bg-up/16 text-up border"
                      : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
                  }`}
                >
                  {t("buy")}
                </button>
                <button
                  type="button"
                  onClick={() => setSide("SELL")}
                  aria-pressed={!buying}
                  className={`min-h-11 cursor-pointer rounded-full p-3 font-sans text-sm font-semibold transition-colors md:min-h-auto md:rounded-xl ${
                    !buying
                      ? "border-down/40 bg-down/14 text-down border"
                      : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
                  }`}
                >
                  {t("sell")}
                </button>
              </div>

              <div className={`ws-inset mt-3 p-4 ${overBalance ? "ws-invalid" : ""}`}>
                <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
                  <span>{buying ? t("youPay") : t("youSell")}</span>
                  <span className="flex items-center gap-2">
                    <span className="tnum">
                      {t("balance", {
                        amount: balanceLabel,
                        symbol: buying ? "USD" : displaySym,
                      })}
                    </span>
                    {/* The pill is what the design draws; the pseudo-element
                        gives a thumb the 44px it needs without moving it. */}
                    <button
                      type="button"
                      onClick={fillMax}
                      disabled={balance <= 0}
                      className="relative cursor-pointer rounded-full border border-white/15 px-2 py-0.5 font-sans text-[10.5px] font-semibold text-white/70 after:absolute after:-inset-x-2 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 md:after:content-none"
                    >
                      {t("max")}
                    </button>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <input
                    value={amount}
                    onChange={(e) => {
                      const next = e.target.value.replace(/,/g, "");
                      if (next === "" || DECIMAL_INPUT.test(next)) setAmount(next);
                    }}
                    aria-label={buying ? t("youPay") : t("youSell")}
                    aria-invalid={overBalance}
                    inputMode="decimal"
                    placeholder="0"
                    className="ws-display tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
                  />
                  <span className="shrink-0 font-sans text-sm font-medium text-white/70">
                    {buying ? "USD" : displaySym}
                  </span>
                </div>
              </div>

              {/* Four figures that only ever come from a live quote. There is no
                  branch here that computes one: no quote, no number. */}
              <div className="ws-inset mt-3 flex flex-col gap-2 p-4 text-[12.5px] font-normal">
                <div className="flex justify-between">
                  <span className="text-white/55">{t("youReceive")}</span>
                  <span className="tnum text-white">
                    {quote
                      ? `${quote.expectedBuyAmountFormatted} ${displaySymbol(quote.buyToken.symbol ?? "")}`
                      : estimate != null
                        ? `≈ ${formatAmount(estimate)} ${displaySym}`
                        : quotePending
                          ? "…"
                          : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/55">{t("minReceived")}</span>
                  <span className="tnum text-white">
                    {quote
                      ? `${quote.minimumBuyAmountFormatted} ${displaySymbol(quote.buyToken.symbol ?? "")}`
                      : quotePending
                        ? "…"
                        : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/55">{t("priceImpact")}</span>
                  <span className="tnum text-white">
                    {quote?.priceImpactBps != null
                      ? `${(quote.priceImpactBps / 100).toFixed(2)}%`
                      : quotePending
                        ? "…"
                        : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/55">{t("slippage")}</span>
                  <span className="tnum text-white">
                    {quote ? `${(quote.slippageBps / 100).toFixed(2)}%` : quotePending ? "…" : "—"}
                  </span>
                </div>
              </div>

              {quoteExpired && quoteMatchesField ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-normal text-white/60">
                    {t("quoteExpired")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void previewRefetch()}
                    className="min-h-11 cursor-pointer rounded-full border border-white/15 px-3 font-sans text-[12px] font-semibold text-white/80 hover:border-white/35 hover:text-white"
                  >
                    {t("retry")}
                  </button>
                </div>
              ) : null}
              {previewFailed ? (
                <div className="text-down mt-2 text-[12.5px] font-normal">
                  {friendlyError(previewFailed, t("previewFailed"))}
                </div>
              ) : null}
              {needsFunding && !fundingBlocked ? (
                <p className="mt-2 text-[11.5px] font-normal text-white/45">{t("estimateNote")}</p>
              ) : null}
              {fundingBlocked ? (
                <div className="text-down mt-2 text-[12.5px] font-normal">
                  {t("fundShort", { amount: formatUsd(fundingUsd) })}
                </div>
              ) : null}

              {warnings.length > 0 ? (
                <div className="mt-3 flex flex-col gap-1">
                  {/* Warning codes can repeat or arrive empty, so the key needs
                      the index. */}
                  {warnings.slice(0, 3).map((w, i) => (
                    <div key={`${w.code}-${i}`} className="text-down/90 text-[11.5px] font-normal">
                      {w.message}
                    </div>
                  ))}
                </div>
              ) : null}
              {showRisk ? (
                <p className="mt-2 text-[11px] font-normal text-white/40">{t("riskDisclaimer")}</p>
              ) : null}

              {error || fundError ? (
                <div role="alert" className="text-down mt-2 text-[12.5px] font-normal">
                  {fundError
                    ? friendlyError(fundError, t("fundFailed"))
                    : friendlyError(error, t("orderFailed"))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void (needsFunding ? fundAndQueue() : onTrade())}
                disabled={submitDisabled}
                className={`mt-3 min-h-11 w-full rounded-full p-[15px] font-sans text-[15px] font-semibold md:min-h-auto md:rounded-[14px] ${
                  buying ? "bg-up text-up-ink" : "bg-down text-down-ink"
                } ${submitDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"}`}
              >
                {ctaLabel}
              </button>
            </>
          )}
        </motion.div>
        {/* After the panel so a keyboard reaches the form before the dismissal,
            and inert while a signature is in flight. */}
        <motion.button
          key="backdrop"
          type="button"
          aria-label={t("cancel")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          disabled={heldShut}
          onClick={closeSheet}
          className="fixed inset-0 z-[420] cursor-default bg-black/65 backdrop-blur-sm"
        />
      </AnimatePresence>
    </Portal>
  );
}
