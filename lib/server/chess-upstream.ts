import "server-only";

import { upstreamCandidates } from "@/lib/server/upstream-failover";

const LOCAL_DEV_CHESS_API = "http://127.0.0.1:8082";
export const DEPLOYED_CHESS_API = "https://api.tsionark.com/v1/chess";

// Production must read the production ledger. Development still supports an
// explicit override and the local service before falling back to production.
export function chessUpstreamCandidates(): string[] {
  if (process.env.NODE_ENV !== "development") return [DEPLOYED_CHESS_API];

  return upstreamCandidates(
    process.env.CHESS_API_URL,
    LOCAL_DEV_CHESS_API,
    process.env.NEXT_PUBLIC_CHESS_API_URL,
    DEPLOYED_CHESS_API
  );
}

export function chessUpstreamBase(): string {
  return chessUpstreamCandidates()[0] ?? DEPLOYED_CHESS_API;
}
