"use client";

import { MemeBoard } from "@/features/trade/components/meme-board";

// Memecoins as their own page. The board trades through its own sheet, so
// this route needs no modal host. The auth guard and the app shell come from
// the (app) layout.
export default function MemePage() {
  return <MemeBoard />;
}
