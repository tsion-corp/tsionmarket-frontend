"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSocialAuth, useSocialWallet } from "decane-connect-kit";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Avatar } from "@/components/ui/avatar";
import { SquareAvatar } from "@/components/ui/square-avatar";
import { useSquareAvatar, useSquareSeed } from "@/hooks/use-square-avatar";
import Link from "next/link";
// Deep import: the @/features/migrate barrel re-exports UpdateBalanceButton,
// which mounts the whole Privy SDK. The row itself is light; the sheet is not,
// so only the sheet is deferred — and this popover is mounted on every route.
import { MoveOldMoneyButton } from "@/features/migrate/components/move-old-money-entry";
import { HelpIcon, SignOutIcon } from "@/components/ui/icons";
import { openSupportChat } from "@/lib/support-chat/open";
import { toast } from "@/lib/toast";
import { openMigration } from "@/features/migrate/lib/migration-card-store";

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
  const { profile, logout: sessionLogout } = useAuthSession();
  const { canUsePasskey } = useSocialAuth();
  const { addPasskey } = useSocialWallet();
  const router = useRouter();
  const reduce = useReducedMotion();

  const logout = async () => {
    await sessionLogout();
    router.push("/auth");
  };

  // Privy's useLinkWithPasskey → the kit's addPasskey (Promise, throws on error).
  const linkWithPasskey = async () => {
    try {
      await addPasskey();
      toast.success(t("passkeyAdded"));
    } catch (err) {
      console.error("Passkey linking failed:", err);
      toast.error(t("passkeyFailed"));
    }
  };

  const hasPasskey = canUsePasskey;
  const squareAvatar = useSquareAvatar();
  const squareSeed = useSquareSeed();

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

  const itemClass =
    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-white/85 hover:bg-white/6 hover:text-white transition-colors cursor-pointer w-full text-left";

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={popoverRef}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            role="menu"
            aria-label={t("title")}
            className="absolute bottom-[calc(100%+8px)] left-0 z-[120] w-full rounded-2xl border border-white/12 bg-[#121214] p-3 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl md:bottom-0 md:left-[calc(100%+12px)] md:w-[280px]"
          >
            {/* User Identity Header */}
            <div className="flex items-center gap-2.5 px-1 pb-2">
              <SquareAvatar src={squareAvatar} seed={squareSeed} name={profile.name} size={36} />
              <div className="min-w-0 flex-1" data-sensitive="other">
                <div className="truncate text-[13.5px] font-medium text-white">{profile.name}</div>
                <div className="truncate text-[11.5px] font-normal text-white/50">
                  {profile.email}
                </div>
              </div>
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

              {/* A route now, not a sheet: the referral network is something
                  people come back to, and a link to it can be shared. */}
              <Link href="/referrals" role="menuitem" onClick={onClose} className={itemClass}>
                <span className="text-accent">
                  <InviteIcon />
                </span>
                <span>{t("inviteFriends")}</span>
              </Link>

              {/* The always-available door into the migration. Mirrors the
                  phone Account modal, so a desktop user reaches the sweep from
                  the same place. Only the row lives here — the sheet is a
                  sibling below, for the reason given there. */}
              <MoveOldMoneyButton
                onClick={() => openMigration("account_modal")}
                className={itemClass}
              />

              {/* The in-app chat, not a form in a new tab: support is a
                  conversation the shell already carries. */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  openSupportChat();
                }}
                className={itemClass}
              >
                <HelpIcon size={18} />
                <span>{t("helpSupport")}</span>
              </button>

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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
