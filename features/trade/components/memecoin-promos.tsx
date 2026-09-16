"use client";

// The featured memecoin promo banners from the mobile comp (node 1:5521): a
// swipeable strip of illustrated cards. The art (Shiba, Pepe, the sunburst,
// the floating +1000% pills) is baked into one exported image per card, so the
// whole card is the tap target and its copy stays exactly as the designer drew
// it. Each card points at a token symbol; the parent opens that token's trade
// sheet when it is in the live feed.
const PROMOS = [
  {
    src: "/memecoins/shiba-banner.png",
    alt: "Shiba is hearing things. Check the chart.",
    symbol: "SHIB",
  },
  {
    src: "/memecoins/pepe-banner.png",
    alt: "Pepe is booming. Buy Pepe.",
    symbol: "PEPE",
  },
];

// The comp's card size (302x202) and 12px gutter. The strip bleeds to the
// screen edges so a card peeks on the right, inviting the swipe.
export function MemecoinPromos({ onOpenSymbol }: { onOpenSymbol?: (symbol: string) => void }) {
  return (
    <div className="ws-no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto">
      {PROMOS.map((promo) => (
        <button
          key={promo.symbol}
          type="button"
          onClick={() => onOpenSymbol?.(promo.symbol)}
          className="w-[80%] shrink-0 cursor-pointer snap-start overflow-hidden rounded-[22.568px] transition-transform active:scale-[0.99]"
        >
          {/* The exported card already carries the comp's exact border
              (1.031px #bab4b4), 22.568px corners, and inner highlight. The
              width/height attributes fix the 302:202 aspect ratio, so w-full +
              h-auto scales the card to the screen without ever distorting the
              art. The source is a 3x export, so it stays crisp when enlarged. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={promo.src}
            alt={promo.alt}
            width={302}
            height={202}
            className="block h-auto w-full rounded-[22.568px]"
          />
        </button>
      ))}
    </div>
  );
}
