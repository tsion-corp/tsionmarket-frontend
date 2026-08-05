"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/ui/wordmark";
import { ArkMark } from "@/components/ui/ark-mark";
import { BRAND } from "@/lib/brand";
import { markKnownUser } from "@/lib/known-user";
import { MarketLogo } from "@/components/ui/market-logo";
import { SocialButtons } from "@/components/auth/social-buttons";
import { EmailForm } from "@/components/auth/email-form";
import { PasskeyButton } from "@/components/auth/passkey-button";
import { PasskeyEnroll } from "@/components/auth/passkey-enroll";
import { VisualPanel } from "@/components/auth/visual-panel";
import { useEnsureWallets } from "@/hooks/use-ensure-wallets";
import { hasEmbeddedWallet } from "@/lib/user";

// The flow the page walks through. Step 1 is signing in (the wallet
// provisioning a first-time account needs is derived, not stored). Step 2
// offers a passkey to any account that does not hold one yet — a first-time
// signup on the way to the interest page, a returning user on the way to the
// dashboard. An account with a passkey skips it every time.
type Phase = "signin" | "passkey";

function StepMarker({ step, label }: { step: number; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex items-center gap-1.5" aria-hidden>
        {[1, 2].map((n) => (
          <span
            key={n}
            className={`h-1.5 rounded-full transition-all ${
              n === step ? "bg-accent w-6" : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </span>
      <span className="text-[11.5px] font-medium tracking-[0.04em] text-white/45 uppercase">
        {label}
      </span>
    </div>
  );
}

export default function AuthPage() {
  const t = useTranslations("auth");
  const { ready, authenticated, user } = usePrivy();
  const ensureWallets = useEnsureWallets();
  const router = useRouter();
  const handled = useRef(false);
  const [phase, setPhase] = useState<Phase>("signin");

  // Where step 2 hands off to: a first-timer continues onboarding at the
  // interest page, a returning user goes back to the dashboard.
  const [destination, setDestination] = useState("/dashboard");

  // Runs after any login completes (OAuth redirect return, email code,
  // passkey) and for already-signed-in visitors. One gate decides step 2:
  // does this account hold a passkey yet? Whoever lacks one is offered it —
  // first-time signups right after their wallets are provisioned, and
  // returning users who skipped it before. Whoever has one never sees it,
  // which also covers signing IN with a passkey: it would ask for the thing
  // they just used.
  useEffect(() => {
    if (!ready || !authenticated || !user || handled.current) return;
    handled.current = true;
    markKnownUser();
    const firstTime = !hasEmbeddedWallet(user, "ethereum");
    const after = firstTime ? "/interests" : "/dashboard";
    const hasPasskey = user.linkedAccounts.some((account) => account.type === "passkey");
    void ensureWallets(user).then(() => {
      if (hasPasskey) {
        router.replace(after);
      } else {
        setDestination(after);
        setPhase("passkey");
      }
    });
  }, [ready, authenticated, user, ensureWallets, router]);

  const busy = ready && authenticated && phase !== "passkey";
  // Derived, not stored: while busy, a user without an embedded wallet is a
  // first-timer whose account is being set up; everyone else is signing in.
  const creating = busy && !!user && !hasEmbeddedWallet(user, "ethereum");

  return (
    <div className="grid min-h-screen grid-cols-1 bg-black lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex min-h-screen flex-col p-5 sm:px-10 sm:py-8">
        <div className="self-start">
          <Wordmark />
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-9 sm:py-12">
          {phase === "passkey" ? (
            <>
              <StepMarker step={2} label={t("stepOf", { step: 2, steps: 2 })} />
              <h1 className="ws-display text-[clamp(34px,4vw,48px)] leading-none tracking-[-0.03em]">
                {t("passkeyStepHeading")}
              </h1>
              <p className="mt-4 max-w-[38ch] text-[15.5px] leading-[1.55] text-white/72">
                {t("passkeyStepTagline")}
              </p>
              <PasskeyEnroll onDone={() => router.replace(destination)} />
            </>
          ) : (
            <>
              <StepMarker step={1} label={t("stepOf", { step: 1, steps: 2 })} />
              <h1 className="ws-display text-[clamp(38px,4.6vw,56px)] leading-none tracking-[-0.03em]">
                {t("welcome")}
                <MarketLogo className="mt-[0.22em] block h-[0.7em] w-auto" />
              </h1>
              <p className="mt-4 max-w-[38ch] text-[15.5px] leading-[1.55] text-white/72">
                {t("tagline")}
              </p>

              {busy ? (
                <div className="mt-[34px] flex items-center gap-3 rounded-[14px] border border-white/14 bg-white/6 p-4">
                  <span className="animate-pulse">
                    <ArkMark height={18} />
                  </span>
                  <span className="text-sm text-white/80">
                    {creating ? t("creatingAccount") : t("signingIn")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="mt-[34px]">
                    <SocialButtons />
                  </div>

                  <div className="my-[22px] flex items-center gap-3.5">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-xs tracking-[0.04em] text-white/40">{t("or")}</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <EmailForm />

                  <PasskeyButton />
                </>
              )}
            </>
          )}
        </div>

        {phase === "passkey" ? null : (
          <p className="mx-auto max-w-[420px] text-center text-xs leading-normal text-white/35">
            {t.rich("agree", {
              brand: BRAND,
              terms: (chunks) => (
                <a href="#" className="text-white/60 underline">
                  {chunks}
                </a>
              ),
              privacy: (chunks) => (
                <a href="#" className="text-white/60 underline">
                  {chunks}
                </a>
              ),
            })}
            .
          </p>
        )}
      </div>

      <VisualPanel />
    </div>
  );
}
