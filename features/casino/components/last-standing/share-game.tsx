"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { QrCode } from "@/components/ui/qr-code";
import { CANONICAL_SITE_URL, shareOrigin } from "@/lib/site-url";

// The origin is only knowable in the browser. Reading it during render makes the
// first client paint disagree with the server HTML, and setting it from an
// effect cascades a second render. useSyncExternalStore is the tool for a value
// that simply differs between server and client.
const NO_UPDATES = () => () => {};
const readShareOrigin = () => shareOrigin();
const serverShareOrigin = () => CANONICAL_SITE_URL;

// The canonical domain, never the deployment's own origin: a preview-URL
// invite dies (HTTP 402) the moment Vercel pauses that deployment.
function useOrigin(): string {
  return useSyncExternalStore(NO_UPDATES, readShareOrigin, serverShareOrigin);
}

// Sharing is the point of opening a game: the starter earns 10% of whatever the
// pot reaches, so every player they bring in pays them. The link is the game's
// own route, which means it works for someone who is not signed in yet.
//
// A card of its own, with the QR always showing: players asked for it after
// the link and code kept hiding behind a toggle under the stats. On a laptop it
// heads the side rail above the activity feed; on a phone it keeps its place
// under the game stats.
export function ShareGame({ gameId, className = "" }: { gameId: number; className?: string }) {
  const t = useTranslations("casino.lastStanding");

  const origin = useOrigin();
  const path = `/casino/last-standing/${gameId}`;
  const url = `${origin}${path}`;

  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(url);
    if (!ok) {
      toast.error(t("shareCopyFailed"));
      return false;
    }
    toast.success(t("shareCopied"));
    // The label confirms it in place, so the eye does not have to leave the
    // button to find out whether it worked.
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    return true;
  };

  const share = async () => {
    // The native sheet is what people actually expect on a phone, and it puts
    // the link straight into WhatsApp or wherever they organise the game. It
    // does not exist on desktop, so copying is the fallback rather than the
    // other way round.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: t("shareTitle"), text: t("shareText"), url });
        return;
      } catch {
        // Dismissed, or the browser refused. Copying still gets them the link.
      }
    }
    await copy();
  };

  return (
    <div className={`ws-glass rounded-[22px] p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-white/80">{t("shareHeading")}</span>
        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/40">
          {t("shareEarnTag")}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed font-normal text-white/55">
        {t("shareBody")}
      </p>

      {/* The code is the point of the card, so it is the biggest thing in it
          and never behind a toggle. */}
      <div className="mt-4 flex flex-col items-center gap-2.5 rounded-[16px] border border-white/6 bg-black/20 px-4 py-4 text-center">
        <QrCode value={url} size={164} />
        <div className="text-[12px] leading-5 text-white/55">{t("shareScan")}</div>
      </div>

      {/* The link itself copies, which is what people try first. */}
      <button
        type="button"
        onClick={() => void copy()}
        title={t("shareCopyCta")}
        className="tnum mt-3 block w-full cursor-pointer truncate rounded-[12px] border border-white/10 bg-black/25 px-3 py-2.5 text-left text-[12px] text-white/70 transition-colors hover:border-white/20 hover:text-white/90"
      >
        {url}
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="cursor-pointer rounded-[12px] border border-white/12 bg-white/6 px-4 py-2.5 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/12"
        >
          {copied ? t("shareCopied") : t("shareCopyLink")}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="text-ink cursor-pointer rounded-[12px] bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-opacity hover:opacity-90"
        >
          {t("shareCta")}
        </button>
      </div>
    </div>
  );
}

/**
 * The same link, as one button for the header row.
 *
 * The full invite block sits below the game stats, which on a laptop is under
 * the fold — a starter who never scrolls never finds the thing that earns them
 * their 10%. This puts it next to the timer and sound controls.
 */
export function ShareGameButton({ gameId }: { gameId: number }) {
  const t = useTranslations("casino.lastStanding");
  const origin = useOrigin();
  const url = `${origin}/casino/last-standing/${gameId}`;

  const onClick = async () => {
    if (!origin) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: t("shareTitle"), text: t("shareText"), url });
        return;
      } catch {
        // Dismissed or refused; fall through to copying.
      }
    }
    const ok = await copyText(url);
    if (ok) toast.success(t("shareCopied"));
    else toast.error(t("shareCopyFailed"));
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 text-[11.5px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {t("shareCta")}
    </button>
  );
}
