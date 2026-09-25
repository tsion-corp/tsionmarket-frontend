"use client";

import { useEffect, useState } from "react";
import { useSocialAuth, useSocialWallet } from "decane-connect-kit";
import { useTranslations } from "next-intl";
import { recordAuthMethod } from "@/lib/analytics/auth-method";
import { rememberPending, useLastAuthMethod } from "@/lib/last-auth-method";
import { useDisplayProfile, type DisplayProfile } from "@/lib/display-profile";
import { toast } from "@/lib/toast";
import { promptUnlockPassword, UnlockPasswordCancelledError } from "@/lib/decane-recovery";
import { UserIcon } from "@/components/ui/icons";

// The returning-visitor shortcut. Two different things wear the same button
// here, and the difference is worth being precise about:
//
//   passkey  — a real unlock. WebAuthn login is verified server-side, so it
//              mints the JWT on its own and the user never sees a sign-in.
//              One biometric prompt, straight to the dashboard.
//
//   password — also a real unlock, for devices that cannot hold a passkey. The
//              password decrypts an unlock token that buys a session, so no
//              identity provider is involved either.
//
//   google / kingschat — a one-tap SIGN-IN, not an unlock. It skips choosing
//              a method, nothing more.
//
// There is still deliberately no PIN entry here, and the distinction from the
// password is not pedantry. A PIN wraps only the device share — one of three,
// which opens nothing on its own — so it can never produce the JWT a session
// needs. The unlock password is a different object: it also decrypts a token
// that buys a session, which is exactly why the kit demands a real password for
// it and rejects digits-only input. A device left on a PIN signs in first and
// is asked for the PIN after; its way onto this screen is to add a passkey or
// set an unlock password, not to move the PIN here.

export type UnlockOffer =
  { kind: "passkey" } | { kind: "password" } | { kind: "google" } | { kind: "kingschat" };

/** The returning-visitor shortcut, and whether it is still being worked out. */
export interface UnlockOfferState {
  /** What to offer, or null for the full list of sign-in methods. */
  offer: UnlockOffer | null;
  /**
   * The device checks behind the offer have not all answered yet. On the
   * screen after a sign-out the kit re-checks the passkey and the password
   * asynchronously, and a null offer during that window means "not yet", not
   * "no". A caller that shows the full list on null flashes it at exactly the
   * user this shortcut exists for.
   */
  checking: boolean;
}

/**
 * What this browser can offer a returning user, or null to show the full list
 * of sign-in methods. Email is never offered: it needs a mailed code, so a
 * shortcut would save no steps.
 */
export function useUnlockOffer(): UnlockOfferState {
  const { canUsePasskey } = useSocialAuth();
  const { canUnlockWithPassword } = useSocialWallet();
  const last = useLastAuthMethod();
  const profile = useDisplayProfile();

  // Async, unlike canUsePasskey, because it reads the share store directly.
  // Both checks read the same store, so the password answer landing is a fair
  // signal that the passkey one has too.
  const [password, setPassword] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    canUnlockWithPassword()
      .then((can) => {
        if (live) setPassword(can);
      })
      .catch(() => {
        if (live) setPassword(false);
      });
    return () => {
      live = false;
    };
  }, [canUnlockWithPassword]);

  const checking = password === null;
  // A passkey outranks a password: one biometric beats typing a password.
  if (canUsePasskey) return { offer: { kind: "passkey" }, checking: false };
  if (password) return { offer: { kind: "password" }, checking: false };
  // Only shortcut someone we can actually name — an unattributed "Continue"
  // button is worse than the ordinary method list.
  if (!profile) return { offer: null, checking };
  if (last === "google") return { offer: { kind: "google" }, checking };
  if (last === "kingschat") return { offer: { kind: "kingschat" }, checking };
  return { offer: null, checking };
}

// The kit reports a wrong password distinctly from a token the server refused,
// because they need opposite responses: retype it, versus sign in normally to
// re-enable the path. Only the first is worth reopening the dialog for.
function isWrongPassword(err: unknown): boolean {
  const e = err as { name?: string; code?: string };
  return e?.name === "WrongUnlockPasswordError" || e?.code === "WRONG_UNLOCK_PASSWORD";
}

