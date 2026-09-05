"use client";

import { use } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { HyperliquidTradeTerminal } from "@/features/trade";

// Full-page standalone trading terminal for one market, e.g. /trade/BTC.
// No DashboardShell here on purpose — the terminal wants the full viewport,
// same immersive pattern the casino's live game screens use.
export default function TradePage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);

  return (
    <AuthGuard>
      <HyperliquidTradeTerminal symbol={decodeURIComponent(symbol)} />
    </AuthGuard>
  );
}
