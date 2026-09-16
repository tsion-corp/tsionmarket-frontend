import { useTranslations } from "next-intl";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";

// The end-cap every discovery shelf closes on: a dark card carrying one line of
// copy and a white pill through to the desk the shelf is drawn from.
//
// The design draws it three times — "Ride the Hype" on memes, "Trade What's
// Next" on spot, "Bet On What's Next?" on prediction — and the three differ
// only in that line and where the pill goes. The card is one component and the
// shelf passes its own box, so each end-cap sits at the radius and border its
// neighbours were drawn at rather than at a radius of its own.
//
// It is a doorway, not an action: the per-asset pills on the cards before it
// act on that asset in place, and this one leaves for the desk.

/** The star field, in the two layers the design paints it in. */
function StarField() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/market/see-more-stars.svg')] bg-[length:100%_100%] bg-no-repeat opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/market/see-more-stars-overlay.svg')] bg-[length:100%_100%] bg-no-repeat opacity-60"
      />
    </>
  );
}

export interface SeeMoreCardProps {
  /** The one line the shelf closes on, already translated. */
  headline: string;
  /** The desk this shelf is drawn from. */
  href: string;
  /** The shelf's own card box: height, radius, border. */
  className?: string;
}

export function SeeMoreCard({ headline, href, className = "" }: SeeMoreCardProps) {
  const t = useTranslations("discovery");

  return (
    <article
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#303030] to-black ${className}`}
    >
      <StarField />

      {/* 269px is the width the design lays the column out at, as a cap rather
          than a width, so the card centres on a phone instead of overflowing. */}
      <div className="relative z-[1] flex w-full max-w-[269px] flex-col items-center gap-[20px] px-[16px]">
        {/* The design sets 28px type on an 18px line box, which is Figma
            measuring a single line rather than a leading anyone meant: at 18px
            a second line would sit inside the first. English fits on one line
            at every width this card is drawn at, and German and Portuguese do
            not, so the line box is the one the rest of the redesign uses and
            the wrapped locales stay legible. */}
        <h3 className="text-center font-serif text-[28px] leading-[1.15] font-semibold tracking-[-0.56px] text-white">
          {headline}
        </h3>
        <DiscoveryCta
          href={href}
          label={t("seeMore")}
          tone="light"
          size={14}
          className="min-w-[125px] shadow-[inset_0_0.813px_0_rgba(255,255,255,0.95)] drop-shadow-[0_1.627px_3.253px_rgba(0,0,0,0.5)]"
        />
      </div>
    </article>
  );
}
