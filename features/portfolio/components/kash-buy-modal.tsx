"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import {
  useKashPurchase,
  useKashPurchaseQuote,
  useKashStatus,
} from "@/features/portfolio/hooks/use-kash";
import { isValidKashAmount } from "@/features/portfolio/lib/kash";

const QUICK_AMOUNTS = ["10", "25", "50", "100"];

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

  const { data: status } = useKashStatus();
  const quote = useKashPurchaseQuote(amount);
  const purchase = useKashPurchase();

  // The real-USDC purchase flow needs an on-chain payment leg the app does not
  // ship yet, so in that mode buying is disabled with an honest message rather
  // than a request that can only fail.
  const paymentUnsupported = status?.treasury.usdcMode === "ethers";

  const min = status?.desk.purchaseMinUsdc ?? 1;
  const max = status?.desk.purchaseMaxUsdc ?? 10_000;
  const valid = isValidKashAmount(amount) && Number(amount) >= min && Number(amount) <= max;
  const canSubmit = Boolean(wallet) && valid && !paymentUnsupported && !purchase.isPending;

  const close = () => {
    setDone(null);
    purchase.reset();
    onClose();
  };

  const submit = async () => {
    if (!wallet || !canSubmit) return;
    try {
      const result = await purchase.mutateAsync({ wallet, usdcAmount: amount });
      setDone({ kash: result.kashReceived, usdc: result.usdcPaid, txHash: result.mintTxHash });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("buyFailed"));
    }
  };

  return (
    <ModalShell open={open} onClose={purchase.isPending ? () => {} : close}>
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
                {QUICK_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    className={`flex-1 cursor-pointer rounded-xl border px-2 py-1.5 text-[12.5px] font-medium ${
                      amount === preset
                        ? "border-amber-200/60 bg-amber-200/12 text-amber-200"
                        : "border-white/12 bg-white/4 text-white/60 hover:bg-white/8"
                    }`}
                  >
                    ${preset}
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
              {purchase.isPending ? t("buying") : t("buyCta")}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
