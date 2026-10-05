"use client";

import { useTranslations } from "next-intl";
import { openSignIn } from "@/hooks/use-sign-in";

// Sits where the account button goes while signed out.
export function SignInButton({ variant }: { variant: "rail" | "topbar" }) {
  const t = useTranslations("auth");
  const shape =
    variant === "rail"
      ? "w-full justify-center rounded-xl px-3 py-3 text-[14px]"
      : "rounded-full px-4 py-2 text-[13.5px] md:hidden";
  return (
    <button
      type="button"
      data-tour="profile"
      onClick={openSignIn}
      className={`ws-pressable flex cursor-pointer items-center gap-2 bg-white font-sans font-semibold text-black transition-colors hover:bg-white/90 ${shape}`}
    >
      {t("signIn")}
    </button>
  );
}
