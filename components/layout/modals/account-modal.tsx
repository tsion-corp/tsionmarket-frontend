"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLinkWithPasskey, useLogout, usePrivy } from "@privy-io/react-auth";
import { Avatar } from "@/components/ui/avatar";
import { LanguageSelect } from "@/components/ui/language-select";
import { WalletList } from "@/features/portfolio";
import { HelpIcon, SignOutIcon } from "@/components/ui/icons";
import { deriveProfile } from "@/lib/user";
import { toast } from "@/lib/toast";

interface AccountModalProps {
  onClose: () => void;
}

function PasskeyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 11a4 4 0 100-8 4 4 0 000 8Zm-7 9c0-3.3 3.1-6 7-6 .7 0 1.4.1 2 .3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="15.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M17.5 18v3.5l1.5-1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountModal({ onClose }: AccountModalProps) {
  const t = useTranslations("account");
  const tLanguage = useTranslations("language");
  const { user } = usePrivy();
  const router = useRouter();
  const { logout } = useLogout({
    onSuccess: () => router.push("/auth"),
  });
  const { linkWithPasskey } = useLinkWithPasskey({
    onSuccess: () => {
      toast.success(t("passkeyAdded"));
    },
    onError: (err) => {
      console.error("Passkey linking failed:", err);
      toast.error(t("passkeyFailed"));
    },
  });
  const profile = deriveProfile(user);
  const hasPasskey = user?.linkedAccounts.some((a) => a.type === "passkey") ?? false;

  const item =
    "flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-3 font-sans text-[14.5px] font-medium hover:bg-white/8 transition-colors cursor-pointer w-full text-left";

  return (
    <div>
      <div className="flex items-center gap-[13px]">
        <Avatar seed={profile.avatarSeed} size={46} />
        <div className="min-w-0">
          <div className="ws-display truncate text-[21px]">{profile.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">{profile.email}</div>
        </div>
      </div>
      {/* Language lives here on a phone, where the header has no room for it.
          The desktop header still carries its own picker. */}
      <div className="mt-4 flex items-center justify-between gap-3 md:hidden">
        <span className="text-[13.5px] font-normal text-white/60">{tLanguage("label")}</span>
        <LanguageSelect />
      </div>
      <WalletList user={user} />
      <div className="mt-[18px] flex flex-col gap-1.5">
        {!hasPasskey ? (
          <button onClick={() => linkWithPasskey()} className={`${item} text-white`}>
            <span className="text-accent">
              <PasskeyIcon />
            </span>
            {t("addPasskey")}
          </button>
        ) : null}
        <button onClick={onClose} className={`${item} text-white`}>
          <HelpIcon size={20} />
          {t("helpSupport")}
        </button>
        <button onClick={() => logout()} className={`${item} text-down`}>
          <SignOutIcon size={20} />
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}
