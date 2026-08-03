"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ShieldIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ClockIcon,
  CloseIcon,
} from "@/components/ui/icons";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { OtpInput } from "@/components/auth/otp-input";
import { KycForm } from "@/components/dashboard/funds/kyc/kyc-form";
import { useKycInitiate, useKycStatus, useKycVerify } from "@/hooks/use-pouch-kyc";
import { friendlyError } from "@/lib/errors";
import { isRetryableState, KYC_COUNTRY_CODE, type KycField, type KycState } from "@/lib/pouch/kyc";

interface KycOnboardingProps {
  defaultEmail?: string;
  onBack: () => void;
  // Called once the user is verified, with the reusable JWT.
  onVerified: (token: string, expiresAt: string, email: string) => void;
}

type Step = "email" | "otp" | "form" | "status";

const INPUT_CLASS =
  "w-full rounded-[13px] border border-white/10 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent/45 disabled:opacity-60";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPINNER = "border-ink/30 border-t-ink h-4 w-4 animate-spin rounded-full border-2";

// One-time Shared KYC onboarding for the onramp: email, OTP, then the fields
// Pouch requires. On approval it hands the JWT back so the caller can create the
// onramp and reuse the verification on every later top-up.
export function KycOnboarding({ defaultEmail, onBack, onVerified }: KycOnboardingProps) {
  const t = useTranslations("fundsKyc");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [otp, setOtp] = useState("");
  const [fields, setFields] = useState<KycField[]>([]);
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [initialState, setInitialState] = useState<KycState>("not_started");
  const [submitState, setSubmitState] = useState<KycState>("pending");
  const [message, setMessage] = useState("");

  const initiate = useKycInitiate();
  const verify = useKycVerify();

  const emailOk = EMAIL_RE.test(email.trim());

  const sendCode = async () => {
    if (!emailOk) return;
    try {
      const result = await initiate.mutateAsync({
        email: email.trim(),
        countryCode: KYC_COUNTRY_CODE,
      });
      setFields(result.fields);
      setInitialState(result.state);
      setStep("otp");
    } catch {
      // Surfaced via initiate.error.
    }
  };

  const verifyCode = async (code: string) => {
    try {
      const result = await verify.mutateAsync({ email: email.trim(), otp: code });
      setToken(result.token);
      setExpiresAt(result.expiresAt);
      // A user who already has verified KYC is done the moment they prove the
      // email is theirs; otherwise collect the fields.
      if (initialState === "approved") {
        onVerified(result.token, result.expiresAt, email.trim());
      } else {
        setStep("form");
      }
    } catch {
      setOtp("");
    }
  };

  const onSubmitted = (state: KycState, msg: string) => {
    if (state === "approved") {
      onVerified(token, expiresAt, email.trim());
      return;
    }
    setSubmitState(state);
    setMessage(msg);
    setStep("status");
  };

  if (step === "otp") {
    return (
      <div>
        <SheetNav title={t("otpTitle")} onBack={() => setStep("email")} />
        <p className="mb-3 text-sm text-white/72">
          {t.rich("otpSentTo", {
            email: () => <span className="font-medium text-white">{email}</span>,
          })}
        </p>
        <OtpInput
          value={otp}
          onChange={setOtp}
          onComplete={verifyCode}
          disabled={verify.isPending}
        />
        <button
          onClick={() => verifyCode(otp)}
          disabled={verify.isPending || otp.length !== 6}
          className="text-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verify.isPending ? (
            <>
              <span className={SPINNER} />
              {t("checking")}
            </>
          ) : (
            t("verifyContinue")
          )}
        </button>
        {verify.isError ? (
          <p className="text-down mt-3 text-[13px]">
            {friendlyError(verify.error, t("codeMismatch"))}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end text-[13px]">
          <button
            onClick={() => {
              setOtp("");
              sendCode();
            }}
            disabled={initiate.isPending}
            className="hover:text-accent cursor-pointer text-white/60 disabled:opacity-50"
          >
            {initiate.isPending ? t("sendingCode") : t("resendCode")}
          </button>
        </div>
      </div>
    );
  }

  if (step === "form") {
    return (
      <KycForm
        token={token}
        countryCode={KYC_COUNTRY_CODE}
        fields={fields}
        prefill={{ EMAIL: email.trim() }}
        onSubmitted={onSubmitted}
      />
    );
  }

  if (step === "status") {
    return (
      <KycStatusView
        token={token}
        initialState={submitState}
        message={message}
        onApproved={() => onVerified(token, expiresAt, email.trim())}
        onRetry={() => setStep("form")}
      />
    );
  }

  // Email entry.
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-normal text-white/60 hover:text-white"
      >
        <ChevronLeftIcon size={14} />
        {t("back")}
      </button>
      {/* Block-level, not inline-grid: the back button above is inline-flex, so
          an inline badge shares its line and lands beside "Back". */}
      <span className="bg-accent/14 text-accent grid h-[52px] w-[52px] place-items-center rounded-full">
        <ShieldIcon size={24} />
      </span>
      <div className="ws-display mt-3 text-[24px] tracking-[-0.01em]">{t("startTitle")}</div>
      <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">
        {t("startSubtitle")}
      </p>

      <label className="mt-[18px] block">
        <span className="mb-2 block text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
          {t("emailLabel")}
        </span>
        <input
          type="email"
          inputMode="email"
          value={email}
          disabled={initiate.isPending}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendCode()}
          placeholder="you@email.com"
          className={INPUT_CLASS}
        />
      </label>

      {initiate.isError ? (
        <p className="text-down mt-3 text-[13px]">
          {friendlyError(initiate.error, t("initiateFailed"))}
        </p>
      ) : null}

      <button
        onClick={sendCode}
        disabled={!emailOk || initiate.isPending}
        className="text-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {initiate.isPending ? (
          <>
            <span className={SPINNER} />
            {t("sendingCode")}
          </>
        ) : (
          <>
            {t("sendCode")}
            <ArrowRightIcon className="text-arrow" />
          </>
        )}
      </button>
    </div>
  );
}

