"use client";

// The envelope logic moved to lib/api/envelope once earn became the third
// service to need it. This file stays so the casino and chess call sites keep
// their existing names.

import type { GatewayApiError } from "@/lib/api/envelope";

export { apiError, unwrap } from "@/lib/api/envelope";
export { isUnconfigured as isCasinoUnconfigured } from "@/lib/api/envelope";

export type CasinoApiError = GatewayApiError;
