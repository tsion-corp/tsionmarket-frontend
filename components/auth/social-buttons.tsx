"use client";

import { useState } from "react";
import { useSocialAuth } from "decane-connect-kit";
import { useTranslations } from "next-intl";
import { recordAuthMethod } from "@/lib/analytics/auth-method";
import { track } from "@/lib/analytics/mixpanel";
import { AUTH_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";
import type { AuthMethod } from "@/lib/analytics/events";
import { rememberPending, type LastAuthMethod } from "@/lib/last-auth-method";
import { toast } from "@/lib/toast";

// The X wordmark. Inline rather than hosted: a sign-in button that waits on a
// third party's CDN is one that sometimes renders empty. currentColor so it
// follows the button's text.
function XLogo({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24">
      <path
        fill="#fff"
        d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7C21.8 18.7 23 15.8 23 12.3Z"
        opacity=".9"
      />
      <path
        fill="#fff"
        d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 21.4 7.5 24 12 24Z"
        opacity=".7"
      />
      <path
        fill="#fff"
        d="M5.6 14.8c-.2-.7-.4-1.4-.4-2.2s.2-1.5.4-2.2V7.5H1.8C1 9 .6 10.7.6 12.6s.4 3.6 1.2 5.1l3.8-2.9Z"
        opacity=".55"
      />
      <path
        fill="#fff"
        d="M12 5.7c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 2.2 15.1 1.2 12 1.2 7.5 1.2 3.7 3.8 1.8 7.5l3.8 2.9C6.5 7.7 9 5.7 12 5.7Z"
        opacity=".9"
      />
    </svg>
  );
}

const BUTTON =
  "flex w-full cursor-pointer items-center justify-center gap-[11px] rounded-full border border-white/14 bg-white/6 px-4 py-4 font-sans md:rounded-[14px] md:p-3.5 text-[15px] font-medium text-white transition-colors hover:border-white/28 hover:bg-white/12 disabled:cursor-wait disabled:opacity-60";

export function SocialButtons() {
  const t = useTranslations("auth");
  const {
    signInWithGoogle,
    googleLoading,
    signInWithKingsChat,
    kingschatLoading,
    signInWithX,
    xLoading,
    canUsePasskey,
    signInWithPasskey,
  } = useSocialAuth();
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  // One report per door. The chosen method is recorded for the identity
  // provider (lib/analytics/auth-method) AND announced as the selection; a
  // failure is reported as a login, because this screen is one form for both
  // and whether the account would have been new is not knowable before it
  // exists.
  // The doors on this screen are all methods the last-auth memory knows;
  // AuthMethod is wider (apple, wallet) and those never reach here.
  const choose = (method: LastAuthMethod) => {
    recordAuthMethod(method);
    rememberPending(method);
    track("auth_method_selected", { method });
  };
  const failed = (method: AuthMethod, err: unknown) =>
    track("login_failed", { method, ...reasonFor(AUTH_FAILURE, err) });

  const signIn = async () => {
    try {
      choose("google");
      await signInWithGoogle();
    } catch (err) {
      console.error("Google login failed:", err);
      failed("google", err);
      toast.error(t("oauthError"));
    }
  };

  // One biometric prompt instead of a Google round trip, offered when this
  // device already holds a passkey-wrapped share for the remembered user, the
  // common case after a closed tab dropped the session.
  const passkeySignIn = async () => {
    setPasskeyBusy(true);
    try {
      choose("passkey");
      await signInWithPasskey();
    } catch (err) {
      console.error("Passkey sign-in failed:", err);
      failed("passkey", err);
      toast.error(t("passkeyError"));
    } finally {
      setPasskeyBusy(false);
    }
  };

  // KingsChat opens a consent popup that resolves in place (unlike Google's
  // full-page redirect), so the click handler awaits it and surfaces failures
  // as a toast. The kit invokes the popup synchronously, so no work precedes it.
  // X is a full-page redirect like Google, not a popup like KingsChat: the
  // browser leaves and the promise never resolves, so there is nothing to
  // clear on the way out.
  const xSignIn = async () => {
    try {
      choose("x");
      await signInWithX();
    } catch (err) {
      console.error("X login failed:", err);
      failed("x", err);
      toast.error(t("oauthError"));
    }
  };

  const kingschatSignIn = async () => {
    try {
      choose("kingschat");
      await signInWithKingsChat();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      // A user closing the KingsChat popup is a cancellation, not an error.
      if (name !== "UserCancelledError") {
        console.error("KingsChat login failed:", err);
        failed("kingschat", err);
        toast.error(t("oauthError"));
      }
    }
  };

  return (
    <div className="flex flex-col gap-[11px]">
      {canUsePasskey ? (
        <button className={BUTTON} disabled={passkeyBusy} onClick={passkeySignIn}>
          {passkeyBusy ? t("passkeyWaiting") : t("passkeySignIn")}
        </button>
      ) : null}
      <button className={BUTTON} disabled={googleLoading} onClick={signIn}>
        <GoogleLogo />
        {t("continueGoogle")}
      </button>
      <button className={BUTTON} disabled={xLoading} onClick={xSignIn}>
        <XLogo />
        {t("continueX")}
      </button>
      {/* KingsChat is built but not open to users yet. Shown rather than
          hidden, so the method people are waiting for is visibly on the way,
          and disabled so nobody starts a flow that cannot finish. The handler
          stays wired — a disabled button never fires it — so turning this back
          on is deleting `disabled` and the badge, nothing more. */}
      <button className={BUTTON} disabled aria-disabled="true" onClick={kingschatSignIn}>
        {kingschatLoading ? t("kingschatWaiting") : t("continueKingschat")}
        <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11.5px] font-semibold text-white/70">
          {t("kingschatSoon")}
        </span>
      </button>
    </div>
  );
}
