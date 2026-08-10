"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, CheckIcon } from "@/components/ui/icons";
import { isValidEmail } from "@/lib/waitlist";

type Phase = "idle" | "sending" | "done";

// The one interactive element on the pre-launch page: take an email, hand it
// to /api/waitlist, and swap in a confirmation. The field is validated on
// submit rather than on every keystroke, so a half-typed address never turns
// the row red while someone is still typing it.
export function WaitlistForm() {
  const t = useTranslations("waitlist");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // The service is idempotent, so a returning address is a success — just a
  // different sentence. Claiming a fresh signup for one would be a small lie.
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phase === "sending") return;
    if (!isValidEmail(email)) {
      setError(t("invalidEmail"));
      return;
    }
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // The route answers with a plain sentence on failure; fall back to our
      // own only when it could not say anything useful.
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        alreadyJoined?: boolean;
      } | null;
      if (!res.ok) throw new Error(body?.error || t("failed"));
      setAlreadyJoined(body?.alreadyJoined === true);
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : t("failed"));
    }
  };

  if (phase === "done") {
    return (
      <div className="flex w-full max-w-[460px] items-center gap-3 rounded-[18px] border border-white/16 bg-white/8 px-5 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-[50px]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/12 text-white">
          <CheckIcon />
        </span>
        <div className="min-w-0">
          <div className="font-sans text-[14.5px] font-semibold text-white">
            {alreadyJoined ? t("alreadyTitle") : t("doneTitle")}
          </div>
          <div className="mt-0.5 text-[13px] leading-[1.5] font-normal text-white/60">
            {t("doneBody")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[460px]">
      <form onSubmit={submit} className="flex flex-col gap-2.5 min-[440px]:flex-row">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          aria-invalid={error !== null}
          className={`min-w-0 flex-1 rounded-full border bg-white/8 px-5 py-[13px] font-sans text-[15px] text-white backdrop-blur-[50px] transition-colors outline-none placeholder:text-white/40 focus:border-white/35 ${
            error ? "border-down/55" : "border-white/16"
          }`}
        />
        <button
          type="submit"
          disabled={phase === "sending"}
          className="text-ink inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-6 py-[13px] font-sans text-[15px] font-semibold whitespace-nowrap hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "sending" ? t("joining") : t("join")}
          {phase === "sending" ? null : <ArrowUpRightIcon className="text-arrow" />}
        </button>
      </form>
      <p
        className={`mt-2.5 text-[12.5px] leading-[1.5] font-normal ${
          error ? "text-down" : "text-white/45"
        }`}
      >
        {error ?? t("privacyNote")}
      </p>
    </div>
  );
}
