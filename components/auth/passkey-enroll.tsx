"use client";

import { useState, useSyncExternalStore } from "react";
import { useLinkWithPasskey } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";

const subscribeNever = () => () => {};

function PasskeyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 11a4 4 0 100-8 4 4 0 000 8Zm-7 9c0-3.3 3.1-6 7-6 .7 0 1.4.1 2 .3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="15.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M17.5 18v3.5l1.5-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Step 2 of first-time signup: offer to secure the freshly created account
// with a passkey, right after the wallets exist and before the interest page.
// Linking is optional — Skip goes on without one (the passkey can be added
// any time by signing in again) — and enrolment failure is never a wall: the
// account already works, so errors toast and leave both buttons live.
export function PasskeyEnroll({ onDone }: { onDone: () => void }) {
  const t = useTranslations("auth");
  const [busy, setBusy] = useState(false);
  // WebAuthn support, read the way PasskeyButton reads it: server snapshot
  // renders nothing, the client value takes over post-hydration.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => !!window.PublicKeyCredential,
    () => false
  );
  const { linkWithPasskey } = useLinkWithPasskey({
    onSuccess: () => {
      track("passkey_added");
      toast.success(t("passkeyAdded"));
      onDone();
    },
    onError: (err) => {
      // "cannot_link_more_of_type" etc. — and user-cancelled prompts land
      // here too, which must not block the way forward.
      console.error("Passkey enrolment failed:", err);
      setBusy(false);
      toast.error(t("passkeyError"));
    },
  });

  // A browser with no WebAuthn cannot enrol; there is nothing to show.
  // The caller still renders the step frame, so explain and move on.
  const enrol = async () => {
    setBusy(true);
    await linkWithPasskey();
  };

  return (
    <div className="mt-[34px]">
      <div className="flex flex-col gap-3 rounded-[16px] border border-white/12 bg-white/4 p-5">
        <span className="text-accent grid h-11 w-11 place-items-center rounded-full bg-white/8">
          <PasskeyIcon size={20} />
        </span>
        <div className="font-sans text-[16px] font-semibold text-white">
          {t("passkeyStepTitle")}
        </div>
        <p className="text-[13.5px] leading-[1.55] font-normal text-white/65">
          {supported ? t("passkeyStepBody") : t("passkeyStepUnsupported")}
        </p>
      </div>

      {supported ? (
        <button
          onClick={() => void enrol()}
          disabled={busy}
          className="ws-chrome text-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          <PasskeyIcon />
          {busy ? t("passkeyWaiting") : t("passkeyStepAdd")}
        </button>
      ) : null}

      <button
        onClick={() => {
          track("passkey_skipped");
          onDone();
        }}
        disabled={busy}
        className="mt-3 w-full cursor-pointer rounded-[14px] border border-white/14 bg-transparent p-3.5 font-sans text-sm font-medium text-white/75 transition-colors hover:border-white/28 hover:bg-white/6 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {supported ? t("passkeyStepSkip") : t("continue")}
      </button>

      {supported ? (
        <p className="mt-3 text-xs leading-normal font-normal text-white/40">
          {t("passkeyStepLater")}
        </p>
      ) : null}
    </div>
  );
}
