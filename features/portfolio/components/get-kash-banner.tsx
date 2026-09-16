"use client";

// The "Get Kash+" promo banner from the comp (node 108:4072): a gold, scalloped
// banner with stacked coins, +3.5% badges, the headline, the tagline, and a Buy
// Now pill, exported as one image at 3x. The scalloped edges carry transparent
// notches, so they reveal the deck's dark card between the bumps. The whole
// banner is the button.
const ART = "/kash/get-kash-banner.png";

export function GetKashBanner({ onBuy }: { onBuy: () => void }) {
  return (
    <button
      type="button"
      onClick={onBuy}
      aria-label="Get Kash+ and start earning extra cash"
      className="block w-full cursor-pointer transition-transform active:scale-[0.99]"
    >
      {/* The exported banner keeps the comp's 340:58 ratio and its own edges, so
          it renders 1:1 at any width with no wrapper styling. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ART} alt="" width={340} height={58} className="block h-auto w-full" />
    </button>
  );
}
