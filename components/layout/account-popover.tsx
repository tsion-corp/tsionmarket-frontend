"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLinkWithPasskey, useLogout, usePrivy } from "@privy-io/react-auth";
import { Avatar } from "@/components/ui/avatar";
import { InviteFriendsModal } from "@/features/referrals";
import { HelpIcon, SignOutIcon } from "@/components/ui/icons";
import { deriveProfile } from "@/lib/user";
import { WalletAddresses } from "@/components/layout/modals/wallet-addresses";
import { toast } from "@/lib/toast";

const SUPPORT_FORM_URL = "https://forms.gle/T5DLdFCAbRsVrzU97";

interface AccountPopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

function PasskeyIcon({ size = 18 }: { size?: number }) {
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

function InviteIcon({ size = 18 }: { size?: number }) {
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

export function AccountPopover({ open, onClose, triggerRef }: AccountPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("account");
  const [inviteOpen, setInviteOpen] = useState(false);
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
  const hasPasskey = user?.linkedAccounts?.some((a) => a.type === "passkey") ?? false;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      // Ignore clicks inside the popover or on the trigger button
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const itemClass =
    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-white/85 hover:bg-white/6 hover:text-white transition-colors cursor-pointer w-full text-left";

  return (
    <>
      <div
        ref={popoverRef}
        role="menu"
        aria-label={t("title")}
        className="absolute bottom-[calc(100%+8px)] left-0 z-[120] w-full rounded-2xl border border-white/12 bg-[#121214] p-3 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl md:bottom-0 md:left-[calc(100%+12px)] md:w-[280px]"
      >
        {/* User Identity Header */}
        <div className="flex items-center gap-2.5 px-1 pb-2">
          <Avatar seed={profile.avatarSeed} size={36} />
          <div className="min-w-0 flex-1" data-sensitive="other">
            <div className="truncate text-[13.5px] font-medium text-white">{profile.name}</div>
            <div className="truncate text-[11.5px] font-normal text-white/50">{profile.email}</div>
          </div>
        </div>

        {/* Wallets */}
        <div className="border-t border-white/8 pt-2">
          <WalletAddresses user={user ?? null} />
        </div>

        {/* Quick Actions */}
        <div className="mt-2.5 flex flex-col gap-1 border-t border-white/8 pt-2">
          {!hasPasskey ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                linkWithPasskey();
                onClose();
              }}
              className={itemClass}
            >
              <span className="text-accent">
                <PasskeyIcon />
              </span>
              <span>{t("addPasskey")}</span>
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setInviteOpen(true);
            }}
            className={itemClass}
          >
            <span className="text-accent">
              <InviteIcon />
            </span>
            <span>{t("inviteFriends")}</span>
          </button>

          <a
            href={SUPPORT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={onClose}
            className={itemClass}
          >
            <HelpIcon size={18} />
            <span>{t("helpSupport")}</span>
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              logout();
              onClose();
            }}
            className="text-down hover:bg-down/10 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
          >
            <SignOutIcon size={18} />
            <span>{t("signOut")}</span>
          </button>
        </div>
      </div>

      <InviteFriendsModal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          onClose();
        }}
      />
    </>
  );
}
