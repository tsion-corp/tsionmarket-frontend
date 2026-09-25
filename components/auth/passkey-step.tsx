"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDevicePasskey } from "@/hooks/use-device-passkey";
import { recordPasskeyNudgeDeclined } from "@/lib/passkey-nudge";
import { MarketLogo } from "@/components/ui/market-logo";
import { toast } from "@/lib/toast";

// Offered once a sign-in lands on a device whose share is PIN-wrapped.
//
// That wrapping is almost never a choice — it is what happens when no passkey
// was reachable at wallet-creation time (a password manager that wasn't signed
// in, a dismissed prompt) — and the kit never revisits it on its own: once a
// PIN-wrapped share exists, every unlock goes to the PIN prompt however
// available passkeys later become. This is the moment to revisit it, because
// the user has just proved who they are and the payoff is the very next
// sign-in.
//
// Deliberately placed before the redirect rather than as a card on the
// dashboard: a passkey turns the next sign-in into one prompt, and that is
// worth one screen now. Declining is remembered for a week (passkey-nudge).

const PRIMARY =
  "ws-chrome flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-4 font-sans md:rounded-[14px] md:p-3.5 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60";

export function PasskeyStep({ onDone }: { onDone: () => void }) {
  const t = useTranslations("auth");
  const { adding, addPasskey } = useDevicePasskey();
  const [done, setDone] = useState(false);

  const add = async () => {
    try {
      await addPasskey();
      setDone(true);
      toast.success(t("passkeyAdded"));
      onDone();
    } catch (err) {
      // A dismissed authenticator sheet is a decision, not a failure, and the
      // user is still looking at the button. Anything else is worth saying,
      // but never worth blocking a completed sign-in over.
      const name = (err as { name?: string })?.name;
      if (name !== "NotAllowedError" && name !== "UserCancelledError") {
        console.error("Adding a passkey failed:", err);
        toast.error(t("passkeyError"));
      }
    }
  };

  const skip = () => {
    recordPasskeyNudgeDeclined();
    onDone();
  };

  return (
    <div className="mt-7 flex flex-col gap-4 md:mt-[34px]">
      <div className="flex flex-col gap-2.5 rounded-[14px] border border-white/14 bg-white/6 p-4">
        <MarketLogo className="h-[15px] w-auto" />
        <p className="text-[15px] font-medium text-white">{t("passkeyStepTitle")}</p>
        <p className="text-[13.5px] leading-[1.5] text-white/60">{t("passkeyStepBody")}</p>
      </div>

      <div className="flex flex-col gap-[11px]">
        <button className={PRIMARY} disabled={adding || done} onClick={add}>
          {adding ? t("passkeyWaiting") : t("passkeyStepAdd")}
        </button>
        <button
          onClick={skip}
          disabled={adding}
          className="cursor-pointer py-1 text-center text-[13.5px] text-white/55 transition-colors hover:text-white/80 disabled:opacity-40"
        >
          {t("passkeyStepSkip")}
        </button>
        <p className="text-center text-xs text-white/35">{t("passkeyStepLater")}</p>
      </div>
    </div>
  );
}
