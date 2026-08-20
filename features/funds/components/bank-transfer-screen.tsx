"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/ui/sheet-nav";
import { BankIcon, CheckIcon, CopyIcon } from "@/components/ui/icons";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useCreateOnrampOrder, useRampingRates, useRampOrder } from "@/hooks/use-ramping";
import { copyText } from "@/lib/clipboard";
import { MASK_ATTRIBUTE, NO_AUTOCAPTURE_CLASS } from "@/lib/analytics/clarity";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError } from "@/lib/errors";
import { getWalletAddress } from "@/lib/user";
import {
  idempotencyKey,
  isValidOnrampNgn,
  ONRAMP_MIN_NGN,
  usdcForNgnExact,
  type OnrampOrder,
} from "@/lib/ramping/orders";
import { clearPendingBankDeposit, savePendingBankDeposit } from "@/lib/ramping/pending";

interface BankTransferScreenProps {
  onBack: () => void;
  onClose: () => void;
}

function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(amount);
}

// Group the raw digit string with commas for display, keeping "" empty. The
// state itself stays as plain digits, so the real amount is what gets used.
function formatNgnInput(digits: string): string {
  return digits ? new Intl.NumberFormat("en-NG").format(Number(digits)) : "";
}

// A decimal string from the rail (or the exact converter), shown to two
// decimals without ever passing the value through a float.
function displayUsdc(amount: string): string {
  const [whole, frac = ""] = amount.split(".");
  const cents = frac.slice(0, 2).padEnd(2, "0");
  return `${new Intl.NumberFormat("en-US").format(Number(whole))}.${cents}`;
}

// Quick-select deposit amounts, in Naira. The first is the minimum.
const AMOUNT_PRESETS = [1000, 5000, 10000, 50000];

