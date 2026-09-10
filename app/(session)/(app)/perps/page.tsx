"use client";

import { PerpsSection } from "@/features/trade/components/perps-section";

// Perpetuals as its own page. The perps desk owns its order ticket and its
// own sheets, so this route needs no modal host. The auth guard and the app
// shell come from the (app) layout.
export default function PerpsPage() {
  return <PerpsSection />;
}
