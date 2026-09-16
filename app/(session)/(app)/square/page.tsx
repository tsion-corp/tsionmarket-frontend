"use client";

import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { SquareHome } from "@/features/square";
import { useSpotMarkets } from "@/features/trade/hooks/use-spot-markets";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";

// Market Square as its own page, like Spot and Prediction: the Square's Home,
// read through this app's relay, with the buy sheet host beside it so a
// $TICKER in a post opens a trade here. The spot universe is what the post
// card matches cashtags against; the dashboard supplies it the same way. It
// is not read while the square is hidden, when the page renders nothing.
//
// The auth guard and the app shell come from the (app) layout.
export default function SquarePage() {
  const modals = useAppModals();
  const { markets } = useSpotMarkets({ enabled: !MARKET_SQUARE_HIDDEN });

  return (
    <>
      <SquareHome markets={markets} onOpenBuy={modals.openBuy} />
      <AppModalHost active={modals.modal} onClose={modals.close} onConfirmed={modals.showDone} />
    </>
  );
}
