"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { useChessCashier } from "@/hooks/use-chess-cashier";
import { usePortfolio } from "@/hooks/use-portfolio";
import { CHESS_PRIMARY_BUTTON_CLASS, CHESS_SECONDARY_BUTTON_CLASS } from "@/lib/casino/chess/ui";
import { exceedsUsdcBalance, hasPositiveUsdc, normalizeUsdcAmount } from "@/lib/casino/api/cashier";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const DECIMAL = /^\d*\.?\d*$/;

export type CashierMode = "deposit" | "withdraw";

interface CashierSheetProps {
  onClose: () => void;
  initialMode?: CashierMode;
}

// Moves USDC between the player's Base wallet and their chess balance. A
// deposit is a gas-sponsored USDC send to the cashier's deposit address which
// the service then credits; a withdrawal is entirely server-side. Both forms
// validate in exact base units before anything is sent.
export function CashierSheet({ onClose, initialMode = "deposit" }: CashierSheetProps) {
  const t = useTranslations("casino.chess.cashier");
  // Borrowed for the one message this namespace lacks: a deposit larger than
  // the wallet's Base USDC holding.
  const tFund = useTranslations("casino.fund");
  const cashier = useChessCashier();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();

  const [mode, setMode] = useState<CashierMode>(initialMode);
  const [amount, setAmount] = useState("");
  // Set when a deposit was sent but the cashier has not credited it within
  // the retry window. The money is safe; this tells the player so.
  const [awaitingCredit, setAwaitingCredit] = useState(false);

  const baseUsdc =
    tokens.find((tk) => tk.network === "base-mainnet" && tk.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;

  // The canonical decimal is what every call and label uses, so the service
  // never sees a trailing dot or padded zeros.
  const normalized = normalizeUsdcAmount(amount);
  const overWallet =
    mode === "deposit" && normalized !== null && exceedsUsdcBalance(normalized, String(baseUsdc));
  const overAvailable =
    mode === "withdraw" && normalized !== null && exceedsUsdcBalance(normalized, cashier.available);
  const busy = cashier.depositing || cashier.withdrawing;
  const ready = normalized !== null && !overWallet && !overAvailable && !busy;

  const switchMode = (next: CashierMode) => {
    setMode(next);
    setAmount("");
    setAwaitingCredit(false);
  };

  const onDeposit = async () => {
    if (normalized === null) return;
    const id = toast.loading(t("depositing"));
    setAwaitingCredit(false);
    try {
      const outcome = await cashier.deposit(normalized);
      void refetchPortfolio();
      if (outcome.credited) {
        toast.success(t("depositConfirmed", { amount: outcome.credited }), { id });
        setAmount("");
      } else {
        // Sent on-chain but not credited yet. Not an error: the confirm is
        // idempotent and the service picks the transfer up on its own.
        toast.dismiss(id);
        setAwaitingCredit(true);
      }
    } catch (e) {
      toast.error(friendlyError(e, t("depositFailed")), { id });
    }
  };

  const onWithdraw = async () => {
    if (normalized === null) return;
    const id = toast.loading(t("withdrawing"));
    try {
      await cashier.withdraw(normalized);
      toast.success(t("withdrawalSent", { amount: normalized }), { id });
      setAmount("");
      void refetchPortfolio();
    } catch (e) {
      toast.error(friendlyError(e, t("withdrawFailed")), { id });
    }
  };

  if (!cashier.configured) {
    return (
      <div>
        <SheetNav title={t("title")} onBack={onClose} />
        <div className="ws-inset px-4 py-4 text-[13px] font-normal text-white/60">
          {t("unavailable")}
        </div>
      </div>
    );
  }

  const isDeposit = mode === "deposit";
  const submitLabel = busy
    ? isDeposit
      ? cashier.depositPhase === "confirming"
        ? t("confirmingDeposit")
        : t("depositing")
      : t("withdrawing")
    : isDeposit
      ? t("depositSubmit", { amount: normalized ?? "0" })
      : t("withdrawSubmit", { amount: normalized ?? "0" });
  const lockRows = [
    { label: t("lockedMatch"), value: cashier.lockBuckets.lockedMatchUsdc },
    { label: t("lockedSwiss"), value: cashier.lockBuckets.lockedSwissUsdc },
    { label: t("lockedBet"), value: cashier.lockBuckets.lockedBetUsdc },
    { label: t("pendingWithdrawal"), value: cashier.lockBuckets.pendingWithdrawalUsdc },
    { label: t("lockedOther"), value: cashier.lockBuckets.lockedOtherUsdc },
  ].filter((row) => hasPositiveUsdc(row.value));

  return (
    <div>
      <SheetNav
        title={isDeposit ? t("depositTitle") : t("withdrawTitle")}
        subtitle={isDeposit ? undefined : t("withdrawBody")}
        onBack={onClose}
      />

      <div className="ws-inset mt-1 flex items-center justify-between px-4 py-3.5">
        <span className="text-[13px] font-normal text-white/55">{t("available")}</span>
        <span className="ws-display tnum text-[18px] text-white">{cashier.available} USDC</span>
      </div>
      <div className="ws-inset mt-2 flex items-center justify-between px-4 py-3.5">
        <span className="text-[13px] font-normal text-white/55">{t("locked")}</span>
        <span className="ws-display tnum text-[18px] text-white">{cashier.locked} USDC</span>
      </div>
      {lockRows.length > 0 ? (
        <div className="ws-inset mt-2 px-4 py-3.5">
          <div className="mb-2 text-[12px] font-normal text-white/50">{t("lockBreakdown")}</div>
          <div className="space-y-2">
            {lockRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-white/58">{row.label}</span>
                <span className="ws-display tnum text-white">{row.value} USDC</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ws-inset mt-4 flex gap-2 rounded-full p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={
              mode === m
                ? `${CHESS_PRIMARY_BUTTON_CLASS} flex-1 py-2.5 font-sans text-[13px] font-semibold`
                : `${CHESS_SECONDARY_BUTTON_CLASS} flex-1 py-2.5 font-sans text-[13px] font-semibold`
            }
          >
            {m === "deposit" ? t("deposit") : t("withdraw")}
          </button>
        ))}
      </div>

      <div className="ws-inset mt-2 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>{isDeposit ? t("depositAmount") : t("withdrawAmount")}</span>
          <button
            onClick={() => setAmount(isDeposit ? String(baseUsdc) : cashier.available)}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            {tFund("max", { amount: isDeposit ? String(baseUsdc) : cashier.available })}
          </button>
        </div>
        <input
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
          className="ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
        />
        {overWallet ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">{tFund("overBalance")}</div>
        ) : null}
        {overAvailable ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">{t("notEnough")}</div>
        ) : null}
      </div>

      {isDeposit && normalized !== null && !overWallet ? (
        <div className="mt-3 text-[12.5px] leading-normal font-normal text-white/55">
          {t("depositBody", { amount: normalized })}
        </div>
      ) : null}

      {awaitingCredit ? (
        <div className="border-accent/25 bg-accent/10 mt-3 rounded-[14px] border px-4 py-3.5 text-[13px] leading-normal font-normal text-white/80">
          {t("confirmRetryNote")}
        </div>
      ) : null}

      <button
        onClick={() => void (isDeposit ? onDeposit() : onWithdraw())}
        disabled={!ready}
        className={`${CHESS_PRIMARY_BUTTON_CLASS} mt-[18px] w-full rounded-[14px] p-3.5 font-sans text-[15px] font-semibold`}
      >
        {submitLabel}
      </button>

      {cashier.feePct !== null ? (
        <div className="mt-3 text-center text-[11.5px] font-normal text-white/45">
          {t("feeNote", { pct: cashier.feePct })}
        </div>
      ) : null}
    </div>
  );
}
