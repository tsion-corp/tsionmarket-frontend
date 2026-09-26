"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { openMigration } from "@/features/migrate/lib/migration-card-store";
import { Avatar } from "@/components/ui/avatar";
import { SquareAvatar } from "@/components/ui/square-avatar";
import { useSquareAvatar, useSquareSeed } from "@/hooks/use-square-avatar";
import { LanguageSelect } from "@/components/ui/language-select";
// Deep import: the @/features/migrate barrel re-exports UpdateBalanceButton,
// which mounts the whole Privy SDK. The row is light; the sheet it opens is
// deferred below.
import { MoveOldMoneyButton } from "@/features/migrate/components/move-old-money-entry";
import { WalletAddresses } from "@/components/layout/modals/wallet-addresses";
import { HelpIcon, LockIcon, PasskeyIcon, ShineIcon, SignOutIcon } from "@/components/ui/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDevicePasskey } from "@/hooks/use-device-passkey";
import { useUnlockPassword } from "@/hooks/use-unlock-password";

interface AccountModalProps {
  onClose: () => void;
  /** Opens the Shine sheet. Hosted by the shell, so it outlives this modal. */
  onOpenShine: () => void;
}

function InviteIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.5 19.5c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15.5 5.6a3.2 3.2 0 010 5.8M17.6 14.9c1.9.7 3.2 2.3 3.6 4.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AccountModal({ onClose, onOpenShine }: AccountModalProps) {
  const t = useTranslations("account");
  const tLanguage = useTranslations("language");
  const { profile, logout } = useAuthSession();
  const passkey = useDevicePasskey();
  const unlockPassword = useUnlockPassword();
  const router = useRouter();

  const signOut = async () => {
    await logout();
    router.push("/auth");
  };
  const squareAvatar = useSquareAvatar();
  const squareSeed = useSquareSeed();

  const item =
    "flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-3 font-sans text-[14.5px] font-medium hover:bg-white/8 transition-colors cursor-pointer w-full text-left";

  return (
    <div>
      <div className="flex items-center gap-[13px]">
        <SquareAvatar src={squareAvatar} seed={squareSeed} name={profile.name} size={46} />
        <div className="min-w-0" data-sensitive="other">
          <div className="ws-display truncate text-[21px]">{profile.name}</div>
          {profile.email ? (
            <div className="truncate text-[12.5px] font-normal text-white/50">{profile.email}</div>
          ) : null}
        </div>
      </div>

      {/* The addresses come FIRST of the sections: where the money is, is
          what a person opens the account screen to find out — settings are
          what they scroll past on the way. */}
      <WalletAddresses className="mt-[18px]" />

      {/* Language lives here on a phone, where the header has no room for it.
          The desktop header still carries its own picker. */}
      <div className="mt-4 flex items-center justify-between gap-3 md:hidden">
        <span className="text-[13.5px] font-normal text-white/60">{tLanguage("label")}</span>
        <LanguageSelect />
      </div>
      <div className="mt-[18px] flex flex-col gap-1.5">
        <Link href="/referrals" onClick={onClose} className={`${item} text-white`}>
          <span className="text-accent">
            <InviteIcon />
          </span>
          {t("inviteFriends")}
        </Link>
        <MoveOldMoneyButton onClick={() => openMigration("account_modal")} className={item} />
        {/* Only for a device that fell back to a PIN and could hold a passkey
            now. Hidden otherwise, so it is an answer to a problem the user has
            rather than a setting to wonder about. */}
        {passkey.canAdd ? (
          <button
            onClick={() =>
              void passkey
                .addPasskey()
                .then(() => toast.success(t("passkeyAdded")))
                .catch((err: unknown) => {
                  // Swallowing this is what made "add a passkey" look like it
                  // did nothing: the button ran, the call threw, and the user
                  // was told nothing at all. A dismissed prompt is a decision;
                  // everything else is worth saying.
                  const name = (err as { name?: string })?.name;
                  if (name === "NotAllowedError" || name === "UserCancelledError") return;
                  console.error("Adding a passkey failed:", err);
                  toast.error(t("addPasskeyFailed"));
                })
            }
            disabled={passkey.adding}
            className={`${item} text-white disabled:opacity-60`}
          >
            <PasskeyIcon size={20} />
            <span className="flex min-w-0 flex-col items-start">
              <span>{passkey.adding ? t("addingPasskey") : t("addPasskey")}</span>
              <span className="text-[11.5px] font-normal text-white/45">
                {passkey.needsReauth ? t("addPasskeyReauth") : t("addPasskeyHint")}
              </span>
            </span>
          </button>
        ) : null}
        {/* Offered only where a passkey isn't available, since a passkey is the
            better one-tap path. Without either, this is the only way to unlock
            without a full sign-in. */}
        {unlockPassword.canSet ? (
          <button
            onClick={() => void unlockPassword.setPassword().catch(() => {})}
            disabled={unlockPassword.saving}
            className={`${item} text-white disabled:opacity-60`}
          >
            <LockIcon size={20} />
            <span className="flex min-w-0 flex-col items-start">
              <span>
                {unlockPassword.isSet ? t("changeUnlockPassword") : t("setUnlockPassword")}
              </span>
              <span className="text-[11.5px] font-normal text-white/45">
                {t("setUnlockPasswordHint")}
              </span>
            </span>
          </button>
        ) : null}
        {/* Shine, the same single home the desktop account menu offers. The
            phone had no way to reach it at all. */}
        <button
          onClick={() => {
            onClose();
            onOpenShine();
          }}
          className={`${item} text-white`}
        >
          <ShineIcon size={20} />
          {t("shine")}
        </button>
        <button onClick={onClose} className={`${item} text-white`}>
          <HelpIcon size={20} />
          {t("helpSupport")}
        </button>
        <button onClick={signOut} className={`${item} text-down`}>
          <SignOutIcon size={20} />
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}
