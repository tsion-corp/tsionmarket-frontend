"use client";

import { createServiceClient } from "@/lib/api/service";

export const tradeClient = createServiceClient(
  "/api/trade",
  "Trade service unavailable right now."
);

export const perpClient = createServiceClient(
  "/api/perp",
  "Perpetuals service unavailable right now."
);
