"use client";

import { createServiceClient } from "@/lib/api/service";

export const predictionCombos = createServiceClient(
  "/api/prediction-combos",
  "Prediction markets are unavailable right now."
);
