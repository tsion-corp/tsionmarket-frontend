"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { useShareLink } from "@/hooks/use-share-link";

/**
 * Shares the page it sits on, with the sharer's referral code on the link.
 *
 * The native sheet where there is one, the clipboard everywhere else. It reads
 * the address at click time rather than at render, so it is correct on a route
 * that changed under it, and it strips any query the current page happens to
 * carry: a share is a link to the thing, not to whatever state the sharer's own
 * session left in the bar.
 */
export function ShareLinkButton({
  title,
  className,
  label,
}: {
  /** What the native sheet announces. Falls back to the document title. */
  title?: string;
  className?: string;
  /** Visible text. Omit for an icon-only button. */
  label?: string;
}) {
  const t = useTranslations("common");
  const shareLink = useShareLink();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (typeof window === "undefined") return;
    const url = shareLink(`${window.location.origin}${window.location.pathname}`);

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: title ?? document.title, url });
        return;
      } catch {
        // Dismissed, or refused. Copying still gets them the link.
      }
    }
    if (!(await copyText(url))) {
      toast.error(t("copyFailed"));
      return;
    }
    toast.success(t("linkCopied"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={label ? undefined : t("share")}
      className={
        className ??
        "ws-pressable inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/12"
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
        <path d="M13 3.83 8.7 8.13 7.3 6.7 14 0v0l6.7 6.7-1.4 1.43L15 3.83V15h-2V3.83ZM4 10h5v2H6v8h12v-8h-3v-2h5v12H4V10Z" />
      </svg>
      {label ? <span>{copied ? t("copied") : label}</span> : null}
    </button>
  );
}
