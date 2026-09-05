"use client";

import { PerpsBackLink } from "@/features/trade/components/perps-back-link";
import { HyperliquidProPerps } from "@/features/trade/components/hyperliquid-pro-perps";

interface HyperliquidTradeTerminalProps {
  /** From the /trade/:symbol route — deep-links straight into that market. */
  symbol: string;
}

// The full-page, chrome-free trading terminal at /trade/:symbol: no sidebar,
// no topbar, just a back link and the same pro trading surface /perps uses
// (HyperliquidProPerps already covers chart, order book, order ticket, and
// positions/orders — this only adds the deep link and drops the app shell so
// the terminal gets the full viewport). Same immersive-layout pattern
// features/casino/components/casino-page.tsx uses for live game screens.
export function HyperliquidTradeTerminal({ symbol }: HyperliquidTradeTerminalProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-[1920px] px-4 pt-5 pb-8 sm:px-6 lg:px-8">
        <PerpsBackLink href="/perps" label="Perps" />
        <HyperliquidProPerps initialSymbol={symbol} />
      </div>
    </div>
  );
}
