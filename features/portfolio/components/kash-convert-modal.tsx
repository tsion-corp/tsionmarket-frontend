"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError } from "@/lib/errors";
import {
  useKashAccount,
  useKashConversion,
  useKashConversionQuote,
  useKashStatus,
} from "@/features/portfolio/hooks/use-kash";
import { useKashPermitSigner } from "@/features/portfolio/hooks/use-kash-permit";
import {
  compactAmountLabel,
  formatKashAmount,
  isValidKashAmount,
  newConversionKey,
} from "@/features/portfolio/lib/kash";

interface KashConvertModalProps {
  open: boolean;
  onClose: () => void;
}

// Convert unlocked KSH back to USDC. This is a redemption at a discount to
// market, not a market sell, and the modal says so up front: the quote shows
// both prices and the discount before the user commits. Vesting KSH is not
// convertible, so the ceiling is the account's `convertible`, never `balance`.
// KSH presets. Any above the wallet's balance are filtered out at render.
const QUICK_KASH = ["1000", "10000", "100000"];

export function KashConvertModal({ open, onClose }: KashConvertModalProps) {
  const t = useTranslations("kash");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<{ usdc: string; kash: string; txHash?: string } | null>(null);

  const { data: status } = useKashStatus();
  const { data: account, wallet } = useKashAccount();
  const quote = useKashConversionQuote(amount);
  const conversion = useKashConversion();
  const signPermit = useKashPermitSigner();
  const [signing, setSigning] = useState(false);
  // Survives re-renders and retries; see submit().
  const attemptKey = useRef<string | null>(null);

  const convertible = account?.convertible ?? "0";
  const hasConvertible = Number(convertible) > 0;
  const paused = quote.data?.coverageState === "paused";
  const withinBalance = isValidKashAmount(amount) && Number(amount) <= Number(convertible);
  const busy = conversion.isPending || signing;
  const canSubmit = Boolean(wallet) && withinBalance && !paused && !busy;

  const close = () => {
    setDone(null);
    setAmount("");
    attemptKey.current = null;
    conversion.reset();
    onClose();
  };

  const setAmountForNewAttempt = (next: string) => {
    // A different amount is a different intent — reusing the key would return
    // the earlier conversion and silently ignore what the user just typed.
    if (next !== amount) attemptKey.current = null;
    setAmount(next);
  };

  const submit = async () => {
    if (!wallet || !canSubmit) return;
    try {
      // On the real chain the burn needs the holder's consent: a free permit
      // signature for exactly this amount. Mock mode skips it, there is no
      // token to sign against.
      let permit;
      if (status?.chainMode === "ethers" && status.chain) {
        setSigning(true);
        try {
          permit = await signPermit(status.chain, wallet, amount);
        } finally {
          setSigning(false);
        }
      }
      // Held across attempts on purpose. A conversion is three sequential Base
      // transactions and can exceed the gateway timeout, so "it failed, click
      // again" is a real user path — and the first attempt may in fact have
      // burned and paid. Reusing the key makes the retry return that original
      // conversion instead of burning a second time.
      attemptKey.current ??= newConversionKey();
      const result = await conversion.mutateAsync({
        wallet,
        kashAmount: amount,
        permit,
        idempotencyKey: attemptKey.current,
      });
      attemptKey.current = null;
      track("kash_sold", {
        kash_amount: Number(result.kashBurned),
        amount_usd: Number(result.usdcPaid),
      });
      setDone({ usdc: result.usdcPaid, kash: result.kashBurned, txHash: result.burnTxHash });
    } catch (error) {
      toast.error(friendlyError(error, t("convertFailed")));
    }
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {done ? (
          <SuccessPanel title={t("convertSuccessTitle")} onDone={close}>
            {t("convertSuccessBody", { kash: done.kash, usdc: done.usdc })}
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
              <div className="ws-display text-[22px]">{t("convertTitle")}</div>
              <p className="mt-1 text-[13px] leading-[1.5] font-normal text-white/60">
                {t("convertSubtitle")}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("amountKash")}
                </label>
                <span className="tnum text-[12px] font-normal text-white/40">
                  {t("maxConvertible", { amount: formatKashAmount(convertible) })}
                </span>
              </div>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmountForNewAttempt(e.target.value)}
                className="tnum mt-1.5 w-full rounded-[14px] border border-white/12 bg-white/6 px-4 py-3 text-[17px] outline-none focus:border-amber-200/50"
                placeholder="0"
              />

              {/* Presets above what the wallet holds are hidden rather than
                  disabled: an amount that cannot be converted is noise, and a
                  greyed row of them reads as a broken control. */}
              <div className="mt-2 flex gap-1.5">
                {QUICK_KASH.filter((preset) => Number(preset) <= Number(convertible)).map(
                  (preset) => (
                    <button
                      key={preset}
                      onClick={() => setAmountForNewAttempt(preset)}
                      className={`flex-1 cursor-pointer rounded-xl border px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                        amount === preset
                          ? "border-amber-200/60 bg-amber-200/12 text-amber-200"
                          : "border-white/12 bg-white/4 text-white/60 hover:bg-white/8"
                      }`}
                    >
                      {compactAmountLabel(preset)}
                    </button>
                  )
                )}
                <button
                  onClick={() => setAmountForNewAttempt(convertible)}
                  disabled={!hasConvertible}
                  className={`flex-1 cursor-pointer rounded-xl border px-2 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    amount === convertible && hasConvertible
                      ? "border-amber-200/60 bg-amber-200/12 text-amber-200"
                      : "border-white/12 bg-white/4 text-white/60 hover:bg-white/8"
                  }`}
                >
                  {t("maxLabel")}
                </button>
              </div>
            </div>

            <div className="rounded-[14px] border border-white/8 bg-white/4 px-4 py-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-normal text-white/55">{t("youReceiveUsdc")}</span>
                <span className="tnum font-semibold text-white">
                  {quote.data ? `$${quote.data.usdcPayout}` : quote.isFetching ? "…" : "–"}
                </span>
              </div>
              {quote.isError && (
                <div className="mt-2 border-t border-white/8 pt-2 text-[12px] font-normal text-amber-200/80">
                  {t("quoteFailed")}
                </div>
              )}
              {quote.data && (
                // The fee in dollars, not a discounted unit price: at 0.5% the
                // two prices differ in the fourth decimal, which reads as a
                // glitch rather than a charge.
                <div className="mt-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-normal text-white/45">
                    {t("withdrawalFee", { pct: quote.data.feePct })}
                  </span>
                  <span className="tnum text-white/60">${quote.data.feeUsd}</span>
                </div>
              )}
            </div>

            {paused && (
              <p className="text-[12.5px] leading-[1.5] font-normal text-amber-200/80">
                {t("conversionsPaused")}
              </p>
            )}
            {isValidKashAmount(amount) && !withinBalance && (
              <p className="text-[12.5px] font-normal text-white/50">
                {t("exceedsConvertible", { amount: convertible })}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <ButtonSpinner />
                  {signing ? t("signingPermit") : t("converting")}
                </>
              ) : (
                t("convertCta")
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
