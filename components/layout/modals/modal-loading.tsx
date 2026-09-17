"use client";

import { useTranslations } from "next-intl";

// What a modal shows between the press and its code arriving.
//
// Every modal in app-modals.tsx is a next/dynamic import with ssr:false, so its
// chunk is fetched on the first press. ModalShell paints its backdrop as soon
// as `open` turns true, which meant the gap rendered as a blurred page with
// nothing on it: on a phone that is seconds, and it reads as a dead button
// rather than as loading.
//
// Three rows at the height the sheets actually open to, so the sheet does not
// snap open and then jump when the real content lands.
export function ModalLoading() {
  const t = useTranslations("common");

  return (
    <div role="status" aria-busy="true" aria-label={t("loading")} className="min-h-[220px]">
      <div className="h-7 w-2/5 animate-pulse rounded-lg bg-white/8" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-md bg-white/6" />
      <div className="mt-[18px] flex flex-col gap-2">
        <div className="h-[68px] animate-pulse rounded-[14px] bg-white/6" />
        <div className="h-[68px] animate-pulse rounded-[14px] bg-white/6" />
      </div>
    </div>
  );
}
