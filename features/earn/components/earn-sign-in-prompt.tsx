"use client";

import { useTranslations } from "next-intl";
import { openSignIn } from "@/hooks/use-sign-in";

export function EarnSignInPrompt() {
  const t = useTranslations("auth");
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 px-4 py-20 text-center">
      <p className="text-[14px] text-white/60">{t("signInToContinue")}</p>
      <button
        type="button"
        onClick={openSignIn}
        className="text-ink cursor-pointer rounded-full bg-white px-6 py-2.5 text-[14px] font-semibold hover:opacity-90"
      >
        {t("signIn")}
      </button>
    </div>
  );
}
