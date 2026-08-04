"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { KycOnboarding } from "@/components/dashboard/funds/kyc/kyc-onboarding";
import { ArrowUpRightIcon, BankIcon, CheckIcon, CopyIcon } from "@/components/ui/icons";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useNgnRate } from "@/hooks/use-ngn-rate";
import { useCreateOnramp, useOnrampStatus, usePouchOnrampRate } from "@/hooks/use-pouch-onramp";
import { copyText } from "@/lib/clipboard";
import { friendlyError } from "@/lib/errors";
import { getWalletAddress, deriveProfile } from "@/lib/user";
import { formatAmount } from "@/lib/trade/math";
import { KYC_COUNTRY_CODE } from "@/lib/pouch/kyc";
import { isReusableSession, loadKycSession, saveKycSession } from "@/lib/pouch/session";
import {
  estimatedUsd,
  isTerminalOnrampStatus,
  isValidOnrampNgn,
  ONRAMP_MIN_NGN,
} from "@/lib/pouch/onramp";

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

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Quick-select deposit amounts, in Naira. The first is the minimum.
const AMOUNT_PRESETS = [5000, 10000, 50000, 100000];

function compactNgn(amount: number): string {
  return amount >= 1000 ? `${amount / 1000}K` : String(amount);
}

// Naira onramp. Identity is verified once through Pouch Shared KYC; the JWT is
// stored and reused, so funding again is just amount then transfer. The user
// enters a Naira amount and sees its USD equivalent (Pouch is priced in USD, so
// we send that). We ask Pouch for a one-off bank account bound to their Base
// wallet, and they transfer the exact Naira shown; USDC settles to the wallet
// automatically once the payment clears.
export function BankTransferScreen({ onBack, onClose }: BankTransferScreenProps) {
  const t = useTranslations("bankTransfer");
  const { user } = usePrivy();
  const { refetch } = usePortfolio();
  // Prefer Pouch's live onramp rate so the USD estimate matches what the transfer
  // actually costs; fall back to the app FX rate only until the provider rate
  // loads (or if it is briefly unavailable).
  const { rate: appNgnRate } = useNgnRate();
  const { data: pouchRate } = usePouchOnrampRate();
  const ngnRate = pouchRate?.rate && pouchRate.rate > 0 ? pouchRate.rate : appNgnRate;

  const walletAddress = getWalletAddress(user, "ethereum");
  const email = deriveProfile(user).email;

  // Reuse an existing verification: a live, approved session lets the user skip
  // straight to the amount step.
  const [token, setToken] = useState(() => {
    const session = loadKycSession();
    return isReusableSession(session) ? session.token : "";
  });

  const [amountNgn, setAmountNgn] = useState("");
  // After the user says they have paid, we show a brief confirming state and
  // then a reassuring "on its way" message. Settlement takes a couple of minutes
  // on the provider side, so we do not block the user waiting on it here.
  const [handoff, setHandoff] = useState<"none" | "confirming" | "enroute">("none");
  const create = useCreateOnramp();
  const creation = create.data;

  // The user enters Naira; Pouch is priced in USD, so we convert with the live
  // rate and send the USD equivalent. The exact Naira to pay comes back from
  // Pouch on the next screen.
  const ngnAmount = Number(amountNgn);
  const usdAmount = estimatedUsd(ngnAmount, ngnRate);
  const validAmount = isValidOnrampNgn(ngnAmount) && usdAmount != null;

  const statusQuery = useOnrampStatus(creation?.sessionId ?? null, {
    enabled: Boolean(creation?.sessionId),
    pollMs: 20000,
  });
  const status = statusQuery.data?.status ?? creation?.status ?? "awaiting_payment";
  const done = status === "completed";

  // Refresh balances once the crypto has settled.
  useEffect(() => {
    if (done) refetch();
  }, [done, refetch]);

  // Hold the confirming state briefly, then move to the reassuring message. This
  // is a UX beat, not a real settlement check, so a fixed pause reads honestly.
  useEffect(() => {
    if (handoff !== "confirming") return;
    const id = setTimeout(() => setHandoff("enroute"), 15000);
    return () => clearTimeout(id);
  }, [handoff]);

  // Not verified yet: run the one-time Shared KYC, then store the JWT for reuse.
  if (!token) {
    return (
      <KycOnboarding
        defaultEmail={email}
        onBack={onBack}
        onVerified={(nextToken, expiresAt, verifiedEmail) => {
          saveKycSession({
            email: verifiedEmail,
            countryCode: KYC_COUNTRY_CODE,
            token: nextToken,
            expiresAt,
            state: "approved",
          });
          setToken(nextToken);
        }}
      />
    );
  }

  // Amount entry.
  if (!creation) {
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
          <div className="mt-2 border-t border-white/8 pt-2 text-[13px] font-normal text-white/55">
            {validAmount && usdAmount != null
              ? t("usdEquivalent", { amount: `$${formatUsd(usdAmount)}` })
              : t("enterMin", { amount: `₦${formatNgn(ONRAMP_MIN_NGN)}` })}
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
            if (!validAmount || !walletAddress || usdAmount == null) return;
            create.mutate({ token, amountUsd: usdAmount, walletAddress });
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

  // Settled: crypto has landed.
  if (done) {
    const received = statusQuery.data?.cryptoAmount ?? creation.cryptoAmount;
    const hash = statusQuery.data?.transactionHash;
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-accent/14 text-accent inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <CheckIcon size={26} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{t("doneTitle")}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
          {received != null
            ? t("doneBody", { amount: `${formatAmount(received)} USDC` })
            : t("doneBodyPlain")}
        </p>
        {hash ? (
          <a
            href={`https://basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
          >
            {t("viewTransaction")}
            <ArrowUpRightIcon size={14} />
          </a>
        ) : null}
        <button
          onClick={onClose}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("finish")}
        </button>
      </div>
    );
  }

  // Failed or expired: let the user start over.
  if (isTerminalOnrampStatus(status)) {
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-down/15 text-down inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <BankIcon size={24} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{t("failedTitle")}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
          {status === "expired" ? t("expiredBody") : t("failedBody")}
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
  const bank = creation.bank;
  return (
    <div>
      <SheetNav title={t("transferTitle")} onBack={onBack} />

      {bank ? (
        <>
          <div className="ws-inset p-[15px] text-center">
            <div className="text-xs font-normal text-white/55">{t("sendExactly")}</div>
            <div className="ws-display tnum mt-1 text-[30px] text-white">
              ₦{formatNgn(bank.amountNgn)}
            </div>
          </div>

          <div className="ws-inset mt-3 divide-y divide-white/6">
            <DetailRow label={t("bank")} value={bank.bankName} />
            <CopyRow
              label={t("accountNumber")}
              value={bank.accountNumber}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
            />
            <DetailRow label={t("accountName")} value={bank.accountName} />
            {bank.reference ? (
              <CopyRow
                label={t("reference")}
                value={bank.reference}
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
              />
            ) : null}
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
            onClick={() => setHandoff("confirming")}
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
