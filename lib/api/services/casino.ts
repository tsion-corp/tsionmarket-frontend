"use client";

import { createServiceClient } from "@/lib/api/service";

export const chessClient = createServiceClient(
  "/api/chess",
  "Chess service unavailable right now."
);

export const draughtsClient = createServiceClient(
  "/api/draughts",
  "Draughts service unavailable right now."
);

export const vaultClient = createServiceClient(
  "/api/vault",
  "Vault service unavailable right now."
);
