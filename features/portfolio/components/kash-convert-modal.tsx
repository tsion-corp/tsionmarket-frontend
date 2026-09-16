"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError } from "@/lib/errors";
import { useKashAccount, useKashStatus } from "@/features/portfolio/hooks/use-kash";
import {
  useKashDeskInfo,
  useKashDeskSell,
  useKashDeskSellQuote,
} from "@/features/portfolio/hooks/use-kash-desk";
import {
  compactAmountLabel,
  formatKashAmount,
  isValidKashAmount,
} from "@/features/portfolio/lib/kash";

interface KashConvertModalProps {
  open: boolean;
  onClose: () => void;
}

// Convert unlocked KSH back to USDC, on-chain, through the redeem desk — a
// redemption at a discount to market, not a market sell, and the modal says
// so up front: the quote shows both prices and the discount before the user
// commits. The ceiling is the wallet's real `balance`, since the desk
// redeems on-chain against what the wallet actually holds, not a ledger
// concept of vesting.
// KSH presets. Any above the wallet's balance are filtered out at render.
const QUICK_KASH = ["1000", "10000", "100000"];

export function KashConvertModal({ open, onClose }: KashConvertModalProps) {
  const t = useTranslations("kash");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<{ usdc: string; kash: string; txHash?: string } | null>(null);

  const { data: status } = useKashStatus();
  const {
    data: account,
    isPending: accountPending,
    isError: accountFailed,
    wallet,
  } = useKashAccount();
  // Gated on `open`, like the buy sheet: mounted from the portfolio whether
  // showing or not, and its reads must not run for a closed sheet.
  const deskInfo = useKashDeskInfo(open && status?.chainMode === "ethers");
  const deskConfigured = Boolean(deskInfo.data);
  // Not-configured and explicitly-paused both mean the same thing to a
  // seller: nothing can be redeemed right now. One state, one message,
  // rather than separate copy for a config gap versus an intentional halt.
  const paused = !deskConfigured || deskInfo.data?.paused.redeem === true;
  const deskQuote = useKashDeskSellQuote(amount, open && !paused);
  const deskSell = useKashDeskSell();

  // The desk redeems against the wallet's real on-chain KASH+ balance, gated
  // only by its own reserve (see `uncovered` below).
  const convertible = account?.balance ?? "0";
  // The balance is only KNOWN once the account has loaded. Falling back to "0"
  // while it is pending or failed made the modal tell the user they had
  // nothing to convert when it simply did not know yet — the balance is on
  // screen behind this dialog, so the contradiction reads as a broken app.
  const balanceKnown = Boolean(account);
  const hasConvertible = balanceKnown && Number(convertible) > 0;
  // The desk refuses a payout its reserve cannot cover; surfacing it before
  // the signature saves the user signing for a transaction that must revert.
  const uncovered = !paused && deskQuote.data?.covered === false;
  const withinBalance = isValidKashAmount(amount) && Number(amount) <= Number(convertible);
  const busy = deskSell.isPending;
  const canSubmit =
    Boolean(wallet) && balanceKnown && withinBalance && !paused && !uncovered && !busy;

  const close = () => {
    setDone(null);
    setAmount("");
    onClose();
  };

  // Backend builds the KASH+ permit payload (domain "Kash" — a subtlety it
  // owns so no client gets it wrong), the wallet signs, and one transaction
  // burns the KASH+ and pays the USDC — the backend never holds funds.
  const submit = async () => {
    if (!wallet || !canSubmit) return;
    try {
      const result = await deskSell.mutateAsync({ wallet, kashAmount: amount });
      const usdcOut = deskQuote.data?.usdcOut ?? "";
      track("kash_sold", { kash_amount: Number(amount), amount_usd: Number(usdcOut) });
      setDone({ usdc: usdcOut, kash: amount, txHash: result.txHash });
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
              {/* The subtitle used to promise "your full balance is available,
                  nothing is locked" unconditionally — directly above a Max of 0
                  and a pause notice. Lead with the actual state instead: a
                  promise the service cannot honour reads as a broken app, and
                  the user learns the truth before typing an amount. */}
              <p
                className={cn(
                  "mt-1 text-[13px] leading-[1.5] font-normal",
                  accountPending
                    ? "text-white/45"
                    : accountFailed || paused || !hasConvertible
                      ? "text-amber-200/80"
                      : "text-white/60"
                )}
              >
                {accountPending
                  ? t("convertSubtitleLoading")
                  : accountFailed
                    ? t("convertSubtitleUnavailable")
                    : paused
                      ? t("conversionsPaused")
                      : hasConvertible
                        ? t("convertSubtitle")
                        : t("convertSubtitleNothing")}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("amountKash")}
                </label>
                {/* An em dash while the balance is unknown: "Max 0" is a claim
                    about the user's money, and we have not earned the right to
                    make it until the account has actually loaded. */}
                <span className="tnum text-[12px] font-normal text-white/40">
                  {balanceKnown
                    ? t("maxConvertible", { amount: formatKashAmount(convertible) })
                    : t("maxConvertible", { amount: "—" })}
                </span>
              </div>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
                      onClick={() => setAmount(preset)}
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
                  onClick={() => setAmount(convertible)}
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
                  {deskQuote.data ? `$${deskQuote.data.usdcOut}` : deskQuote.isFetching ? "…" : "–"}
                </span>
              </div>
              {deskQuote.isError && (
                <div className="mt-2 border-t border-white/8 pt-2 text-[12px] font-normal text-amber-200/80">
                  {t("quoteFailed")}
                </div>
              )}
            </div>

            {uncovered && (
              <p className="text-[12.5px] leading-[1.5] font-normal text-amber-200/80">
                {t("reserveCannotCover")}
              </p>
            )}
            {/* Only worth saying when there IS a ceiling to be over. At zero the
                subtitle and the Max already carry it, and a third copy of the
                same number reads as an error the user cannot act on. */}
            {hasConvertible && isValidKashAmount(amount) && !withinBalance && (
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
                  {t("converting")}
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
