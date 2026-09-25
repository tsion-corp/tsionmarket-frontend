"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSocialAuth, useSocialWallet } from "decane-connect-kit";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/ui/wordmark";
import { BRAND } from "@/lib/brand";
import { markKnownUser } from "@/lib/known-user";
import { returnPathFrom } from "@/lib/return-to";
import { MarketLogo } from "@/components/ui/market-logo";
import { SocialButtons } from "@/components/auth/social-buttons";
import { EmailForm } from "@/components/auth/email-form";
import { UnlockPanel, useUnlockOffer } from "@/components/auth/unlock-panel";
import { clearLastAuthMethod, promotePending } from "@/lib/last-auth-method";
import { clearDisplayProfile, useDisplayProfile } from "@/lib/display-profile";
import { PasskeyStep } from "@/components/auth/passkey-step";
import { useDevicePasskey } from "@/hooks/use-device-passkey";
import { usePasskeyNudgeDue } from "@/lib/passkey-nudge";
import { VisualPanel } from "@/components/auth/visual-panel";
import { useAuthSession } from "@/hooks/use-auth-session";
import { track } from "@/lib/analytics/mixpanel";

// How long the redirect waits on the "can this device hold a passkey?" check
// before giving up and routing anyway.
const PASSKEY_CHECK_GRACE_MS = 1_500;

