"use client";

// Transport for the chess service. Reads are public and go straight through the
// proxy; writes act on a game and carry the caller's Privy session, which the
// proxy verifies and turns into the wallet address the service identifies
// players by.

import { createServiceClient, type QueryParams } from "@/lib/api/service";

const chess = createServiceClient("/api/chess", "Chess is unavailable right now.");

// A few chess reads are private (a player's own notes, the player chat room),
// so this one read takes the auth decision as an argument.
export function chessGet<T>(
  path: string,
  params?: QueryParams,
  opts: { requireAuth?: boolean } = {}
): Promise<T> {
  return opts.requireAuth ? chess.authedGet<T>(path, params) : chess.get<T>(path, params);
}

// The body always exists on this service, even for an action as simple as
// resigning, because the player has to be named. The proxy overwrites that name
// with the verified one before it goes upstream.
export function chessPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return chess.post<T>(path, body);
}

export function chessPut<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return chess.put<T>(path, body);
}

export function chessDelete<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return chess.del<T>(path, body);
}
