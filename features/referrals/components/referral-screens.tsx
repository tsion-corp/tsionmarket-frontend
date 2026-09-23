"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { InfoIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSetUsername, useUsernameAvailability } from "@/features/referrals/hooks/use-referrals";
import {
  displayLink,
  inviteLink,
  referralProgress,
  sanitizeUsernameInput,
  usernameProblem,
  type ReferralEntry,
} from "@/features/referrals/lib/referrals";
import { ReferralListCard } from "@/features/referrals/components/referral-list-card";
import { NetworkPanel } from "@/features/referrals/components/network-panel";
import { useReferralNetwork } from "@/features/referrals/hooks/use-referral-network";
import {
  ReferralCard,
  ReferralCardBody,
  ReferralCardTitle,
} from "@/features/referrals/components/referral-card";
import { CANONICAL_SITE_URL, shareOrigin } from "@/lib/site-url";

// The referral screen: the three mascots with sparkles, "Let's grow together!",
// the invite link with Copy, a progress card, the eligibility rule, how it
// works, the people invited, and the reader's own network by generation.
//
// This was a modal reached from the account menu. It is a route now: the
// network view is something people come back to and read, which is a page's
// job, and a link to it survives being shared or bookmarked.

const MASCOTS = "/referral/mascots.png";

// The share origin is the CANONICAL domain, never window.location.origin: a
// link built from a Vercel preview deployment's URL breaks for everyone once
// that deployment is paused (HTTP 402). Read through an external store so the
// server render (canonical) and the client agree without a hydration flash.
const NO_UPDATES = () => () => {};
const readShareOrigin = () => shareOrigin();
const serverShareOrigin = () => CANONICAL_SITE_URL;

function useOrigin(): string {
  return useSyncExternalStore(NO_UPDATES, readShareOrigin, serverShareOrigin);
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

function MascotHero({ className = "mx-auto mt-4 w-[min(290px,82%)]" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
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

/**
 * One figure on the stat strip.
 *
 * The strip is the thing a page can do that a 520px sheet could not: state
 * where this person stands in one line, before any of the detail. The figures
 * are not new — two came from the progress card and two from inside the
 * network panel, where they were three scrolls apart.
 */
function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={
        "rounded-[16.54px] border-[0.75px] px-4 py-3.5 " +
        (accent ? "border-accent/30 bg-accent/[0.07]" : "border-black/7 bg-[#3C3C3C]/21")
      }
    >
      <div
        className={
          "tnum text-[22px] leading-none font-semibold lg:text-[26px] " +
          (accent ? "text-accent" : "text-white")
        }
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] leading-[1.35] font-normal text-white/50">{label}</div>
    </div>
  );
}

// The main screen once a username exists.
function InviteScreen({
  username,
  referred,
  pending,
  referrals,
}: {
  username: string;
  referred: number;
  pending: number;
  referrals?: ReferralEntry[];
}) {
  // Only fetched once a username exists: without one there is no link, so
  // there is nothing under this person yet to read.
  const { network, loading: networkLoading } = useReferralNetwork(true);
  const t = useTranslations("referral");
  const origin = useOrigin();
  const url = inviteLink(origin, username);

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
    // One column on a phone, two from lg up.
    //
    // The hero carries the whole action — who this is for, the link, the share
    // and how far along they are — because those four things are one thought
    // and they were spread over a 520px scroll before. What is left is
    // reference (the two rules) and record (who joined, the network), so the
    // rules go in a sticky rail and the lists take the wide column, which is
    // the only part of this page long enough to scroll.
    <div className="flex flex-col gap-4 lg:gap-5">
      <section className="relative overflow-hidden rounded-[22px] border-[0.75px] border-white/8 bg-[#3C3C3C]/21 p-5 sm:p-6 lg:p-9">
        {/* A single soft light behind the mascots, so the band reads as one
            object at 1100px instead of a flat slab with a picture on it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-white/[0.06] blur-3xl"
        />

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:items-center lg:gap-12">
          <MascotHero className="mx-auto w-[min(260px,72%)] lg:mx-0 lg:w-full" />

          <div className="min-w-0">
            <h2 className="ws-display text-center text-[25px] lg:text-left lg:text-[34px] lg:leading-[1.12]">
              {t("headline")}
            </h2>
            <p className="mx-auto mt-1.5 max-w-[300px] text-center text-[13.5px] leading-[1.5] font-normal text-white/55 lg:mx-0 lg:mt-3 lg:max-w-[440px] lg:text-left lg:text-[14.5px]">
              {t("sub")}
            </p>

            {/* The link and the share sit together: they are the page's one
                action, and they were at opposite ends of a scroll before. */}
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center lg:mt-6">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-white/12 bg-white/5 py-1.5 pr-1.5 pl-4">
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

              <button
                onClick={() => void share()}
                className="shrink-0 cursor-pointer rounded-full border border-white/14 bg-white/6 px-6 py-3 font-sans text-[14px] font-semibold text-white transition-colors hover:bg-white/10 sm:py-2.5"
              >
                {t("cta")}
              </button>
            </div>

            {/* Progress belongs beside the link rather than in a card further
                down: it is the answer to "did that work", and a rail is where
                things you consult live, not things you check. */}
            <div className="mt-6 border-t border-white/8 pt-4 lg:mt-7">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-normal text-white/50">{t("referralsLabel")}</span>
                <span className="tnum font-medium text-white">
                  {referred}/{goal}
                </span>
              </div>
              <div className="mt-2.5">
                <ProgressBar pct={pct} />
              </div>
              {pending > 0 ? (
                <p className="mt-2 text-[12px] font-normal text-white/45">
                  {t("pendingNote", { count: pending })}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Two figures always, four once there is a network below this person.
          Two columns on a phone so the tiles stay readable rather than
          shrinking to fit four across a 360px screen. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("referralsLabel")} value={referred} />
        <StatTile label={t("depositPending")} value={pending} />
        {network ? (
          <>
            <StatTile label={t("networkTotal")} value={network.downline.total} />
            <StatTile label={t("networkCounted")} value={network.downline.counted} accent />
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start lg:gap-5">
        {/* The rules come FIRST in the document, so a phone still reads hero,
            eligibility, how it works, then the lists — the order the sheet
            had. On a wide viewport they move to the rail. */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:order-2">
          {/* The comp puts eligibility ahead of how-it-works, and marks it with
              a red info glyph: it states the rule that decides whether a
              referral pays out at all, so it is a warning, not a description. */}
          <ReferralCard>
            <ReferralCardTitle icon={<InfoIcon size={16} className="shrink-0 text-[#FF0909]" />}>
              {t("eligibilityTitle")}
            </ReferralCardTitle>
            <ReferralCardBody>{t("eligibilityBody")}</ReferralCardBody>
          </ReferralCard>

          <ReferralCard>
            <ReferralCardTitle>{t("howTitle")}</ReferralCardTitle>
            <ReferralCardBody>{t("howBody")}</ReferralCardBody>
          </ReferralCard>
        </aside>

        <div className="flex min-w-0 flex-col gap-3 lg:order-1">
          <ReferralListCard referrals={referrals} referred={referred} pending={pending} />
          <NetworkPanel network={network} loading={networkLoading} />
        </div>
      </div>
    </div>
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
        {displayLink(inviteLink(origin, name || t("placeholder")))}
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

export { InviteScreen, ClaimScreen, Spinner };
