"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { FlagIcon } from "@/components/ui/flag-icon";
import { useFx } from "@/hooks/use-fx";
import { useCreateOfframp, useOfframpQuote, useRampOrder } from "@/hooks/use-offramp";
import { useSendToken } from "@/hooks/use-withdraw";
import { formatAmount } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";
import { getWalletAddress } from "@/lib/user";
import { isValidMobile, isValidName, maskNumber } from "@/lib/cross-border";
import {
  OFFRAMP_ORIGIN,
  isTerminalRampStatus,
  normalizePhone,
  payAmountUsd,
  receiveAmountFromUsd,
  splitName,
  type RampPublicStatus,
} from "@/lib/payment/offramp";
import { clearPendingRemit, savePendingRemit } from "@/lib/payment/pending";
import { toast } from "@/lib/toast";
import type { RemitForm } from "@/components/dashboard/remit/remit-types";

interface ReviewStepProps {
  form: RemitForm;
  onField: (field: "senderName" | "senderPhone", value: string) => void;
  onBack: () => void;
  // Resets the wizard once a finished payment is acknowledged.
  onDone: () => void;
}

// The send is a small machine, not a pile of booleans: idle -> creating (the
// order) -> funding (the USDC transfer) -> tracking (the payout poll). A
// funding failure lands in fundFailed with the order kept, so retrying sends
// to the SAME deposit address instead of minting a fresh order.
type SendPhase = "idle" | "creating" | "funding" | "fundFailed" | "tracking";

const INPUT_CLASS =
  "w-full rounded-[13px] border border-white/10 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent/45";

// The sender's own dial code. The payout partner wants a phone for compliance;
// our senders are overwhelmingly in Nigeria, and normalizePhone accepts a full
// international number for anyone who is not.
const SENDER_DIAL_CODE = "+234";
const SENDER_COUNTRY = "NG";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] font-normal text-white/50">{label}</span>
      <span className="text-right font-sans text-[13.5px] font-medium text-white">{value}</span>
    </div>
  );
}

function StatusCard({ status }: { status: RampPublicStatus }) {
  const t = useTranslations("remit");
  const tone =
    status === "completed"
      ? "border-up/30 bg-up/10"
      : status === "needs_attention"
        ? "border-down/30 bg-down/10"
        : "border-white/12 bg-white/5";
  return (
    <div
      className={`mt-4 rounded-[14px] border p-4 text-[13.5px] leading-[1.55] font-medium text-white/85 ${tone}`}
    >
      {t(`status_${status}`)}
    </div>
  );
}

