import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Prediction } from "@/lib/types";

interface PredictionCardProps {
  prediction: Prediction;
  onBuy: (yes: boolean) => void;
  /**
   * Where the market's detail page lives. The card is presentational and holds
   * no identifiers of its own, so the route comes from the caller. Omitted, the
   * question renders as plain text and the card is display-only, which is what
   * a market with no detail page in this app gets.
   */
  href?: string;
}

// The Market design's desktop prediction card (Figma node 173:43958): a
// gradient panel with a dark header carrying the market's artwork and question,
// the outcome as green/red Yes-No pills, and a footer of trades, volume and the
// standing. This deployment's markets are binary (one Yes/No), so the design's
// per-outcome rows collapse to a single row here; the pills keep the onBuy
// wiring the grid passes in.
//
// Given an `href`, the question becomes a link and stretches over the card, so
// the whole panel opens the market. The stretch is a pseudo-element on the link
// rather than a wrapper, because the Yes/No pills are buttons: an anchor around
// them would be invalid markup and would take them out of the tab order. They
// sit above the stretched area instead, so a click on a pill still buys and a
// click anywhere else on the card navigates.
export function PredictionCard({ prediction: p, onBuy, href }: PredictionCardProps) {
  const t = useTranslations("prediction");

  return (
    <div className="relative flex h-full flex-col justify-center gap-6 overflow-hidden rounded-[17px] border-[1.975px] border-[#767474] bg-gradient-to-b from-[#292929] to-[#111] pb-3.5">
      {/* Header: the market artwork and its question. */}
      <div className="flex w-full items-end gap-3.5 rounded-t-[15px] bg-black/40 p-3.5">
        <div className="size-[45px] shrink-0 overflow-hidden rounded-full bg-white/8">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" loading="lazy" className="size-full object-cover" />
          ) : null}
        </div>
        {/* The question is the link's text, so its accessible name is the
            market itself. No aria-label, and nothing to translate: naming the
            link "card" or "view details" would tell a screen reader user which
            control this is but not which market it opens. */}
        <p className="ws-display text-[15px] leading-[1.2] font-semibold tracking-[-0.45px] text-[#e8eaed]">
          {href ? (
            // Two things here are load-bearing, and between them they are why
            // this card read as "not clickable" for so long.
            //
            // `data-no-ripple`: click-ripple.tsx sets `position: relative` on
            // any pressed button or anchor that is statically positioned, so it
            // can host its ripple layer. That turns THIS anchor into the
            // containing block for its own stretched `::after`, which collapses
            // from the whole card to the anchor's own text box between
            // pointerdown and mouseup. The press then lands on nothing and no
            // navigation happens. The attribute is the ripple's own documented
            // opt-out.
            //
            // The clamp sits on the span inside the link, not on the <p> around
            // it: `line-clamp` is `overflow: hidden`, and an ancestor with
            // hidden overflow clips the stretched `::after` back to the text.
            <Link
              href={href}
              data-no-ripple
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-[#b9fcff]"
            >
              <span className="line-clamp-2">{p.q}</span>
            </Link>
          ) : (
            <span className="line-clamp-2">{p.q}</span>
          )}
        </p>
      </div>

      {/* Outcome row: the current Yes price on the left, the two buy pills on
          the right, in the design's green/red. Raised out of the stretched
          link's reach so the pills keep their own clicks. */}
      <div className="relative z-[1] flex w-full items-center justify-between px-3.5">
        <span className="tnum text-[12px] font-semibold tracking-[-0.36px] text-[#e8eaed]">
          {p.yes} {t("yesLabel")}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBuy(true)}
            className="ws-pressable cursor-pointer rounded-[9px] border-[0.988px] border-[#34ca5b]/15 bg-[#34ca5b]/10 px-3.5 py-1.5 text-[12px] font-medium text-[#34ca5b]"
          >
            {t("yesLabel")}
          </button>
          <button
            onClick={() => onBuy(false)}
            className="ws-pressable cursor-pointer rounded-[9px] border-[1.121px] border-[#ed2b07]/15 bg-[#ff3a34]/20 px-3.5 py-1.5 text-[12px] font-medium text-[#ff3a34]"
          >
            {t("noLabel")}
          </button>
        </div>
      </div>

      {/* Footer: the standing and volume on the left, the category on the
          right (this data has no trade count or close date to show). Nothing
          here is interactive, so it stays under the stretched link. */}
      <div className="flex w-full items-center justify-between px-3.5">
        <div className="flex items-center gap-6">
          <span className="tnum flex items-center gap-1 text-[10px] font-semibold text-white/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/prediction/icon-trades.svg" alt="" className="size-[13px]" />
            {p.pct}% {t("yesLabel")}
          </span>
          <span className="tnum flex items-center gap-1 text-[10px] font-semibold text-white/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/prediction/icon-volume.svg" alt="" className="size-[13px]" />
            {p.vol}
          </span>
        </div>
        <span className="text-[12px] font-semibold text-white/50">{p.tag}</span>
      </div>
    </div>
  );
}
