"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QrCode } from "@/components/ui/qr-code";
import { toast } from "@/lib/toast";

import { SHARE_IMAGE_SIZE, drawShareImage } from "@/features/casino/lib/last-standing/share-image";

interface GameShareCardProps {
  gameId: number;
  url: string;
  /** The starter's own name for the game, when they gave it one. */
  title?: string;
  description?: string;
  /** The stake, already formatted, shown under the code. */
  stakeLabel?: string;
  isPrivate: boolean;
  onOpen: () => void;
}

/**
 * The card handed over after a game is opened: the link, and the code someone
 * points a phone at.
 *
 * Built to be scanned off a screen at a stand, so the code is the largest
 * thing on it and keeps its white quiet zone.
 */
export function GameShareCard({
  gameId,
  url,
  title,
  description,
  stakeLabel,
  isPrivate,
  onOpen,
}: GameShareCardProps) {
  const t = useTranslations("casino.lastStanding");
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const name = title?.trim() ?? "";
  const blurb = description?.trim() ?? "";

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("shareCopyFailed"));
    }
  }, [url, t]);

  // The QR renders as SVG. Painting it onto a card through a canvas is what
  // turns it into something that explains itself wherever it is shared.
  const download = useCallback(() => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = SHARE_IMAGE_SIZE;
      canvas.height = SHARE_IMAGE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawShareImage(ctx, image, {
        eyebrow: t("eyebrow"),
        title: t("title"),
        game: name === "" ? t("shareTitle", { gameId }) : name,
        ...(blurb === "" ? {} : { description: blurb }),
        stake: stakeLabel ?? "",
        scan: t("shareScan"),
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `last-man-${gameId}.png`;
      link.click();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast.error(t("shareDownloadFailed"));
    };
    image.src = objectUrl;
  }, [gameId, t, stakeLabel, name, blurb]);

  const action =
    "flex-1 cursor-pointer rounded-[12px] border border-white/12 bg-white/[0.06] px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.12]";

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent px-4 py-5 sm:px-5">
      <div
        aria-hidden
        className="bg-accent/20 pointer-events-none absolute -top-20 -right-12 h-44 w-44 rounded-full blur-[80px]"
      />

      <div className="relative flex flex-col items-center text-center">
        <span
          className={
            "rounded-full px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.06em] uppercase " +
            (isPrivate
              ? "border border-white/15 bg-white/[0.06] text-white/70"
              : "bg-accent/15 text-accent")
          }
        >
          {isPrivate ? t("visibilityPrivate") : t("visibilityPublic")}
        </span>

        <h3 className="ws-display mt-2.5 text-[19px] tracking-[-0.01em]">
          {name === "" ? t("shareTitle", { gameId }) : name}
        </h3>
        <p className="mt-1 max-w-[34ch] text-[12.5px] leading-[1.5] font-normal text-white/55">
          {blurb === "" ? (isPrivate ? t("shareBodyPrivate") : t("shareBodyPublic")) : blurb}
        </p>

        <div ref={qrRef} className="mt-4">
          <QrCode value={url} size={184} />
        </div>

        {stakeLabel ? (
          <p className="tnum mt-3 text-[13px] font-semibold text-white">{stakeLabel}</p>
        ) : null}

        {/* The link in full, so someone reading over a shoulder can type it. */}
        <p className="mt-3 w-full truncate rounded-[10px] border border-white/8 bg-black/30 px-3 py-2 text-[11.5px] font-normal text-white/50">
          {url}
        </p>

        <div className="mt-3 flex w-full gap-2">
          <button type="button" onClick={() => void copy()} className={action}>
            {copied ? t("shareCopied") : t("shareCopy")}
          </button>
          <button type="button" onClick={download} className={action}>
            {t("shareDownload")}
          </button>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="bg-accent mt-2.5 w-full cursor-pointer rounded-[12px] py-3 text-[14px] font-semibold text-black"
        >
          {t("shareOpen")}
        </button>
      </div>
    </div>
  );
}