function greetingName(profile: DisplayProfile | null): string | null {
  if (profile?.name) return profile.name;
  if (profile?.email) return profile.email.split("@")[0];
  return null;
}

function Avatar({ profile }: { profile: DisplayProfile | null }) {
  const name = greetingName(profile);
  if (profile?.picture) {
    return (
      // A Google/KingsChat avatar URL is arbitrary and unknown at build time;
      // next/image would need every provider host allow-listed for a 44px
      // decoration.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.picture} alt="" className="size-11 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/80">
      {name ? (
        <span className="ws-display text-[17px]">{name.charAt(0).toUpperCase()}</span>
      ) : (
        <UserIcon size={21} />
      )}
    </div>
  );
}

const PRIMARY =
  "ws-chrome flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-4 font-sans md:rounded-[14px] md:p-3.5 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60";

export function UnlockPanel({
  offer,
  onUseAnother,
}: {
  offer: UnlockOffer;
  onUseAnother: () => void;
}) {
  const t = useTranslations("auth");
  const profile = useDisplayProfile();
  const { signInWithPasskey, signInWithGoogle, signInWithKingsChat } = useSocialAuth();
  const { unlockWithPassword } = useSocialWallet();
  const [busy, setBusy] = useState(false);

  const name = greetingName(profile);

  // A mistyped password used to end the whole attempt: one error toast and the
  // dialog gone, with no way back to it short of tapping unlock again. It now
  // reopens until the password is right or the user cancels.
  //
  // The dialog owns the secret throughout — this screen never sees it — which
  // is why the prompt is re-issued rather than the value re-read.
  const unlockWithRetries = async () => {
    for (;;) {
      const password = await promptUnlockPassword({ kind: "unlock" });
      try {
        await unlockWithPassword(password);
        return;
      } catch (err) {
        if (!isWrongPassword(err)) throw err;
        toast.error(t("unlockPwWrong"));
      }
    }
  };

  const unlock = async () => {
    setBusy(true);
    try {
      const method = offer.kind === "password" ? "passkey" : offer.kind;
      recordAuthMethod(method);
      rememberPending(method);
      if (offer.kind === "passkey") await signInWithPasskey();
      else if (offer.kind === "password") await unlockWithRetries();
      else if (offer.kind === "google") await signInWithGoogle();
      else await signInWithKingsChat();
    } catch (err) {
      // A closed passkey sheet or KingsChat popup is a cancellation, not a
      // failure, and the user is already looking at the way to retry.
      const errName = (err as { name?: string })?.name;
      // Backing out of the password dialog is a decision, not a failure.
      if (err instanceof UnlockPasswordCancelledError) return;
      if (errName !== "UserCancelledError" && errName !== "NotAllowedError") {
        console.error(`Unlock via ${offer.kind} failed:`, err);
        toast.error(
          offer.kind === "passkey" || offer.kind === "password"
            ? t("passkeyError")
            : t("oauthError")
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex items-center gap-3 rounded-full border border-white/14 bg-white/6 p-3 md:rounded-[14px]">
        <Avatar profile={profile} />
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-white">
            {name ? t("unlockGreeting", { name }) : t("unlockGreetingAnon")}
          </p>
          {profile?.email ? (
            <p className="truncate text-[13px] text-white/55">{profile.email}</p>
          ) : null}
        </div>
      </div>

      <button className={PRIMARY} disabled={busy} onClick={unlock}>
        {busy
          ? t(offer.kind === "passkey" ? "passkeyWaiting" : "signingIn")
          : offer.kind === "passkey"
            ? t("unlockWithPasskey")
            : offer.kind === "password"
              ? t("unlockWithPassword")
              : t("unlockContinue")}
      </button>

      <button
        onClick={onUseAnother}
        className="cursor-pointer py-1 text-center text-[13.5px] text-white/55 transition-colors hover:text-white/80"
      >
        {t("unlockUseAnother")}
      </button>
    </div>
  );
}
