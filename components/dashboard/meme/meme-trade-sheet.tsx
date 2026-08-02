"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { MemeCoin, PctChange, RiskBadge, priceLabel } from "@/components/dashboard/meme/meme-bits";
import { useMemeToken } from "@/hooks/use-meme-tokens";
import { useMemePreview, useMemeTrade } from "@/hooks/use-meme-trade";
import { usePortfolio } from "@/hooks/use-portfolio";
import { TradeApiError, isValidTradeAmount, type MemeToken } from "@/lib/meme/api";
import { toast } from "@/lib/toast";

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const PREVIEW_DEBOUNCE_MS = 600;

interface MemeTradeSheetProps {
  token: MemeToken;
  onClose: () => void;
}

// The whole trade flow in one sheet: side + amount → live indicative preview →
// explicit confirm → firm quote, sponsored calls, submission registration and
// status polling. Success is only ever the backend's CONFIRMED.
export function MemeTradeSheet({ token: listed, onClose }: MemeTradeSheetProps) {
  const t = useTranslations("meme");
  // Fresh risk/tradability for the trade surface; the list row may be stale.
  const { token: fresh } = useMemeToken(listed.address);
  const token = fresh ?? listed;

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
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
  const submitDisabled =
    busy || !amountValid || !sideEnabled || overBalance || !preview.data || !wallet;

  // Toasts fire even after the sheet is dismissed mid-confirmation, so the
  // terminal result always reaches the user.
  const onTrade = async () => {
    if (submitDisabled) return;
    try {
      await trade({ side, tokenAddress: token.address, amount: debouncedAmount });
      toast.success(
        buying
          ? t("toastBought", { symbol: token.symbol ?? "" })
          : t("toastSold", { symbol: token.symbol ?? "" })
      );
      void portfolio.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("orderFailed"));
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

        <div className="flex items-center gap-3">
          <MemeCoin token={token} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="ws-display truncate text-[18px]">{token.symbol ?? "?"}</span>
              <RiskBadge level={token.riskLevel} />
            </div>
            <div className="truncate text-xs font-normal text-white/50">{token.name ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="tnum text-[15px]">{priceLabel(token.priceUsd)}</div>
            <div className="text-xs">
              <PctChange value={token.priceChange24hPercent} />
            </div>
          </div>
        </div>

        {phase === "confirmed" ? (
          <div className="mt-5">
            <div className="ws-inset p-4 text-center">
              <div className="ws-display text-up text-[20px]">{t("confirmedTitle")}</div>
              <p className="mt-1 text-[13px] font-normal text-white/60">{t("confirmedBody")}</p>
            </div>
            <button
              onClick={closeSheet}
              className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
            >
              {t("done")}
            </button>
          </div>
        ) : phase === "confirming" && received ? (
          // The balanceOf delta already proved the tokens landed, so lead with
          // that; the server's formal confirmation finishes in the background.
          <div className="mt-5">
            <div className="ws-inset p-4 text-center">
              <div className="ws-display text-up text-[20px]">
                {t("receivedTitle", { amount: received.amount, symbol: received.symbol })}
              </div>
              <p className="mt-1 text-[13px] font-normal text-white/60">{t("receivedBody")}</p>
            </div>
            <button
              onClick={closeSheet}
              className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
            >
              {t("done")}
            </button>
          </div>
        ) : busy ? (
          <div className="mt-5">
            <div className="ws-inset p-4">
              <div className="flex items-center gap-2.5">
                <span className="bg-accent h-2 w-2 animate-pulse rounded-full" />
                <span className="text-[13.5px] font-medium">{phaseLabel[phase]}</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-[1.5] font-normal text-white/55">
                {phase !== "confirming"
                  ? t("workingNote")
                  : confirmingLong
                    ? t("confirmingLong")
                    : t("confirmingNote")}
              </p>
            </div>
            {phase === "confirming" ? (
              <button
                onClick={closeSheet}
                className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/14 bg-white/6 p-3.5 font-sans text-[15px] font-semibold text-white hover:bg-white/10"
              >
                {t("closeAndNotify")}
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
                <span className="tnum">
                  {t("balance", {
                    amount: balance.toLocaleString(undefined, { maximumFractionDigits: 6 }),
                    symbol: buying ? "USDC" : (token.symbol ?? ""),
                  })}
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
                  {buying ? "USDC" : (token.symbol ?? "")}
                </span>
              </div>
            </div>

            <div className="ws-inset mt-3 flex flex-col gap-2 p-4 text-[12.5px] font-normal">
              <div className="flex justify-between">
                <span className="text-white/55">{t("youReceive")}</span>
                <span className="tnum text-white">
                  {preview.data
                    ? `${preview.data.expectedBuyAmountFormatted} ${preview.data.buyToken.symbol ?? ""}`
                    : preview.isFetching
                      ? "…"
                      : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">{t("minReceived")}</span>
                <span className="tnum text-white">
                  {preview.data
                    ? `${preview.data.minimumBuyAmountFormatted} ${preview.data.buyToken.symbol ?? ""}`
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

            {token.warnings.length > 0 ? (
              <div className="mt-3 flex flex-col gap-1">
                {/* Warning codes can repeat or arrive empty, so the key needs
                    the index. */}
                {token.warnings.slice(0, 3).map((w, i) => (
                  <div key={`${w.code}-${i}`} className="text-down/90 text-[11.5px] font-normal">
                    {w.message}
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-[11px] font-normal text-white/40">{t("riskDisclaimer")}</p>

            {error ? <div className="text-down mt-2 text-[12.5px] font-normal">{error}</div> : null}

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
                    ? t("ctaBuy", { symbol: token.symbol ?? "" })
                    : t("ctaSell", { symbol: token.symbol ?? "" })}
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
