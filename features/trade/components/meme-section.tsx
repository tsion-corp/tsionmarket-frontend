"use client";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { MemeModeSwitch, useMemeMode } from "@/features/trade/components/meme-mode";
import { MemeSimpleView } from "@/features/trade/components/meme-simple-view";
// Dynamic: the pro desk carries lightweight-charts and a data-table, and it
// only renders for someone who has flipped the mode switch. Statically
// imported it shipped in every dashboard payload, including the default
// simple view that draws no chart at all.
const MemeProView = dynamic(
  () => import("@/features/trade/components/meme-pro-view").then((m) => m.MemeProView),
  { ssr: false }
);

// Memecoin trading on Base: trending cards for the simple interface, the
// search/table/chart desk for pro. Both trade through the same sheet.
//
// Both interfaces are offered at every width; pro keeps its table here on a
// phone and moves the chart and the trade card into a full-screen sheet.
export function MemeSection() {
  const tSections = useTranslations("sections");
  const { mode } = useMemeMode();

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>{tSections("meme")}</Eyebrow>
        <MemeModeSwitch />
      </div>
      <div className="mt-4">{mode === "pro" ? <MemeProView /> : <MemeSimpleView />}</div>
    </div>
  );
}