export default function AuthPage() {
  const t = useTranslations("auth");
  const { ready, authenticated } = useAuthSession();
  const { isNewUser, phase } = useSocialAuth();
  const router = useRouter();
  const handled = useRef(false);
  const searchParams = useSearchParams();
  // Where they were headed before sign-in took over, when it is ours to go to.
  const returnTo = returnPathFrom(searchParams?.toString() ?? "");

  // What this browser can offer a returning visitor in place of the full
  // method list — a passkey unlock, or a one-tap repeat of their last method.
  // "Use a different account" falls back to the list for the rest of the visit,
  // and is the one place the remembered account is forgotten: sign-out keeps
  // it on purpose, so the way back in is one tap, and this is how someone who
  // is not that user says so.
  const { offer, checking } = useUnlockOffer();
  const remembered = useDisplayProfile() !== null;
  const wallet = useSocialWallet();
  const [useAnother, setUseAnother] = useState(false);
  // The passkey did not open a session: the full list, for the same person.
  const [passkeyFailed, setPasskeyFailed] = useState(false);
  const useAnotherAccount = () => {
    clearDisplayProfile();
    clearLastAuthMethod();
    // The kit also remembers WHO signed out, so it can offer that account's own
    // passkey or password back even with several accounts enrolled on this
    // browser. "Use a different account" must drop that too, or the previous
    // account keeps being offered.
    wallet.forgetLastUser();
    setUseAnother(true);
  };

  // A device on a PIN gets one chance to become a passkey device before it is
  // sent on. canAdd is null until the check resolves, so the redirect waits on
  // it — but never for long: a check that stalls must not strand a completed
  // sign-in on the auth screen.
  const { canAdd, needsReauth } = useDevicePasskey();
  const [stepDone, setStepDone] = useState(false);
  const [checkTimedOut, setCheckTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setCheckTimedOut(true), PASSKEY_CHECK_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  const nudgeDue = usePasskeyNudgeDue();

  // Right after a sign-out the kit re-checks the passkey and the password
  // asynchronously, and the offer reads as null until they answer. For a
  // visitor we remember, hold the method list back for that moment rather
  // than flash it and then swap it for the unlock panel. A first-time visitor
  // has nothing to wait for and gets the list at once. Bounded by the same
  // grace as the passkey check, so a stalled read never strands the screen.
  const settling = checking && remembered && !useAnother && !checkTimedOut;

  const signedIn = ready && authenticated && !stepDone;
  const passkeyCheckPending = signedIn && canAdd === null && !checkTimedOut;
  // needsReauth means the kit is too old for an in-place upgrade, and its
  // fallback is a sign-out — never something to do to a sign-in that just
  // succeeded.
  const offerPasskey = signedIn && canAdd === true && !needsReauth && nudgeDue;
  const holdRedirect = passkeyCheckPending || offerPasskey;

  // The top of the funnel: the sign-in screen was reached by someone signing
  // in. Reported once per mount, before any method is chosen, so the drop-off
  // to a completed sign-in is measurable. Not for a visitor with a live session:
  // this page forwards them straight on, and counting them inflated the top of
  // the funnel with people who were never signing in.
  const authStartedReported = useRef(false);
  useEffect(() => {
    if (!ready || authenticated || authStartedReported.current) return;
    authStartedReported.current = true;
    // `intent` is which door was used, not what the visitor turns out to be:
    // this screen is one form for both, so everyone arriving at it is reported
    // as signing in until a completed signup says otherwise.
    track("auth_started", { intent: "login" });
  }, [ready, authenticated]);

  // Runs after any sign-in completes and for already-signed-in visitors.
  // Decane provisions the wallets during sign-in itself (no separate creation
  // step), so all that is left is routing: a first-time signup continues
  // onboarding at the interest page, a returning user goes to the dashboard.
  useEffect(() => {
    if (!ready || !authenticated || handled.current) return;
    if (holdRedirect) return; // one screen first — see PasskeyStep
    handled.current = true;
    markKnownUser();
    // A method only becomes the remembered one once it has actually produced a
    // session, so an abandoned attempt never sets the shortcut.
    promotePending();
    // A link they followed wins over the default landing, first-timer or not:
    // someone handed a game at an event should reach the game, and onboarding
    // is still one tap away afterwards.
    router.replace(returnTo ?? (isNewUser ? "/interests" : "/dashboard"));
  }, [ready, authenticated, isNewUser, router, holdRedirect, returnTo]);

  // Key generation runs inside the sign-in ("creating"); reopening a session
  // for a returning user is "unlocking". Both read as busy.
  const busy = (phase !== null || (ready && authenticated)) && !offerPasskey;
  const creating = phase === "creating";

  return (
    <div className="grid min-h-screen grid-cols-1 bg-black lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex min-h-screen flex-col p-5 sm:px-10 sm:py-8">
        <div className="self-center md:self-start">
          <Wordmark />
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-start pt-8 pb-9 md:justify-center md:py-12">
          {/* The welcome lockup and the tagline are the desktop column's
              furniture. The mobile design names the task and goes straight to
              the sign-in methods. */}
          <h1 className="ws-display text-center text-[28px] leading-tight tracking-[-0.02em] md:hidden">
            {(offer || settling) && !useAnother ? t("unlockTitle") : t("createAccountTitle")}
          </h1>
          <h1 className="ws-display hidden text-[clamp(38px,4.6vw,56px)] leading-none tracking-[-0.03em] md:block">
            {t("welcome")}
            <MarketLogo className="mt-[0.22em] block h-[0.7em] w-auto" />
          </h1>
          <p className="mt-4 hidden max-w-[38ch] text-[15.5px] leading-[1.55] text-white/72 md:block">
            {t("tagline")}
          </p>

          {offerPasskey ? (
            <PasskeyStep onDone={() => setStepDone(true)} />
          ) : busy ? (
            <div className="mt-[34px] flex items-center gap-3 rounded-[14px] border border-white/14 bg-white/6 p-4">
              <MarketLogo className="h-[15px] w-auto shrink-0" />
              <span className="text-sm text-white/80">
                {creating ? t("creatingAccount") : t("signingIn")}
              </span>
            </div>
          ) : settling ? (
            <div className="mt-7 min-h-[132px] md:mt-[34px]" aria-busy="true" />
          ) : offer && !useAnother && !passkeyFailed ? (
            <div className="mt-7 md:mt-[34px]">
              <UnlockPanel
                offer={offer}
                onUseAnother={useAnotherAccount}
                onPasskeyFailed={() => setPasskeyFailed(true)}
              />
            </div>
          ) : (
            <>
              {passkeyFailed ? (
                <p className="mt-7 rounded-[14px] border border-white/14 bg-white/6 px-4 py-3 text-[13.5px] leading-normal text-white/72 md:mt-[34px]">
                  {t("passkeyFallbackNote")}
                </p>
              ) : null}
              {/* The design puts this label above the social buttons, so a
                  phone reads title, methods, then the email field. */}
              <div className="mt-7 mb-4 flex items-center gap-3.5 md:hidden">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[12px] whitespace-nowrap text-white/45">
                  {t("orContinueWith")}
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="md:mt-[34px]">
                <SocialButtons />
              </div>

              <div className="my-[22px] hidden items-center gap-3.5 md:flex">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-xs tracking-[0.04em] text-white/40">{t("or")}</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="mt-5 md:mt-0">
                <EmailForm />
              </div>
            </>
          )}
        </div>

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
      </div>

      <VisualPanel />
    </div>
  );
}