// Step 4: the live quote and the send. The composed rail is quoted on what the
// recipient should receive; creating the order mints a deposit address, the
// quoted USDC is sent there from the embedded wallet (gas-sponsored on Base),
// and the order is polled until the payout resolves. Crypto always lands
// before fiat leaves, so a failure after the send parks the order for support
// rather than losing anything.
export function ReviewStep({ form, onField, onBack, onDone }: ReviewStepProps) {
  const t = useTranslations("remit");
  const { user } = usePrivy();
  const { rate } = useFx();
  const { sendToken } = useSendToken();
  const create = useCreateOfframp();
  const [phase, setPhase] = useState<SendPhase>("idle");
  const [pending, setPending] = useState<{ orderId: string; depositAddress: string } | null>(null);
  const order = useRampOrder(phase === "tracking" ? (pending?.orderId ?? null) : null);

  const { country, method, network, bank, recipientName, accountNumber, recipientPhone } = form;

  const receiveAmount = country
    ? receiveAmountFromUsd(form.amountUsd, rate(country.currency))
    : null;
  const quoteInput = useMemo(
    () =>
      country && receiveAmount
        ? {
            toCountry: country.code.toUpperCase(),
            receiveCurrency: country.currency,
            receiveAmount,
          }
        : null,
    [country, receiveAmount]
  );
  const quote = useOfframpQuote(quoteInput);

  // The review is only reachable once these are set, but guard for type safety.
  if (!country || !method) return null;

  const isMobile = method === "mobile_money";
  const destinationLabel = isMobile
    ? `${network ? network.name : t("method_mobile_money")} ${maskNumber(accountNumber)}`
    : `${bank?.name ?? ""} ${maskNumber(accountNumber)}`;

  const refundTo = getWalletAddress(user, "ethereum");
  const senderOk = isValidName(form.senderName) && isValidMobile(form.senderPhone);
  const status = order.data?.publicStatus ?? null;
  const terminal = status !== null && isTerminalRampStatus(status);
  const sent = phase === "tracking";
  const busy = phase === "creating" || phase === "funding";
  const canSend = quote.data != null && senderOk && !!refundTo && phase === "idle";

  // Funds the existing order's deposit address with exactly what the quote
  // asked for. A materially short deposit is not paid out — it parks for
  // refund — so the amount is the quote's own base units, never recomputed.
  const fund = async (
    target: { orderId: string; depositAddress: string },
    toastId: string | number
  ) => {
    if (!quote.data) return;
    setPhase("funding");
    toast.loading(t("toastSending"), { id: toastId });
    try {
      await sendToken({
        network: OFFRAMP_ORIGIN.network,
        tokenAddress: OFFRAMP_ORIGIN.asset,
        decimals: OFFRAMP_ORIGIN.decimals,
        to: target.depositAddress,
        amount: BigInt(quote.data.pay.amountIn.amount),
      });
      savePendingRemit({ orderId: target.orderId, createdAt: Date.now(), funded: true });
      setPhase("tracking");
      toast.success(t("toastSent"), { id: toastId });
    } catch (e) {
      // The order exists but its deposit is unfunded; keep it so a retry pays
      // the same address instead of creating a duplicate order.
      setPhase("fundFailed");
      toast.error(friendlyError(e, t("toastFailed")), { id: toastId });
    }
  };

  const onSend = async () => {
    if (!quote.data || !refundTo) return;
    // One processing toast that resolves in place across the two legs: create
    // the order, then fund its deposit address.
    const toastId = toast.loading(t("toastCreating"));
    setPhase("creating");
    try {
      const { name, surname } = splitName(recipientName);
      const payeePhone = normalizePhone(
        isMobile ? accountNumber : recipientPhone,
        country.dialCode
      );
      const created = await create.mutateAsync({
        recipient: {
          transactionType: isMobile ? "wallet" : "bank",
          toCountry: country.code.toUpperCase(),
          receiveCurrency: country.currency,
          receiveAmount: quote.data.fiat.receive.amount,
          payeePhoneNumber: payeePhone,
          ...(isMobile
            ? {}
            : { receiverAccountNumber: accountNumber.replace(/\s+/g, ""), bankCode: bank!.id }),
          receiverName: name,
          ...(surname ? { receiverSurname: surname } : {}),
        },
        sender: {
          name: form.senderName.trim(),
          country: SENDER_COUNTRY,
          phoneNumber: normalizePhone(form.senderPhone, SENDER_DIAL_CODE),
        },
        refundTo,
      });
      const target = { orderId: created.id, depositAddress: created.depositAddress };
      setPending(target);
      // Persisted before the funds move: even a crash mid-send leaves a
      // resumable trail instead of an orphaned order.
      savePendingRemit({ orderId: created.id, createdAt: Date.now(), funded: false });
      await fund(target, toastId);
    } catch (e) {
      setPhase("idle");
      toast.error(friendlyError(e, t("toastFailed")), { id: toastId });
    }
  };

  const onRetryFunding = () => {
    if (!pending) return;
    void fund(pending, toast.loading(t("toastSending")));
  };

  const onAcknowledge = () => {
    // A finished payout has nothing left to resume; an attention case keeps
    // its pending record so reopening the flow surfaces it again.
    if (status === "completed") clearPendingRemit();
    onDone();
  };

  return (
    <div>
      <SheetNav title={t("reviewPayment")} subtitle={t("reviewSubtitle")} onBack={onBack} />

      <div className="ws-inset px-[15px] py-1.5">
        <Row label={t("recipient")} value={recipientName} />
        {form.verifiedAccountName ? (
          <>
            <div className="border-t border-white/6" />
            <Row
              label={t("accountHolder")}
              value={<span className="text-up">{form.verifiedAccountName}</span>}
            />
          </>
        ) : null}
        <div className="border-t border-white/6" />
        <Row
          label={t("destination")}
          value={
            <span className="flex items-center justify-end gap-2">
              <FlagIcon code={country.currency} symbol={country.currency} size={18} />
              {country.name}
            </span>
          }
        />
        <div className="border-t border-white/6" />
        <Row label={t(`method_${method}`)} value={destinationLabel} />
        <div className="border-t border-white/6" />
        <Row
          label={t("theyReceive")}
          value={
            quote.data ? (
              <span className="text-accent">
                {quote.data.fiat.receive.amount} {quote.data.fiat.receive.currency}
              </span>
            ) : quote.isError ? (
              "—"
            ) : (
              <span className="inline-block h-4 w-20 animate-pulse rounded bg-white/10" />
            )
          }
        />
        <div className="border-t border-white/6" />
        <Row
          label={t("fee")}
          value={
            quote.data ? `${quote.data.fiat.totalFee} ${quote.data.fiat.receive.currency}` : "—"
          }
        />
        <div className="border-t border-white/6" />
        <Row
          label={t("youPay")}
          value={
            quote.data ? (
              <span className="text-[15px] font-semibold">
                ${formatAmount(payAmountUsd(quote.data))}
              </span>
            ) : (
              "—"
            )
          }
        />
      </div>

      {quote.isError ? (
        <div className="border-down/30 bg-down/10 mt-3 rounded-[14px] border p-3.5 text-[12.5px] leading-[1.5] font-normal text-white/80">
          {friendlyError(quote.error, t("quoteFailed"))}{" "}
          <button
            type="button"
            onClick={() => void quote.refetch()}
            className="text-accent cursor-pointer font-medium underline underline-offset-2"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}

      {/* The payout partner requires the sender's identity on every order. */}
      {!sent ? (
        <div className="mt-4 space-y-3">
          <div className="text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
            {t("senderDetails")}
          </div>
          <input
            value={form.senderName}
            onChange={(e) => onField("senderName", e.target.value)}
            placeholder={t("senderNamePlaceholder")}
            className={INPUT_CLASS}
          />
          <div className="flex items-stretch gap-2">
            <span className="flex shrink-0 items-center rounded-[13px] border border-white/10 bg-white/6 px-3 font-sans text-[14.5px] font-medium text-white/70">
              {SENDER_DIAL_CODE}
            </span>
            <input
              inputMode="tel"
              value={form.senderPhone}
              onChange={(e) => onField("senderPhone", e.target.value)}
              placeholder="801 234 5678"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      ) : null}

      {sent ? <StatusCard status={status ?? "processing"} /> : null}

      {phase === "fundFailed" ? (
        <div className="border-down/30 bg-down/10 mt-4 rounded-[14px] border p-3.5 text-[12.5px] leading-[1.5] font-normal text-white/80">
          {t("fundFailedBody")}
          <button
            type="button"
            onClick={onRetryFunding}
            className="text-accent ml-1.5 cursor-pointer font-medium underline underline-offset-2"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}

      {sent && terminal ? (
        <button
          onClick={onAcknowledge}
          className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("done")}
        </button>
      ) : null}

      {phase === "idle" || busy ? (
        <button
          onClick={() => void onSend()}
          disabled={!canSend}
          className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("sendingPayment") : t("sendPayment")}
        </button>
      ) : null}
    </div>
  );
}
