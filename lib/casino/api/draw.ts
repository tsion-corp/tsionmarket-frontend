"use client";

import { casinoGet, casinoPost } from "@/lib/casino/api/client";
import type {
  CreateDrawEntryInput,
  DrawEntry,
  DrawResult,
  DrawRound,
} from "@/lib/casino/api/types";

// The number draw. Winning numbers come from the server's published draw, so
// the client only ever submits picks and reads results.

export async function fetchCurrentRound(): Promise<DrawRound> {
  return casinoGet<DrawRound>("/draw/rounds/current");
}

export async function fetchPastResults(limit = 8): Promise<DrawResult[]> {
  const data = await casinoGet<{ results: DrawResult[] }>("/draw/results", {
    limit: String(limit),
  });
  return data.results;
}

// Buys entries for the open round, charging the caller's balance. Returns the
// created entries so the UI can show them without a refetch.
export async function createEntries(input: CreateDrawEntryInput): Promise<DrawEntry[]> {
  const data = await casinoPost<{ entries: DrawEntry[] }>("/draw/entries", input);
  return data.entries;
}

// The caller's own entries, newest first, across open and settled rounds.
export async function fetchMyEntries(): Promise<DrawEntry[]> {
  const data = await casinoGet<{ entries: DrawEntry[] }>("/draw/entries");
  return data.entries;
}

export async function claimDrawPrize(entryId: string): Promise<DrawEntry> {
  return casinoPost<DrawEntry>(`/draw/entries/${encodeURIComponent(entryId)}/claim`);
}
