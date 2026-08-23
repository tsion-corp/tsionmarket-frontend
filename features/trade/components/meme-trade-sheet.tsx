"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/features/trade/components/meme-bits";
import { useMemeToken } from "@/features/trade/hooks/use-meme-tokens";
import {
  useMemePreview,
  useMemeTrade,
  type TradePhase,
} from "@/features/trade/hooks/use-meme-trade";
import { usePortfolio } from "@/hooks/use-portfolio";
import { displaySymbol } from "@/lib/buy";
import { friendlyError } from "@/lib/errors";
import { TradeApiError, isValidTradeAmount, visibleWarnings, type MemeToken } from "@/lib/meme/api";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const PREVIEW_DEBOUNCE_MS = 600;
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
  const { token: fresh } = useMemeToken(listed.address);
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
  const { wallet, phase, error, received, trade, reset, linkForPreview } = useMemeTrade();
  const portfolio = usePortfolio();
  const linkTriedRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedAmount(amount), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [amount]);

  const buying = side === "BUY";
  const sideEnabled = buying ? token.buyEnabled : token.sellEnabled;
  // BUY spends formatted USDC (6dp); SELL spends the token at its decimals.
  const maxDecimals = buying ? 6 : (token.decimals ?? 18);
  const amountValid = isValidTradeAmount(debouncedAmount, maxDecimals);

  const usdcBalance =
    portfolio.tokens.find((p) => p.network === "base-mainnet" && p.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const heldBalance =
    portfolio.tokens.find(
      (p) =>
        p.network === "base-mainnet" && p.address?.toLowerCase() === token.address.toLowerCase()
    )?.balance ?? 0;
  const balance = buying ? usdcBalance : heldBalance;
  const overBalance = amountValid && Number(debouncedAmount) > balance + 1e-9;

  // One-tap full balance: buys floor to cents so 100% never rounds above the
  // USDC balance; sells render at the token's own precision (String() would
  // emit scientific notation for dust).
  const fillMax = () => {
    if (balance <= 0) return;
    if (buying) {
      setAmount((Math.floor(balance * 100) / 100).toFixed(2));
      return;
    }
    const fixed = balance.toFixed(token.decimals ?? 18);
    setAmount(fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed);
  };

  const previewInput = useMemo(
    () =>
      amountValid && sideEnabled && !overBalance && wallet
        ? { side, tokenAddress: token.address, amount: debouncedAmount, walletAddress: wallet }
        : null,
    [amountValid, sideEnabled, overBalance, wallet, side, token.address, debouncedAmount]
  );
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
      void linkForPreview()
        .then(() => previewRefetch())
        .catch(() => {});
    }
  }, [previewError, linkForPreview, previewRefetch]);

  const busy = phase !== "idle" && phase !== "failed" && phase !== "confirmed";
  // The balanceOf delta (received) is on-chain proof of delivery, landing
  // before the backend's own slower confirmation — treat it as done rather
  // than making the tracking screen sit on "confirming" for a trade that has
  // already, verifiably, settled.
  const settled = phase === "confirmed" || received != null;
  const submitDisabled =
    busy || !amountValid || !sideEnabled || overBalance || !preview.data || !wallet;
  // A quote that fails for any reason other than the auto-retried wallet-link
  // mismatch above leaves preview.data null with no other visible signal —
  // the CTA just sits disabled, indistinguishable from "no amount entered
  // yet". Surface it explicitly once there is a real amount to quote.
  const previewFailed =
    amountValid && sideEnabled && !overBalance && !preview.isFetching && !preview.data
      ? (previewError ?? null)
      : null;

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
  useEffect(
    () => () => {
      if (toastRef.current !== undefined) toast.dismiss(toastRef.current);
    },
    []
  );

  const onTrade = async () => {
    if (submitDisabled) return;
    track("trade_previewed", {
      vertical: "memecoin",
      asset: token.symbol ?? token.address,
      side: buying ? "buy" : "sell",
      amount_usd: Number(debouncedAmount),
    });
    toastRef.current = toast.loading(
      buying ? t("buyingToast", { symbol: displaySym }) : t("sellingToast", { symbol: displaySym })
    );
    try {
      await trade({ side, tokenAddress: token.address, amount: debouncedAmount });
      // Memecoins always settle on Base, and carry the risk label the screen
      // showed the user before they confirmed.
      track("trade_completed", {
        vertical: "memecoin",
        token: token.symbol ?? token.address,
        side: buying ? "buy" : "sell",
        amount_usd: Number(debouncedAmount),
        network: "base",
      });
      toast.success(
        buying ? t("toastBought", { symbol: displaySym }) : t("toastSold", { symbol: displaySym }),
        { id: toastRef.current }
      );
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged();
    } catch (e) {
      track("trade_failed", {
        vertical: "memecoin",
        asset: token.symbol ?? token.address,
        reason: "order_failed",
      });
      toast.error(friendlyError(e, t("orderFailed")), { id: toastRef.current });
      toastRef.current = undefined;
    }
  };

  // Signing must not be interrupted, but backend verification can run without
  // the sheet — the poll continues and the toast above delivers the outcome.
  const locked = phase === "linking" || phase === "quoting" || phase === "signing";
  const closeSheet = () => {
    if (locked) return;
    if (phase !== "confirming") reset();
    onClose();
  };

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

  return (
    <AnimatePresence>
      <motion.button
        key="backdrop"
        aria-label={t("cancel")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={locked ? undefined : closeSheet}
        className="fixed inset-0 z-[420] cursor-default bg-black/65 backdrop-blur-sm"
      />
      <motion.div
        key="sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="bg-sheet fixed inset-x-0 bottom-0 z-[421] mx-auto w-full max-w-[480px] rounded-t-[24px] border border-white/12 p-5 pb-7"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

        {busy || phase === "confirmed" ? (
          <Eyebrow>
            {settled ? t("allDone") : buying ? t("buyingLabel") : t("sellingLabel")}
          </Eyebrow>
        ) : null}

        <div className={`flex items-center gap-3 ${busy || phase === "confirmed" ? "mt-3" : ""}`}>
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

        {busy || phase === "confirmed" ? (
          <div className="mt-5">
            <div className="ws-inset p-4">
              <div className="mb-2.5 text-[13px] font-medium text-white">
                {phase === "confirmed"
                  ? t("confirmedTitle")
                  : received
                    ? t("receivedTitle", {
                        amount: received.amount,
                        symbol: displaySymbol(received.symbol),
                      })
                    : phaseLabel[phase]}
              </div>
              <ProgressBar
                pct={settled ? 100 : PHASE_PCT[phase]}
                color={settled ? "#7ce7b0" : "#e6e6e6"}
              />
              <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/60">
                {phase === "confirmed"
                  ? t("confirmedBody")
                  : received
                    ? t("receivedBody")
                    : phase !== "confirming"
                      ? t("workingNote")
                      : confirmingLong
                        ? t("confirmingLong")
                        : t("confirmingNote")}
              </p>
            </div>
            {/* Signing needs the sheet to stay put — closing here does not cancel
                the in-flight signature request, only hides it mid-flow. Once the
                calls are submitted (confirming) or done, closing is always safe. */}
            {!locked ? (
              <button
                onClick={closeSheet}
                className="ws-chrome text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
              >
                {settled ? t("done") : t("closeAndNotify")}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("BUY")}
                className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
                  buying
                    ? "border-up/40 bg-up/16 text-up border"
                    : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
                }`}
              >
                {t("buy")}
              </button>
              <button
                onClick={() => setSide("SELL")}
                className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
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
                      amount: balance.toLocaleString(undefined, { maximumFractionDigits: 6 }),
                      symbol: buying ? "USD" : displaySym,
                    })}
                  </span>
                  <button
                    onClick={fillMax}
                    disabled={balance <= 0}
                    className="cursor-pointer rounded-full border border-white/15 px-2 py-0.5 font-sans text-[10.5px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
                  inputMode="decimal"
                  placeholder="0"
                  className="ws-display tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
                />
                <span className="shrink-0 font-sans text-sm font-medium text-white/70">
                  {buying ? "USD" : displaySym}
                </span>
              </div>
            </div>

            <div className="ws-inset mt-3 flex flex-col gap-2 p-4 text-[12.5px] font-normal">
              <div className="flex justify-between">
                <span className="text-white/55">{t("youReceive")}</span>
                <span className="tnum text-white">
                  {preview.data
                    ? `${preview.data.expectedBuyAmountFormatted} ${displaySymbol(preview.data.buyToken.symbol ?? "")}`
                    : preview.isFetching
                      ? "…"
                      : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">{t("minReceived")}</span>
                <span className="tnum text-white">
                  {preview.data
                    ? `${preview.data.minimumBuyAmountFormatted} ${displaySymbol(preview.data.buyToken.symbol ?? "")}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">{t("priceImpact")}</span>
                <span className="tnum text-white">
                  {preview.data?.priceImpactBps != null
                    ? `${(preview.data.priceImpactBps / 100).toFixed(2)}%`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">{t("slippage")}</span>
                <span className="tnum text-white">
                  {preview.data ? `${(preview.data.slippageBps / 100).toFixed(2)}%` : "—"}
                </span>
              </div>
            </div>

            {previewFailed ? (
              <div className="text-down mt-2 text-[12.5px] font-normal">
                {friendlyError(previewFailed, t("previewFailed"))}
              </div>
            ) : null}

            {showRisk && visibleWarnings(token.warnings).length > 0 ? (
              <div className="mt-3 flex flex-col gap-1">
                {/* Warning codes can repeat or arrive empty, so the key needs
                    the index. */}
                {visibleWarnings(token.warnings)
                  .slice(0, 3)
                  .map((w, i) => (
                    <div key={`${w.code}-${i}`} className="text-down/90 text-[11.5px] font-normal">
                      {w.message}
                    </div>
                  ))}
              </div>
            ) : null}
            {showRisk ? (
              <p className="mt-2 text-[11px] font-normal text-white/40">{t("riskDisclaimer")}</p>
            ) : null}

            {error ? (
              <div className="text-down mt-2 text-[12.5px] font-normal">
                {friendlyError(error, t("orderFailed"))}
              </div>
            ) : null}

            <button
              onClick={() => void onTrade()}
              disabled={submitDisabled}
              className={`mt-3 w-full rounded-[14px] p-[15px] font-sans text-[15px] font-semibold ${
                buying ? "bg-up text-up-ink" : "bg-down text-down-ink"
              } ${submitDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"}`}
            >
              {!sideEnabled
                ? t("sideDisabled")
                : overBalance
                  ? t("notEnough")
                  : buying
                    ? t("ctaBuy", { symbol: displaySym })
                    : t("ctaSell", { symbol: displaySym })}
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