// Seconds until the order's rate lock lapses. Derived from the deadline
// rather than a stored duration, so a slept tab shows the true time left.
// Null when there is no usable deadline to count against.
function useSecondsUntil(iso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return null;
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function compactNgn(amount: number): string {
  return amount >= 1000 ? `${amount / 1000}K` : String(amount);
}

// Naira onramp over the ramping rail. The user enters a Naira amount and sees
// the USDC it buys at the live rate; we open an order bound to their Base
// wallet and show the bank account to pay into. The rate is locked for the
// order's window; past it the account stays payable and later transfers just
// convert at the live rate, so an expired lock is a note, never a dead end.
// USDC settles to the wallet automatically once the payment clears, and the
// final figures shown come from the order itself, never from our own math.
export function BankTransferScreen({ onBack, onClose }: BankTransferScreenProps) {
  const t = useTranslations("bankTransfer");
  const { user } = usePrivy();
  const { refetch } = usePortfolio();
  const { data: rates } = useRampingRates();
  const rate = rates?.onrampRate ?? null;

  const walletAddress = getWalletAddress(user, "ethereum");

  const [amountNgn, setAmountNgn] = useState("");
  // After the user says they have paid, we show a brief confirming state and
  // then a reassuring "on its way" message. The rail settles within seconds of
  // the bank credit, so the background poll usually flips to done right after.
  const [handoff, setHandoff] = useState<"none" | "confirming" | "enroute">("none");
  const create = useCreateOnrampOrder();
  const created = create.data;

  const ngnAmount = Number(amountNgn);
  const estimateUsdc = rate && amountNgn ? usdcForNgnExact(amountNgn, rate) : null;
  const validAmount = isValidOnrampNgn(ngnAmount);

  const orderQuery = useRampOrder("onramp", created?.id ?? null, {
    enabled: Boolean(created?.id),
    pollMs: 3000,
  });
  // The poll result supersedes the creation snapshot as soon as it lands.
  const order: OnrampOrder | null = (orderQuery.data as OnrampOrder | undefined) ?? created ?? null;
  const status = order?.status ?? "awaiting";
  const done = status === "completed";
  const failed = status === "failed";

  // Rate-lock countdown, only while the user is still looking at the account.
  const countingDown = handoff === "none" && status === "awaiting";
  const secondsLeft = useSecondsUntil(countingDown ? (order?.expiresAt ?? null) : null);
  const rateLockEnded = status === "expired" || secondsLeft === 0;

  // Refresh balances once the crypto has settled, and release the dashboard's
  // withdraw hold on any settled outcome.
  useEffect(() => {
    if (done || failed) clearPendingBankDeposit();
    if (done) refetch();
  }, [done, failed, refetch]);

  // Reported once, when the rail confirms delivery. `done` stays true while
  // the screen is open, so the ref keeps this from firing on every poll.
  const reportedComplete = useRef(false);
  useEffect(() => {
    if (!done || reportedComplete.current) return;
    reportedComplete.current = true;
    track("bank_transfer_completed", {
      amount_ngn: Number(order?.amountNgn ?? amountNgn) || 0,
      amount_usd: Number(order?.amountUsdc ?? 0) || 0,
      bank: order?.paymentAccount?.bankName ?? "",
    });
  }, [done, order, amountNgn]);

  // Hold the confirming state briefly, then move to the reassuring message. This
  // is a UX beat, not a real settlement check, so a fixed pause reads honestly.
  useEffect(() => {
    if (handoff !== "confirming") return;
    const id = setTimeout(() => setHandoff("enroute"), 15000);
    return () => clearTimeout(id);
  }, [handoff]);

  // Settlement can land while the handoff screens are up; done wins over them.
  // Amount entry.
  if (!created) {
    return (
      <div>
        <SheetNav title={t("title")} subtitle={t("subtitle")} onBack={onBack} />

        <div className="ws-inset p-[15px]">
          <div className="mb-[9px] text-xs font-normal text-white/55">{t("youSend")}</div>
          <div className="flex items-center justify-between gap-3">
            <input
              inputMode="numeric"
              value={formatNgnInput(amountNgn)}
              onChange={(e) => setAmountNgn(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="ws-display tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
            />
            <span className="font-sans text-[15px] font-medium text-white/70">NGN</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/8 pt-2 text-[13px] font-normal text-white/55">
            <span>
              {validAmount && estimateUsdc
                ? t("usdEquivalent", { amount: `${displayUsdc(estimateUsdc)} USDC` })
                : t("enterMin", { amount: `₦${formatNgn(ONRAMP_MIN_NGN)}` })}
            </span>
            {rate ? (
              <span className="tnum shrink-0 text-white/45">
                {t("fxRate", { rate: `₦${formatNgn(Number(rate))}` })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          {AMOUNT_PRESETS.map((preset) => {
            const active = amountNgn === String(preset);
            return (
              <button
                key={preset}
                onClick={() => setAmountNgn(String(preset))}
                className={`flex-1 cursor-pointer rounded-full border px-2 py-2 font-sans text-[13px] font-medium transition-colors ${
                  active
                    ? "border-accent/50 bg-accent/16 text-white"
                    : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                ₦{compactNgn(preset)}
              </button>
            );
          })}
        </div>

        {!walletAddress ? (
          <div className="border-down/25 bg-down/10 mt-3 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
            {t("needWallet")}
          </div>
        ) : null}

        {create.isError ? (
          <p className="text-down mt-3 text-[13px]">
            {friendlyError(create.error, t("createFailed"))}
          </p>
        ) : null}

        <p className="mt-3 text-[12px] leading-[1.5] font-normal text-white/45">
          {t("amountNote")}
        </p>

        <button
          onClick={() => {
            if (!validAmount || !walletAddress) return;
            // A fresh key per press: retries inside this mutation replay the
            // same order, while a deliberate second deposit opens a new one.
            create.mutate(
              {
                destinationAddress: walletAddress,
                expectedAmountNgn: String(ngnAmount),
                idempotencyKey: idempotencyKey("onramp", walletAddress),
              },
              {
                onSuccess: () => {
                  // The amount and the rate the user accepted. Never the
                  // account number that came back with them.
                  track("bank_account_requested", {
                    amount_ngn: ngnAmount,
                    fx_rate: Number(rate) || 0,
                  });
                },
              }
            );
          }}
          disabled={!validAmount || !walletAddress || create.isPending}
          className="text-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {create.isPending ? (
            <>
              <span className="border-ink/30 border-t-ink h-4 w-4 animate-spin rounded-full border-2" />
              {t("generating")}
            </>
          ) : (
            t("generateAccount")
          )}
        </button>
      </div>
    );
  }

  // Settled: crypto has landed. The amount is the order's own figure.
  if (done) {
    const received = order?.amountUsdc ?? null;
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-accent/14 text-accent inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <CheckIcon size={26} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{t("doneTitle")}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
          {received
            ? t("doneBody", { amount: `${displayUsdc(received)} USDC` })
            : t("doneBodyPlain")}
        </p>
        <button
          onClick={onClose}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("finish")}
        </button>
      </div>
    );
  }

  // Failed is the only dead end: let the user start over. An expired rate lock
  // is not failure; the account below stays payable at the live rate.
  if (failed) {
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-down/15 text-down inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <BankIcon size={24} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{t("failedTitle")}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
          {order?.error ?? t("failedBody")}
        </p>
        <button
          onClick={() => {
            create.reset();
            setAmountNgn("");
          }}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("startOver")}
        </button>
      </div>
    );
  }

  // The user said they have paid: hold briefly, then reassure. Real settlement
  // continues in the background and updates the balance when it lands.
  if (handoff === "confirming") {
    return (
      <div className="px-1 py-10 text-center">
        <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-white/80" />
        <div className="ws-display mt-5 text-[19px]">{t("confirmingTitle")}</div>
        <p className="mx-auto mt-2 max-w-[30ch] text-[13px] leading-[1.55] font-normal text-white/55">
          {t("confirmingBody")}
        </p>
      </div>
    );
  }

  if (handoff === "enroute") {
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-accent/14 text-accent inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <CheckIcon size={26} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{t("enrouteTitle")}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
          {t("enrouteBody")}
        </p>
        <button
          onClick={onClose}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("finish")}
        </button>
      </div>
    );
  }

  // Awaiting or processing the transfer: show the account to pay into.
  const account = order?.paymentAccount ?? null;
  return (
    <div>
      <SheetNav title={t("transferTitle")} onBack={onBack} />

      {account ? (
        <>
          <div className="ws-inset p-[15px] text-center">
            <div className="text-xs font-normal text-white/55">{t("sendExactly")}</div>
            <div className="ws-display tnum mt-1 text-[30px] text-white">
              ₦{formatNgn(ngnAmount)}
            </div>
            {rateLockEnded ? (
              <div className="mt-1.5 text-[13px] font-medium text-white/70">
                {t("rateLockEnded")}
              </div>
            ) : secondsLeft != null ? (
              <div
                className={`tnum mt-1.5 text-[13px] font-medium ${
                  secondsLeft <= 60 ? "text-down" : "text-white/70"
                }`}
              >
                {t("rateLockIn", { time: formatCountdown(secondsLeft) })}
              </div>
            ) : null}
          </div>

          {/* The virtual account number is account-drainage grade: a session
              replay showing it is the same breach as sending it, so the whole
              block is masked rather than the rows individually. */}
          <div
            className={`ws-inset mt-3 divide-y divide-white/6 ${NO_AUTOCAPTURE_CLASS}`}
            {...MASK_ATTRIBUTE}
          >
            <DetailRow label={t("bank")} value={account.bankName} />
            <CopyRow
              label={t("accountNumber")}
              value={account.accountNumber}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
            />
            <DetailRow label={t("accountName")} value={account.accountName} />
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-normal text-white/55">
            <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" />
            {status === "processing" ? t("processing") : t("waiting")}
          </div>

          <div className="ws-inset mt-3 px-4 py-3">
            <p className="text-[12.5px] leading-normal font-normal text-white/70">
              {t("transferNote")}
            </p>
          </div>

          <button
            onClick={() => {
              // Money is now claimed to be in flight: hold the dashboard's
              // withdraw button until settlement resolves.
              if (order?.id) savePendingBankDeposit(order.id, Date.now());
              setHandoff("confirming");
            }}
            className="text-ink mt-3 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
          >
            {t("sentIt")}
          </button>
        </>
      ) : (
        <div className="ws-inset px-4 py-6 text-center">
          <p className="text-[13.5px] text-white/70">{t("noAccount")}</p>
          <button
            onClick={() => create.reset()}
            className="mt-4 cursor-pointer rounded-[12px] border border-white/15 bg-white/8 px-4 py-2 font-sans text-[13.5px] font-medium text-white hover:bg-white/12"
          >
            {t("startOver")}
          </button>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-[15px] py-3">
      <span className="shrink-0 text-[13px] font-normal text-white/50">{label}</span>
      <span className="truncate text-right font-sans text-[13.5px] font-medium text-white">
        {value}
      </span>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="flex items-center justify-between gap-4 px-[15px] py-3">
      <span className="shrink-0 text-[13px] font-normal text-white/50">{label}</span>
      <button
        onClick={copy}
        className="flex min-w-0 cursor-pointer items-center gap-2 text-right font-sans text-[13.5px] font-medium text-white hover:text-white/80"
      >
        <span className="tnum truncate">{value}</span>
        <span className="text-accent shrink-0">
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </span>
        <span className="sr-only">{copied ? copiedLabel : copyLabel}</span>
      </button>
    </div>
  );
}
