"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/ui/sheet-nav";
import { DepositStatus } from "@/components/ui/deposit-status";
import { useMoney } from "@/components/ui/currency-select";
import { useSendToken } from "@/hooks/use-withdraw";
import {
  useDepositStatus,
  useTerminalToast,
  useWithdrawQuote,
  type WithdrawQuoteInput,
} from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePrices } from "@/hooks/use-prices";
import { getWalletAddress } from "@/lib/user";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const DECIMAL = /^\d*\.?\d*$/;
const QUOTE_DEBOUNCE_MS = 450;

// Adds money to the player's balance. Under the hood this converts their
// dollar balance (USDC on Base) into the token the game runs on (ETH on Base)
// via Dextopus, but the player only ever sees dollars — it reads like moving
// cash from one account to another. USDC is dollar-pegged, so the typed amount
// is dollars 1:1.
const SOURCE = SETTLE_CHAINS.base; // USDC on Base
const ETH_BASE_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_DECIMALS = 18;

interface FundSheetProps {
  onClose: () => void;
}

export function FundSheet({ onClose }: FundSheetProps) {
  const t = useTranslations("casino.fund");
  const { user } = usePrivy();
  const money = useMoney();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();
  const { sendToken } = useSendToken();
  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;

  const wallet = getWalletAddress(user, "ethereum");
  const usdc = tokens.find(
    (t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC"
  );
  const balance = usdc?.balance ?? 0;

  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositRequestId, setDepositRequestId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(amount), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [amount]);

  const value = Number(amount) || 0;
  const overBalance = value > balance;
  const amountSettled = amount === debouncedAmount;

  const quoteInput: WithdrawQuoteInput | null =
    wallet && value > 0 && !overBalance && amountSettled
      ? {
          originChainId: SOURCE.chainId,
          originAsset: SOURCE.usdc,
          destinationChainId: SOURCE.chainId,
          destinationAsset: ETH_BASE_ADDRESS,
          amount: toBaseUnits(debouncedAmount, SOURCE.decimals).toString(),
          recipient: wallet,
          refundTo: wallet,
        }
      : null;
  const quote = useWithdrawQuote(quoteInput);

  // Dollar value of what actually lands in the balance after conversion, so
  // the player sees the real net amount (never a token quantity).
  const addedUsd = useMemo(() => {
    if (!quote.data || ethPrice <= 0) return null;
    const eth = Number(fromBaseUnits(BigInt(quote.data.amountOut), ETH_DECIMALS));
    return eth * ethPrice;
  }, [quote.data, ethPrice]);

  const status = useDepositStatus(depositRequestId);
  useTerminalToast(
    status.data,
    depositRequestId,
    {
      settled: t("toastSettled"),
      failed: t("toastFailed"),
      refunded: t("toastRefunded"),
    },
    () => void refetchPortfolio()
  );

  const ready =
    Boolean(wallet) && value > 0 && !overBalance && amountSettled && Boolean(quote.data);

  const submit = async () => {
    if (!wallet) return;
    setError(null);
    setSubmitting(true);
    // Processing toast for the gasless send; the terminal "Money added" toast
    // (useTerminalToast) confirms separately once it settles.
    const toastId = toast.loading(t("toastAdding", { amount: money.format(value) }));
    try {
      const fresh = await quote.refetch();
      if (fresh.isError || !fresh.data) {
        setError(friendlyError(fresh.error, t("errorQuote")));
        toast.dismiss(toastId);
        return;
      }
      await sendToken({
        network: "base-mainnet",
        tokenAddress: SOURCE.usdc,
        decimals: SOURCE.decimals,
        to: fresh.data.depositAddress,
        amount: toBaseUnits(amount, SOURCE.decimals),
      });
      setDepositRequestId(fresh.data.depositRequestId);
      setSent(true);
      toast.success(t("toastAdded", { amount: money.format(value) }), { id: toastId });
      void refetchPortfolio();
    } catch (e) {
      setError(friendlyError(e, t("errorSend")));
      toast.error(friendlyError(e, t("errorSend")), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div>
        <SheetNav
          title={t("addingTitle")}
          subtitle={t("addingSubtitle", { amount: money.format(value) })}
          onBack={onClose}
        />
        <div className="border-accent/25 bg-accent/10 mt-1 rounded-[14px] border px-4 py-4 text-[13px] leading-normal font-normal text-white/80">
          {t("movingNote")}
        </div>
        {depositRequestId ? (
          <DepositStatus
            status={status.data?.status ?? "waiting"}
            executionStatus={status.data?.executionStatus}
            isError={status.isError}
            onRetry={() => status.refetch()}
          />
        ) : null}
        <button
          onClick={onClose}
          className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
        >
          {t("done")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav title={t("title")} subtitle={t("subtitle")} onBack={onClose} />

      <div className="ws-inset mt-1 flex items-center justify-between px-4 py-3.5">
        <span className="text-[13px] font-normal text-white/55">{t("availableToAdd")}</span>
        <span className="ws-display tnum text-[18px] text-white">{money.format(balance)}</span>
      </div>

      <div className="ws-inset mt-2 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>{t("amount")}</span>
          <button
            onClick={() => setAmount(String(balance))}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            {t("max", { amount: money.format(balance) })}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 font-sans text-[22px] font-medium text-white/50">$</span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
            className="ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
        </div>
        {overBalance ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">{t("overBalance")}</div>
        ) : null}
      </div>

      {value > 0 && !overBalance ? (
        <div className="ws-inset mt-2 flex items-center justify-between px-4 py-3 text-[12.5px] font-normal">
          <span className="text-white/55">{t("addedToBalance")}</span>
          {quote.isError ? (
            <span className="text-down">{t("unavailable")}</span>
          ) : quote.isFetching || !quote.data || addedUsd === null ? (
            <span className="text-white/45">{t("checking")}</span>
          ) : (
            <span className="tnum text-accent">≈ {money.format(addedUsd)}</span>
          )}
        </div>
      ) : null}

      {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}

      <button
        onClick={() => void submit()}
        disabled={!ready || submitting}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? t("adding") : quoteInput && quote.isFetching ? t("checking") : t("addMoney")}
      </button>
    </div>
  );
}
