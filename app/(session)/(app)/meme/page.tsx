"use client";

import { MemeSection } from "@/features/trade/components/meme-section";

// Memecoins as their own page. The section trades through its own sheet, so
// this route needs no modal host. The auth guard and the app shell come from
// the (app) layout.
export default function MemePage() {
  return <MemeSection />;
}