// Review outcome for a submitted KYC: poll while pending, offer a retry on the
// recoverable states, and stop on a final decline.
function KycStatusView({
  token,
  initialState,
  message,
  onApproved,
  onRetry,
}: {
  token: string;
  initialState: KycState;
  message: string;
  onApproved: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("fundsKyc");
  const shouldPoll = initialState === "pending";
  const status = useKycStatus(token, KYC_COUNTRY_CODE, { enabled: shouldPoll, pollMs: 5000 });
  const state = status.data?.state ?? initialState;
  const reason = status.data?.failureReason ?? message ?? "";

  // Fold straight through once verified: the caller advances to the amount step.
  useEffect(() => {
    if (state === "approved") onApproved();
  }, [state, onApproved]);

  if (state === "approved") return null;

  if (state === "rejected") {
    return (
      <StatusPanel
        tone="danger"
        icon={<CloseIcon size={22} />}
        title={t("rejectedTitle")}
        body={reason || t("rejectedBody")}
      />
    );
  }

  if (isRetryableState(state)) {
    return (
      <StatusPanel
        tone="warning"
        icon={<ClockIcon size={24} />}
        title={t("retryTitle")}
        body={reason || t("retryBody")}
      >
        <button
          onClick={onRetry}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("updateDetails")}
        </button>
      </StatusPanel>
    );
  }

  return (
    <StatusPanel
      tone="neutral"
      icon={<ClockIcon size={24} />}
      title={t("pendingTitle")}
      body={t("pendingBody")}
    >
      <div className="mt-5 flex items-center justify-center gap-2 text-[12.5px] text-white/45">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        {t("checkingStatus")}
      </div>
    </StatusPanel>
  );
}

const TONE: Record<string, string> = {
  danger: "bg-down/15 text-down",
  warning: "bg-amber-400/15 text-amber-300",
  neutral: "bg-white/8 text-white/70",
};

function StatusPanel({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: "danger" | "warning" | "neutral";
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-1 py-2 text-center">
      <span
        className={`inline-grid h-[56px] w-[56px] place-items-center rounded-full ${TONE[tone]}`}
      >
        {icon}
      </span>
      <div className="ws-display mt-4 text-[21px]">{title}</div>
      <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
        {body}
      </p>
      {children}
    </div>
  );
}
