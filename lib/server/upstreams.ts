import "server-only";

import { wsapiService } from "@/lib/wsapi-base";

// Base URLs of the gateway services the dashboard feed reads directly. Each
// mirrors the derivation in that service's route handler under app/api, so a
// local override that points a route at a staging instance points the feed
// there too. Keep them in step when one changes.

// See app/api/trade/[...path]/route.ts.
export const TRADE_BASE = process.env.NEXT_PUBLIC_TRADE_API_URL ?? wsapiService("trade");

// See app/api/vault/[...path]/route.ts.
export const VAULT_BASE =
  process.env.NEXT_PUBLIC_VAULT_API_URL ?? wsapiService("world-street-vault");

// See app/api/chess/[...path]/route.ts. Draughts is the same service under a
// /draughts prefix (app/api/draughts/[...path]/route.ts).
const LOCAL_DEV_CHESS_API = "http://127.0.0.1:8082";
export const CHESS_BASE =
  process.env.CHESS_API_URL ??
  (process.env.NODE_ENV === "development" ? LOCAL_DEV_CHESS_API : undefined) ??
  process.env.NEXT_PUBLIC_CHESS_API_URL ??
  wsapiService("chess");
