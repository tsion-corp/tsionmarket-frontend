"use client";

import { useState } from "react";
import { useSocialAuth } from "decane-connect-kit";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics/mixpanel";
import { AUTH_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";
import { ArrowRightIcon } from "@/components/ui/icons";
import { OtpInput } from "@/components/auth/otp-input";
import { recordAuthMethod } from "@/lib/analytics/auth-method";
import { rememberDisplayProfile } from "@/lib/display-profile";
import { rememberPending } from "@/lib/last-auth-method";

const PRIMARY =
  "ws-chrome flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-4 font-sans md:rounded-[14px] md:p-3.5 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60";
const INPUT =
  "w-full rounded-full border border-white/14 bg-black/40 px-5 py-4 text-[15px] text-white outline-none focus:border-accent/50 md:rounded-[14px] md:px-4 md:py-3.5";

export function EmailForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const { sendEmailCode, confirmEmailCode, emailLoading } = useSocialAuth();

  // Both legs of the email flow report the same way; only the step differs.
  const reportFailure = (err: unknown) =>
    track("login_failed", { method: "email", ...reasonFor(AUTH_FAILURE, err) });

  const submitEmail = async () => {
    if (!email.includes("@")) {
      setError(t("emailInvalid"));
      return;
    }
    setError(null);
    track("auth_method_selected", { method: "email" });
    try {
      await sendEmailCode(email);
      setStep("code");
    } catch (err) {
      console.error("Sending login code failed:", err);
      reportFailure(err);
      setError(t("emailSendFailed"));
    }
  };

  const submitCode = async (value: string) => {
    setError(null);
    try {
      recordAuthMethod("email");
      rememberPending("email");
      await confirmEmailCode(email, value);
      // Email sign-in returns no profile from Decane, but we hold the one
      // fact it proves: the address. Greetings use its local part.
      rememberDisplayProfile({ email });
    } catch (err) {
      console.error("Code verification failed:", err);
      reportFailure(err);
      setCode("");
      setError(t("codeMismatch"));
    }
  };

  if (step === "code") {
    return (
      <div className="flex flex-col gap-[11px]">
        {/* The design gives this step its own title; the desktop column already
            carries one above the form, so it only shows on a phone. */}
        <h2 className="ws-display text-center text-[28px] leading-tight tracking-[-0.02em] md:hidden">
          {t("checkEmailTitle")}
        </h2>
        <p className="text-center text-sm text-white/72 md:text-left">
          {t.rich("codeSent", {
            email: () => <span className="font-medium text-white">{email}</span>,
          })}
        </p>
        <OtpInput value={code} onChange={setCode} onComplete={submitCode} disabled={emailLoading} />
        <button
          onClick={() => submitCode(code)}
          disabled={emailLoading || code.length !== 6}
          className={PRIMARY}
        >
          {emailLoading ? t("checking") : t("verifyContinue")}
          <ArrowRightIcon className="text-arrow" />
        </button>
        {error ? <p className="text-down text-[13px]">{error}</p> : null}
        <div className="flex flex-col items-center gap-2 text-[13px] md:flex-row md:justify-between md:gap-0">
          <button
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="cursor-pointer text-white/60 hover:text-white"
          >
            {t("differentEmail")}
          </button>
          <button
            onClick={() => sendEmailCode(email)}
            disabled={emailLoading}
            className="hover:text-accent cursor-pointer text-white/60"
          >
            {t("resendCode")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[11px]">
      {/* The mobile design labels the field; the desktop column relies on the
          placeholder, so the label only shows on a phone. */}
      <label htmlFor="auth-email" className="-mb-1 text-[13px] text-white/55 md:hidden">
        {t("emailLabel")}
      </label>
      <input
        id="auth-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submitEmail()}
        placeholder="you@email.com"
        className={INPUT}
      />
      <button onClick={submitEmail} disabled={emailLoading} className={PRIMARY}>
        {emailLoading ? t("sendingCode") : t("continueEmail")}
        <ArrowRightIcon className="text-arrow" />
      </button>
      {error ? <p className="text-down text-[13px]">{error}</p> : null}
    </div>
  );
}
