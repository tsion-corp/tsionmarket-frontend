"use client";

import { useState } from "react";
import { useLoginWithPasskey } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { hasPasskeyDevice, markPasskeyDevice } from "@/lib/preferences";
import { toast } from "@/lib/toast";

function PasskeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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

export function PasskeyButton() {
  const t = useTranslations("auth");
  const [visible] = useState(hasPasskeyDevice);
  const { loginWithPasskey, state } = useLoginWithPasskey({
    onComplete: () => markPasskeyDevice(),
    onError: (err) => {
      console.error("Passkey login failed:", err);
      toast.error(t("passkeyError"));
    },
  });

  if (!visible) return null;

  const busy = state.status !== "initial" && state.status !== "error";

  return (
    <div className="mt-[11px] flex flex-col gap-2">
      <button
        onClick={() => loginWithPasskey()}
        disabled={busy}
        className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border border-white/14 bg-transparent p-[13px] font-sans text-sm font-medium text-white/90 transition-colors hover:border-white/28 hover:bg-white/6 disabled:cursor-wait disabled:opacity-60"
      >
        <span className="text-accent">
          <PasskeyIcon />
        </span>
        {busy ? t("passkeyWaiting") : t("passkeySignIn")}
      </button>
      <p className="text-xs font-normal text-white/40">{t("passkeyHint")}</p>
    </div>
  );
}
