"use client";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PerpsView } from "@/features/trade/components/perps-view";

// Perpetuals as its own sidebar section: an eyebrow over the perps desk. Spot
// lives in its own section now.
//
// There is one perps interface. The simple/pro switch that used to sit in this
// header was removed, so the desk below is the same at every width: two columns
// from 1080px, and a single stacked, scrolling column under it.
interface PerpsSectionProps {
  /**
   * Whether this section draws its own side gutter.
   *
   * False where a page already provides one. The phone Market view puts this
   * desk inside its own px-5 scroller, so the default px-4 was a second gutter
   * on top of the first: 36px a side gone before the desk's own panel padding,
   * out of a 390px screen, which is what clipped the order ticket's Market
   * toggle off the edge. The vertical padding is unchanged either way.
   */
  gutter?: boolean;
}

export function PerpsSection({ gutter = true }: PerpsSectionProps = {}) {
  const tSections = useTranslations("sections");
  return (
    <div
      className={`mx-auto w-full max-w-[1920px] py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 ${
        gutter ? "px-4" : "px-0"
      }`}
    >
      <Eyebrow>{tSections("perps")}</Eyebrow>
      <div className="mt-4">
        <PerpsView />
      </div>
    </div>
  );
}
