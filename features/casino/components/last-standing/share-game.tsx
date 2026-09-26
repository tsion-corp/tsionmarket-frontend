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

/**
 * A game's invite link, and the two ways to pass it on.
 *
 * Two surfaces send the same link: the card below and the rail's invite card on
 * the game screen. The origin, the toasts and the native-sheet fallback belong
 * in one place, or they drift apart.
 */
export function useGameShare(gameId: number) {
  const t = useTranslations("casino.lastStanding");
  const origin = useOrigin();
  const url = `${origin}/casino/last-standing/${gameId}`;
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

  return { url, copied, copy, share };
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
  const { url, copied, copy, share } = useGameShare(gameId);

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

// The header's own Share button lived here. It is gone: the game screen's rail
// carries an invite card with the same link, and two Shares on one screen is
// the same offer twice. `useGameShare` above is what that card uses.
