"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLoginWithEmail, useLoginWithOAuth } from "@privy-io/react-auth";

/**
 * THE OLD SIGN-IN, DRAWN BY US.
 *
 * The upgrade used to hand the old provider's own modal over the card — a
 * second design, a second brand, in the middle of ours. The provider's
 * headless hooks do the same work without the modal: Google and X leave the
 * page and come back to it, and email sends a code and takes it back.
 * Styled as the sign-in page is, so the card reads as one thing.
 *
 * The three historical methods and nothing more (see
 * components/providers/legacy-privy-provider). A method that fails says so
 * under the buttons; nothing here is fatal, the reader simply tries again.
 */
const BUTTON =
  "flex w-full cursor-pointer items-center justify-center gap-[11px] rounded-full border border-white/14 bg-white/6 px-4 py-[15px] font-sans text-[15px] font-medium text-white transition-colors hover:border-white/28 hover:bg-white/12 disabled:cursor-wait disabled:opacity-60";
const PRIMARY =
  "flex w-full cursor-pointer items-center justify-center rounded-full bg-gradient-to-b from-white to-[#DADADA] px-4 py-[15px] font-sans text-[16px] font-semibold text-[#111] transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-60";
const INPUT =
  "w-full rounded-full border border-white/14 bg-black/40 px-5 py-[14px] text-center text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/30";
const QUIET =
  "cursor-pointer font-sans text-[13px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function XMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 1.2h3.7l-8 9.2 9.4 12.4h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L.1 1.2h7.6l5.2 6.9 6-6.9zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3z" />
    </svg>
  );
}

export function LegacySignIn() {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"methods" | "code">("methods");
  const [busy, setBusy] = useState<"google" | "twitter" | "email" | "code" | null>(null);

  const oauth = useLoginWithOAuth({
    onError: () => {
      setBusy(null);
      setError(t("oauthError"));
    },
  });
  const otp = useLoginWithEmail({
    onError: () => {
      setBusy(null);
      setError(step === "code" ? t("codeMismatch") : t("emailSendFailed"));
    },
  });

  const social = async (provider: "google" | "twitter") => {
    setError(null);
    setBusy(provider);
    try {
      // Leaves the page; the return lands back on this card with the session.
      await oauth.initOAuth({ provider });
    } catch {
      setBusy(null);
      setError(t("oauthError"));
    }
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(t("emailInvalid"));
      return;
    }
    setError(null);
    setBusy("email");
    try {
      await otp.sendCode({ email: address });
      setStep("code");
      setCode("");
    } catch {
      setError(t("emailSendFailed"));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setError(null);
    setBusy("code");
    try {
      await otp.loginWithCode({ code: code.trim() });
    } catch {
      setError(t("codeMismatch"));
      setBusy(null);
    }
  };

  if (step === "code") {
    return (
      <form onSubmit={verify} className="flex flex-col gap-3">
        <p className="text-center text-[13.5px] leading-normal text-white/60">
          {t.rich("codeSent", {
            email: () => <span className="font-medium text-white">{email.trim()}</span>,
          })}
        </p>
        <input
          className={`${INPUT} tnum tracking-[0.3em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="••••••"
          autoFocus
        />
        {error ? <p className="text-down text-center text-[13px]">{error}</p> : null}
        <button type="submit" disabled={busy !== null || code.length < 6} className={PRIMARY}>
          {t("verifyContinue")}
        </button>
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={() => setStep("methods")} className={QUIET}>
            {t("differentEmail")}
          </button>
          <button
            type="button"
            onClick={(e) => void sendCode(e)}
            disabled={busy !== null}
            className={QUIET}
          >
            {t("resendCode")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void social("google")}
        disabled={busy !== null}
        className={BUTTON}
      >
        <GoogleMark />
        {t("continueGoogle")}
      </button>
      <button
        type="button"
        onClick={() => void social("twitter")}
        disabled={busy !== null}
        className={BUTTON}
      >
        <XMark />
        {t("continueX")}
      </button>
      <div className="my-1 flex items-center gap-3.5">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[12px] whitespace-nowrap text-white/45">{t("orContinueWith")}</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <form onSubmit={sendCode} className="flex flex-col gap-3">
        <input
          className={INPUT}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailLabel")}
          aria-label={t("emailLabel")}
        />
        <button type="submit" disabled={busy !== null || !email.trim()} className={PRIMARY}>
          {busy === "email" ? t("sendingCode") : t("continueEmail")}
        </button>
      </form>
      {error ? <p className="text-down text-center text-[13px]">{error}</p> : null}
    </div>
  );
}
