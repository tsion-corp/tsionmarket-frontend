"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/ui/sheet-nav";
import { useModalScreen } from "@/components/ui/modal-shell";
import { ArrowUpRightIcon, CheckIcon } from "@/components/ui/icons";
import { FormFeedback, asError, asNotice, type Feedback } from "@/components/ui/form-feedback";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSendToken } from "@/hooks/use-withdraw";
import {
  paycrestReference,
  useCreatePaycrestOfframp,
  usePaycrestOrder,
  usePaycrestQuote,
} from "@/hooks/use-paycrest";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { friendlyError } from "@/lib/errors";
import { fiatForToken, formatUnits, groupDecimal, parseUnits } from "@/lib/paycrest/amounts";
import { paycrestProgress, type PaycrestOrder } from "@/lib/paycrest/types";
import {
  PaycrestAccountField,
  type ResolvedAccount,
} from "@/features/funds/components/paycrest-account-field";

const BASE = SETTLE_CHAINS.base;
const FIAT = "NGN";
const FIAT_DECIMALS = 2;
const AMOUNT_INPUT = /^\d*\.?\d{0,6}$/;

function naira(units: bigint): string {
  return `₦${groupDecimal(formatUnits(units, FIAT_DECIMALS))}`;
}

// Withdraw USDC on Base to a Nigerian bank over Paycrest. The user picks and
// verifies an account, enters a USDC amount (the live sell rate shows the
// naira estimate), and the app opens an order, then sends exactly the order's
// amountToTransfer to its receive address. Paycrest pays the bank and the
// order is polled until it is paid, refunded or expired.
export function PaycrestWithdrawScreen({ onBack }: { onBack: () => void }) {
  const t = useTranslations("paycrest");
  useModalScreen({ back: onBack, fullScreen: true });
  const { evmAddress } = useAuthSession();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();
  const { sendToken } = useSendToken();
  const create = useCreatePaycrestOfframp();

  const [account, setAccount] = useState<ResolvedAccount | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [order, setOrder] = useState<PaycrestOrder | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const usdc = tokens.find(
    (tk) => tk.network === BASE.alchemyNetwork && tk.symbol.toUpperCase() === "USDC"
  );
  const balanceUnits = usdc ? BigInt(usdc.rawBalance) : 0n;
  const amountUnits = parseUnits(amountInput || "0", BASE.decimals) ?? 0n;
  const overBalance = amountUnits > balanceUnits;
  const validAmount = amountUnits > 0n && !overBalance;

  const quote = usePaycrestQuote("USDC", validAmount ? amountInput : null, FIAT);
  const sell = quote.data?.sell ?? null;
  const estimate = sell ? fiatForToken(amountUnits, BASE.decimals, sell.rate, FIAT_DECIMALS) : null;

  const status = usePaycrestOrder(txHash ? (order?.id ?? null) : null, "offramp");
  const live = status.data ?? order;

  const submit = async () => {
    if (!account || !validAmount || !evmAddress || !sell) return;
    setFeedback(null);
    setSubmitting(true);
    let broadcasting = false;
    try {
      const created = await create.mutateAsync({
        amount: formatUnits(amountUnits, BASE.decimals),
        token: "USDC",
        currency: FIAT,
        rate: sell.rate,
        providerIds: sell.providerIds,
        recipient: {
          institution: account.institution,
          accountIdentifier: account.accountIdentifier,
          accountName: account.accountName,
          // Shown on the bank statement; one fixed label in every locale.
          memo: "Ark withdrawal",
        },
        reference: paycrestReference("offramp"),
      });
      setOrder(created);
      const deposit = created.deposit;
      // The proxy guarantees a crypto deposit; these guard what we then send.
      if (
        deposit?.kind !== "crypto" ||
        deposit.network !== "base" ||
        deposit.currency.toUpperCase() !== "USDC" ||
        deposit.memo
      ) {
        setFeedback(asError(t("unexpectedDeposit")));
        return;
      }
      const toSend = parseUnits(deposit.amountToTransfer, BASE.decimals);
      if (toSend === null || toSend <= 0n) {
        setFeedback(asError(t("unexpectedDeposit")));
        return;
      }
      if (toSend > balanceUnits) {
        setFeedback(
          asError(
            t("feesOverBalance", { amount: groupDecimal(formatUnits(toSend, BASE.decimals)) })
          )
        );
        return;
      }
      broadcasting = true;
      const hash = await sendToken({
        network: BASE.alchemyNetwork,
        tokenAddress: BASE.usdc,
        decimals: BASE.decimals,
        to: deposit.receiveAddress,
        amount: toSend,
      });
      setTxHash(hash);
    } catch (e) {
      // After broadcast the transfer may already be on chain: never call it failed.
      setFeedback(
        broadcasting ? asNotice(t("sendUnconfirmed")) : asError(friendlyError(e, t("createFailed")))
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (txHash && live) {
    const progress = paycrestProgress(live.status, "offramp");
    const amount = estimate !== null ? naira(estimate) : "";
    const title =
      progress === "paid"
        ? t("withdrawPaidTitle")
        : progress === "refunded"
          ? t("refundedTitle")
          : progress === "expired"
            ? t("expiredTitle")
            : t("withdrawSentTitle");
    const body =
      progress === "paid"
        ? t("withdrawPaidBody", { amount })
        : progress === "refunded"
          ? t("withdrawRefundedBody")
          : progress === "expired"
            ? t("withdrawExpiredBody")
            : t("withdrawSentBody", { amount });
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-accent/14 text-accent inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <CheckIcon size={26} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{title}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] text-white/60">
          {body}
        </p>
        <a
          href={`https://basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
        >
          {t("viewTransaction")}
          <ArrowUpRightIcon size={14} />
        </a>
        {progress === "awaiting" || progress === "processing" ? (
          <div
            role="status"
            aria-label={t("processing")}
            className="mx-auto mt-6 h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-[#7ce7b0]"
          />
        ) : null}
        {status.isError ? (
          <p className="mt-3 text-[12.5px] text-white/50">{t("statusUnavailable")}</p>
        ) : null}
        <button
          onClick={() => {
            refetchPortfolio();
            onBack();
          }}
          className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-white font-sans text-[15px] font-semibold text-[#181818] hover:opacity-90"
        >
          {t("finish")}
        </button>
      </div>
    );
  }

  const ready =
    Boolean(account) && validAmount && Boolean(sell) && Boolean(evmAddress) && !submitting;

  return (
    <div>
      <SheetNav title={t("withdrawTitle")} subtitle={t("withdrawSubtitle")} />
      <div className="mt-6">
        <PaycrestAccountField currency={FIAT} onChange={setAccount} disabled={submitting} />
      </div>

      <div className="mt-5 rounded-2xl border border-white/15 bg-[#1b1b1b] px-5 pt-4 pb-5">
        <div className="mb-3 flex justify-between text-[13.5px] font-medium text-white/50">
          <span>{t("amountUsdc")}</span>
          <button
            type="button"
            onClick={() => setAmountInput(formatUnits(balanceUnits, BASE.decimals))}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            {t("balance", { amount: groupDecimal(formatUnits(balanceUnits, BASE.decimals)) })}
          </button>
        </div>
        <input
          inputMode="decimal"
          value={amountInput}
          disabled={submitting}
          aria-label={t("amountUsdc")}
          onChange={(e) => {
            const raw = e.target.value.replace(/,/g, "");
            if (AMOUNT_INPUT.test(raw)) {
              setFeedback(null);
              setAmountInput(raw);
            }
          }}
          placeholder="0.00"
          className="ws-display tnum w-full border-none bg-transparent text-[38px] text-white outline-none placeholder:text-white/40"
        />
        <div className="mt-3 border-t border-white/8 pt-3 text-[13.5px] text-white/55">
          {overBalance ? (
            t("overBalance")
          ) : !validAmount ? (
            t("enterAmount")
          ) : quote.isPending ? (
            <span className="inline-block h-4 w-40 animate-pulse rounded bg-white/8" />
          ) : quote.isError || !sell ? (
            <span className="text-down">{t("quoteFailed")}</span>
          ) : (
            <span className="flex justify-between gap-3">
              <span>{t("youReceive", { amount: estimate !== null ? naira(estimate) : "" })}</span>
              <span className="tnum text-white/45">
                {t("rateLine", { rate: `₦${groupDecimal(sell.rate)}` })}
              </span>
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-[12px] text-white/40">{t("feesNote")}</p>

      <FormFeedback feedback={feedback} />

      <button
        onClick={submit}
        disabled={!ready}
        className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white font-sans text-[15px] font-semibold text-[#181818] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#181818]/30 border-t-[#181818]" />
            {t("processing")}
          </>
        ) : (
          t("withdraw")
        )}
      </button>
    </div>
  );
}
