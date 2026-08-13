"use client";

import { useState, useRef } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import { useEvmSend } from "@/hooks/use-evm-send";
import {
  useKashPurchase,
  useKashPurchaseQuote,
  useKashStatus,
} from "@/features/portfolio/hooks/use-kash";
import { compactAmountLabel, isValidKashAmount } from "@/features/portfolio/lib/kash";
import { usdcTransferData } from "@/features/portfolio/lib/kash-transfer";

// $1 is the floor the engine accepts, and the cheapest way to clear the
// holding gate — worth being one tap away.
const QUICK_AMOUNTS = ["1", "10", "20", "50", "100"];

interface KashBuyModalProps {
  open: boolean;
  wallet: string | null;
  onClose: () => void;
}

// Buy KSH with USDC. Quote first, always: the user sees exactly how much KSH
// the amount buys, at what price, and whether it clears the holding gate,
// before anything moves.
export function KashBuyModal({ open, wallet, onClose }: KashBuyModalProps) {
  const t = useTranslations("kash");
  const [amount, setAmount] = useState("10");
  const [done, setDone] = useState<{ kash: string; usdc: string; txHash?: string } | null>(null);
  // Paying is a separate on-chain step before the engine call, so it needs its
  // own pending flag: the mutation is not in flight while the wallet is
  // waiting on a signature.
  const [paying, setPaying] = useState(false);
  /**
   * A USDC payment that has already settled but has not yet been credited.
   *
   * The payment and the credit are two separate steps, and only the first
   * moves money. Holding the hash in a local variable meant a failed credit —
   * a gateway timeout, a restart — took the receipt down with the stack frame:
   * the user had paid, had nothing, and clicking again paid a SECOND time.
   *
   * Keyed by amount so changing the amount is a genuinely new purchase.
   */
  const settledPayment = useRef<{ amount: string; txHash: string } | null>(null);
  const sendEvm = useEvmSend();

  const { data: status } = useKashStatus();
  const quote = useKashPurchaseQuote(amount);
  const purchase = useKashPurchase();

  // In real-USDC mode the buyer pays on-chain first and the engine verifies
  // that transfer. It can only be built if the engine told us WHERE to pay, so
  // a missing paymentAddress — not the mode itself — is what disables buying.
  const needsPayment = status?.treasury.usdcMode === "ethers";
  const paymentAddress = status?.chain?.paymentAddress;
  const paymentUnsupported = needsPayment && !paymentAddress;

  const min = status?.desk.purchaseMinUsdc ?? 1;
  const max = status?.desk.purchaseMaxUsdc ?? 10_000;
  const valid = isValidKashAmount(amount) && Number(amount) >= min && Number(amount) <= max;
  const busy = purchase.isPending || paying;
  const canSubmit = Boolean(wallet) && valid && !paymentUnsupported && !busy;

  const close = () => {
    setDone(null);
    purchase.reset();
    onClose();
  };

  const submit = async () => {
    if (!wallet || !canSubmit) return;
    try {
      // The buyer signs the USDC transfer themselves — the engine requires
      // `from == wallet`, so a payment made on their behalf is rejected.
      let paymentTxHash: string | undefined;
      if (needsPayment && paymentAddress && status?.chain) {
        // Never pay twice for the same attempt: reuse a receipt the previous
        // try already produced.
        const alreadyPaid =
          settledPayment.current?.amount === amount ? settledPayment.current.txHash : undefined;
        if (alreadyPaid) {
          paymentTxHash = alreadyPaid;
        } else {
          setPaying(true);
          try {
            paymentTxHash = await sendEvm({
              to: status.chain.usdcAddress as `0x${string}`,
              data: usdcTransferData(paymentAddress, amount),
              chainId: status.chain.chainId,
            });
            settledPayment.current = { amount, txHash: paymentTxHash };
          } finally {
            setPaying(false);
          }
        }
      }
      const result = await purchase.mutateAsync({ wallet, usdcAmount: amount, paymentTxHash });
      // Credited — the receipt has been consumed and must not be reused.
      settledPayment.current = null;
      setDone({ kash: result.kashReceived, usdc: result.usdcPaid, txHash: result.mintTxHash });
    } catch (error) {
      // The receipt deliberately survives: the money already moved, and the
      // next attempt must credit that payment rather than make another.
      toast.error(
        error instanceof Error
          ? settledPayment.current
            ? `${error.message} ${t("paymentHeldForRetry")}`
            : error.message
          : t("buyFailed")
      );
    }
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {done ? (
          <SuccessPanel title={t("buySuccessTitle")} onDone={close}>
            {t("buySuccessBody", { kash: done.kash, usdc: done.usdc })}
            {/* A real Base transaction exists only in ethers mode; a mock hash
                must never link to Basescan, where it would 404. */}
            {status?.chainMode === "ethers" && done.txHash && (
              <>
                {" "}
                <a
                  href={`https://basescan.org/tx/${done.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-200 underline hover:text-amber-100"
                >
                  {t("viewOnBasescan")}
                </a>
              </>
            )}
          </SuccessPanel>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="ws-display text-[22px]">{t("buyTitle")}</div>
              <p className="mt-1 text-[13px] leading-[1.5] font-normal text-white/60">
                {t("buySubtitle")}
              </p>
            </div>

            <div>
              <label className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                {t("amountUsdc")}
              </label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tnum mt-1.5 w-full rounded-[14px] border border-white/12 bg-white/6 px-4 py-3 text-[17px] outline-none focus:border-amber-200/50"
                placeholder="10"
              />
              <div className="mt-2 flex gap-2">
                {/* Only presets the engine would actually accept. Offering a
                    $100 chip while KASH_PURCHASE_MAX_USDC is 25 means the user
                    taps it and the form refuses, with the reason buried in a
                    bounds message. */}
                {QUICK_AMOUNTS.filter(
                  (preset) => Number(preset) >= min && Number(preset) <= max
                ).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    className={`flex-1 cursor-pointer rounded-xl border px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                      amount === preset
                        ? "border-amber-200/60 bg-amber-200/12 text-amber-200"
                        : "border-white/12 bg-white/4 text-white/60 hover:bg-white/8"
                    }`}
                  >
                    ${compactAmountLabel(preset)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[14px] border border-white/8 bg-white/4 px-4 py-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-normal text-white/55">{t("youReceive")}</span>
                <span className="tnum font-semibold text-amber-200">
                  {quote.data ? `${quote.data.kashReceived} KASH` : quote.isFetching ? "…" : "–"}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[12px]">
                <span className="font-normal text-white/45">{t("pricePerKash")}</span>
                <span className="tnum text-white/60">
                  {quote.data ? `$${quote.data.kashPriceUsd}` : quote.isFetching ? "…" : "–"}
                </span>
              </div>
              {quote.isError && (
                <div className="mt-2 border-t border-white/8 pt-2 text-[12px] font-normal text-amber-200/80">
                  {t("quoteFailed")}
                </div>
              )}
              {quote.data && (
                <div className="mt-2 border-t border-white/8 pt-2 text-[12px] font-normal">
                  {quote.data.meetsHoldingGate ? (
                    <span className="text-up">{t("quoteMeetsGate")}</span>
                  ) : (
                    <span className="text-white/50">{t("quoteBelowGate")}</span>
                  )}
                </div>
              )}
            </div>

            {!wallet && (
              <p className="text-[12.5px] leading-[1.5] font-normal text-white/50">
                {t("signInFirst")}
              </p>
            )}
            {paymentUnsupported && (
              <p className="text-[12.5px] leading-[1.5] font-normal text-amber-200/80">
                {t("buyUnavailableOnchain")}
              </p>
            )}
            {!valid && amount.trim() !== "" && (
              <p className="text-[12.5px] font-normal text-white/50">
                {t("amountBounds", { min, max })}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="text-ink w-full cursor-pointer rounded-[14px] bg-amber-200 p-3.5 font-sans text-[15px] font-semibold text-amber-950 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <ButtonSpinner />
                  {paying ? t("buyPaying") : t("buying")}
                </>
              ) : (
                t("buyCta")
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
