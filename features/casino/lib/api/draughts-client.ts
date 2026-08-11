"use client";

// Transport for the draughts module of the chess service. Reads are public and
// go straight through the proxy; writes act on a match and carry the caller's
// Privy session, which the proxy verifies and turns into the wallet address the
// service identifies players by.

import { createServiceClient, type QueryParams } from "@/lib/api/service";

const draughts = createServiceClient("/api/draughts", "Checkers is unavailable right now.");

export function draughtsGet<T>(
  path: string,
  params?: QueryParams,
  opts: { requireAuth?: boolean } = {}
): Promise<T> {
  return opts.requireAuth ? draughts.authedGet<T>(path, params) : draughts.get<T>(path, params);
}

// The body always exists on this service, even for an action as simple as
// resigning, because the player has to be named. The proxy overwrites that name
// with the verified one before it goes upstream.
export function draughtsPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return draughts.post<T>(path, body);
}

export function draughtsPut<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return draughts.put<T>(path, body);
}

export function draughtsDelete<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return draughts.del<T>(path, body);
}
