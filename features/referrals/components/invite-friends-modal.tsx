"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useReferralStats,
  useSetUsername,
  useUsernameAvailability,
} from "@/features/referrals/hooks/use-referrals";
import {
  displayLink,
  inviteLink,
  referralProgress,
  sanitizeUsernameInput,
  usernameProblem,
} from "@/features/referrals/lib/referrals";

// The Invite Friends screen, built to the designer's comp: the three mascots
// with sparkles, "Let's grow together!", the invite link with Copy, a progress
// card counting referrals, "How it works?", and a chrome Invite and Earn
// button. Before any of that can exist the user needs a username, since the
// username IS the invite code, so a first visit shows the claim step instead.
//
// Portaled to <body>: this opens from inside the account modal, whose animated
// panel carries a transform, and a transformed ancestor would trap our fixed
// overlay inside it.

const MASCOTS = "/referral/mascots.png";

// Server and client disagree on window.location until hydration, so the origin
// is read as an external store the same way the casino share card does it.
const NO_UPDATES = () => () => {};
const readOrigin = () => window.location.origin;
const noOrigin = () => "";

function useOrigin(): string {
  return useSyncExternalStore(NO_UPDATES, readOrigin, noOrigin);
}

// Each star blinks like the designer's Figma: same keyframe, staggered starts.
function Sparkle({ className = "", delay = "0s" }: { className?: string; delay?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`ws-twinkle ${className}`}
      style={{ animationDelay: delay }}
    >
      <path d="M12 0c1 6.9 5.1 11 12 12-6.9 1-11 5.1-12 12-1-6.9-5.1-11-12-12C6.9 11 11 6.9 12 0Z" />
    </svg>
  );
}

function LinkIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M10.6 13.4a4 4 0 0 0 5.65 0l3.2-3.2a4 4 0 1 0-5.66-5.65l-1.6 1.6M13.4 10.6a4 4 0 0 0-5.65 0l-3.2 3.2a4 4 0 1 0 5.66 5.65l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MascotHero() {
  return (
    <div className="relative mx-auto mt-4 w-[min(290px,82%)]">
      {/* Faded at the bottom so the artwork's cropped shadow melts into the
          sheet instead of ending on a hard edge. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MASCOTS}
        alt=""
        width={1000}
        height={487}
        className="w-full [mask-image:linear-gradient(to_bottom,black_72%,transparent_98%)]"
      />
      <Sparkle className="absolute -top-1 -right-4 h-6 w-6 text-white" />
      <Sparkle delay="1.2s" className="absolute top-7 -right-7 h-3 w-3 text-white/70" />
      <Sparkle delay="0.6s" className="absolute -bottom-1 -left-6 h-5 w-5 text-white/90" />
      <Sparkle delay="1.7s" className="absolute bottom-8 -left-3 h-3 w-3 text-white/60" />
    </div>
  );
}

function Spinner() {
  return (
    <div className="grid h-48 place-items-center">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
    </div>
  );
}

// The main screen once a username exists.
function InviteScreen({
  username,
  referred,
  pending,
}: {
  username: string;
  referred: number;
  pending: number;
}) {
  const t = useTranslations("referral");
  const origin = useOrigin();
  const url = inviteLink(origin || "https://tsionark.com", username);

  const [copied, setCopied] = useState(false);

  // Rolling milestone, never capped: the total on the left of the slash is
  // the real count, the right is the next multiple of ten, and the bar fills
  // across the current lap of ten.
  const { goal, pct } = referralProgress(referred);

  const copy = async () => {
    const ok = await copyText(url);
    if (!ok) {
      toast.error(t("copyFailed"));
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: t("shareTitle"), text: t("shareText"), url });
        return;
      } catch {
        // Dismissed or refused; copying still gets them the link.
      }
    }
    await copy();
  };

  return (
    <>
      <MascotHero />
      <h2 className="ws-display mt-4 text-center text-[25px]">{t("headline")}</h2>
      <p className="mx-auto mt-1.5 max-w-[300px] text-center text-[13.5px] leading-[1.5] font-normal text-white/55">
        {t("sub")}
      </p>

      <div className="mt-5 flex items-center gap-2.5 rounded-full border border-white/12 bg-white/5 py-1.5 pr-1.5 pl-4">
        <LinkIcon className="shrink-0 text-white/45" />
        <span className="tnum min-w-0 flex-1 truncate text-[13.5px] font-normal text-white/75">
          {displayLink(url)}
        </span>
        <button
          onClick={() => void copy()}
          className="text-ink shrink-0 cursor-pointer rounded-full bg-white px-4 py-2 font-sans text-[13px] font-semibold hover:opacity-90"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>

      <div className="ws-glass mt-4 rounded-[18px] p-4">
        <div className="text-[15px] font-semibold text-white">{t("progress")}</div>
        <div className="mt-3">
          <ProgressBar pct={pct} />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[13px]">
          <span className="font-normal text-white/50">{t("referralsLabel")}</span>
          <span className="tnum font-medium text-white">
            {referred}/{goal}
          </span>
        </div>
        {pending > 0 ? (
          <p className="mt-1.5 text-[12px] font-normal text-white/45">
            {t("pendingNote", { count: pending })}
          </p>
        ) : null}
      </div>

      <div className="ws-glass mt-3 rounded-[18px] p-4">
        <div className="text-[15px] font-semibold text-white">{t("howTitle")}</div>
        <p className="mt-1.5 text-[13px] leading-[1.55] font-normal text-white/60">
          {t("howBody")}
        </p>
      </div>

      <button
        onClick={() => void share()}
        className="ws-chrome text-ink mt-5 w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        {t("cta")}
      </button>
    </>
  );
}

// First visit: pick the username that becomes the invite link. Set once,
// permanent, so the feedback has to be unmistakable before the button enables.
function ClaimScreen() {
  const t = useTranslations("referral");
  const origin = useOrigin();
  const [name, setName] = useState("");
  const debounced = useDebouncedValue(name, 350);

  const problem = name ? usernameProblem(name) : null;
  const availability = useUsernameAvailability(problem === null ? debounced : "");
  const setUsername = useSetUsername();

  const settled = name === debounced && !availability.isFetching;
  const available = settled && availability.data?.username === name && availability.data.available;
  const taken = settled && availability.data?.username === name && !availability.data.available;
  const canClaim = Boolean(name) && problem === null && available && !setUsername.isPending;

  let feedback: { text: string; tone: string } | null = null;
  if (name && problem) feedback = { text: t("invalidFormat"), tone: "text-down" };
  else if (name && !settled) feedback = { text: t("checking"), tone: "text-white/45" };
  else if (available) feedback = { text: t("available"), tone: "text-up" };
  else if (taken) feedback = { text: t("taken"), tone: "text-down" };
  else if (name && availability.isError) feedback = { text: t("loadFailed"), tone: "text-down" };

  const claim = () => {
    if (!canClaim) return;
    setUsername.mutate(name, {
      onError: () => toast.error(t("claimFailed")),
    });
  };

  return (
    <>
      <MascotHero />
      <h2 className="ws-display mt-4 text-center text-[23px]">{t("claimTitle")}</h2>
      <p className="mx-auto mt-1.5 max-w-[310px] text-center text-[13.5px] leading-[1.5] font-normal text-white/55">
        {t("claimSub")}
      </p>

      <label className="focus-within:border-accent/45 mt-5 flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-4 py-3 transition-colors">
        <span className="text-[14.5px] font-normal text-white/40">@</span>
        <input
          value={name}
          onChange={(e) => setName(sanitizeUsernameInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") claim();
          }}
          placeholder={t("placeholder")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-transparent font-sans text-[15px] text-white outline-none placeholder:text-white/30"
        />
      </label>
      <div className="mt-2 min-h-[18px] px-4 text-[12.5px] font-normal">
        {feedback ? <span className={feedback.tone}>{feedback.text}</span> : null}
      </div>
      <p className="tnum truncate px-4 text-[12.5px] font-normal text-white/40">
        {displayLink(inviteLink(origin || "https://tsionark.com", name || t("placeholder")))}
      </p>

      <button
        onClick={claim}
        disabled={!canClaim}
        className="ws-chrome text-ink mt-5 w-full cursor-pointer rounded-full bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-default disabled:opacity-40"
      >
        {setUsername.isPending ? t("checking") : t("claimCta")}
      </button>
    </>
  );
}

export function InviteFriendsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("referral");
  const reduce = useReducedMotion();
  const stats = useReferralStats(open);

  // Portals need a document; render nothing during SSR.
  const mounted = useSyncExternalStore(
    NO_UPDATES,
    () => true,
    () => false
  );
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label={t("title")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[440] cursor-default bg-black/70 backdrop-blur-[7px]"
          />
          <div className="pointer-events-none fixed inset-0 z-[441] flex items-end justify-center md:items-center md:p-6">
            <motion.div
              initial={reduce ? { opacity: 0 } : { y: "100%" }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={
                reduce
                  ? { duration: 0.15 }
                  : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
              }
              className="bg-sheet ws-no-scrollbar pointer-events-auto max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] border border-white/14 px-[26px] pt-4 pb-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_-20px_90px_-30px_rgba(0,0,0,0.9)] md:w-[min(440px,100%)] md:rounded-[24px] md:pt-[22px]"
            >
              <span
                aria-hidden
                className="mx-auto mb-4 block h-1 w-9 rounded-full bg-white/20 md:hidden"
              />
              <div className="relative flex items-center justify-center">
                <span className="ws-display text-[17px]">{t("title")}</span>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="absolute right-0 grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
                >
                  <CloseIcon />
                </button>
              </div>

              {stats.isPending ? (
                <Spinner />
              ) : stats.isError || !stats.data ? (
                <div className="py-14 text-center">
                  <p className="text-[13.5px] font-normal text-white/55">{t("loadFailed")}</p>
                  <button
                    onClick={() => void stats.refetch()}
                    className="mt-4 cursor-pointer rounded-full border border-white/14 bg-white/6 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-white/10"
                  >
                    {t("retry")}
                  </button>
                </div>
              ) : stats.data.username ? (
                <InviteScreen
                  username={stats.data.username}
                  referred={stats.data.referred}
                  pending={stats.data.pending}
                />
              ) : (
                <ClaimScreen />
              )}
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
