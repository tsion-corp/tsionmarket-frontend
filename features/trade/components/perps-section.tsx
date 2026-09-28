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
  /**
   * Whether this section draws its own "Leverage Trading" eyebrow.
   *
   * False where the page already names itself. The `/perps` route puts the
   * title on the header row beside the hamburger, where it is larger and costs
   * no vertical space of its own; a second, smaller copy of the same word
   * directly beneath it was the top of that screen saying its own name twice.
   *
   * Turning it off also drops the section's TOP padding, because that padding
   * existed to frame the eyebrow. The caller that owns the header owns the gap
   * under it too, so the space is spent in one place instead of two.
   */
  heading?: boolean;
}

export function PerpsSection({ gutter = true, heading = true }: PerpsSectionProps = {}) {
  const tSections = useTranslations("sections");
  // Spelled out as two whole sets rather than a `pt-0` override: `lg:py-8` sits
  // inside a media query, so an unprefixed `pt-0` after it would lose at that
  // width and the padding would come back on exactly the screens this is meant
  // to reclaim space on.
  const vertical = heading ? "py-4 sm:py-6 lg:py-8" : "pb-4 sm:pb-6 lg:pb-8";
  return (
    <div
      className={`mx-auto w-full max-w-[1920px] ${vertical} sm:px-6 lg:px-8 ${
        gutter ? "px-4" : "px-0"
      }`}
    >
      {heading ? <Eyebrow>{tSections("perps")}</Eyebrow> : null}
      <div className={heading ? "mt-4" : undefined}>
        <PerpsView />
      </div>
    </div>
  );
}
