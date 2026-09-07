"use client";

import { MemeBoard } from "@/features/trade/components/meme-board";
import { MemeSettlementTracker } from "@/features/trade/components/meme-settlement-tracker";

// Memecoins as their own page. The board trades through its own sheet, so
// this route needs no modal host. The auth guard and the app shell come from
// the (app) layout. The settlement tracker finishes any Solana purchase whose
// USD is still on its way, and is mounted on the dashboard too.
export default function MemePage() {
  return (
    <>
      <MemeBoard />
      <MemeSettlementTracker />
    </>
  );
}
