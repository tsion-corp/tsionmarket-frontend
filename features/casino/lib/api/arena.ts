"use client";

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import { formatTimeControl, isMatchId } from "@/features/casino/lib/api/chess-wire";
import { apiError } from "@/lib/api/envelope";

export type ArenaStatus = "created" | "started" | "finished";
export type ArenaPairingStatus =
  "creating" | "ongoing" | "white" | "black" | "draw" | "failed" | "cancelled";

interface ArenaTimeControlWire {
  initialSeconds: number;
  incrementSeconds: number;
}

interface ArenaSummaryWire {
  id: string;
  name: string;
  organizer: string;
  status: ArenaStatus;
  participantCount: number;
  ongoingCount: number;
  maxPlayers: number;
  timeControl: ArenaTimeControlWire;
  durationSeconds: number;
  startsAt: string;
  startedAt: string | null;
  finishesAt: string | null;
  finishedAt: string | null;
  winner: string | null;
}

interface ArenaStandingWire {
  rank: number;
  name: string;
  countryCode: string | null;
  rating: number;
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  active: boolean;
  playing: boolean;
  fire: boolean;
}

interface ArenaPairingWire {
  id: string;
  white: string;
  black: string;
  matchId: string | null;
  status: ArenaPairingStatus;
  whiteScore: number;
  blackScore: number;
  scored: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

interface ArenaMeWire {
  name: string;
  countryCode: string | null;
  active: boolean;
  playing: boolean;
  rank: number;
  score: number;
}

interface ArenaDetailWire extends ArenaSummaryWire {
  standings: ArenaStandingWire[];
  standingOffset: number;
  standingLimit: number;
  me: ArenaMeWire | null;
  myPairing: ArenaPairingWire | null;
  featuredPairings: ArenaPairingWire[];
}

interface ArenaListWire {
  items: ArenaSummaryWire[];
}

export interface ArenaSummary {
  id: string;
  name: string;
  organizer: string;
  status: ArenaStatus;
  participantCount: number;
  ongoingCount: number;
  maxPlayers: number;
  timeControl: string;
  initialSeconds: number;
  incrementSeconds: number;
  durationSeconds: number;
  startsAt: string;
  startedAt: string | null;
  finishesAt: string | null;
  finishedAt: string | null;
  winner: string | null;
}

export type ArenaStanding = ArenaStandingWire;
export type ArenaPairing = ArenaPairingWire;
export type ArenaMe = ArenaMeWire;

export interface ArenaDetail extends ArenaSummary {
  standings: ArenaStanding[];
  standingOffset: number;
  standingLimit: number;
  me: ArenaMe | null;
  myPairing: ArenaPairing | null;
  featuredPairings: ArenaPairing[];
}

function toArenaSummary(wire: ArenaSummaryWire): ArenaSummary {
  return {
    ...wire,
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    initialSeconds: wire.timeControl.initialSeconds,
    incrementSeconds: wire.timeControl.incrementSeconds,
  };
}

function toArenaDetail(wire: ArenaDetailWire): ArenaDetail {
  return {
    ...toArenaSummary(wire),
    standings: wire.standings,
    standingOffset: wire.standingOffset,
    standingLimit: wire.standingLimit,
    me: wire.me,
    myPairing: wire.myPairing,
    featuredPairings: wire.featuredPairings,
  };
}

function requireArenaId(id: string): string {
  if (!isMatchId(id)) throw apiError("NOT_FOUND", "That tournament does not exist.", 404);
  return id;
}

export async function fetchArenaList(): Promise<ArenaSummary[]> {
  const response = await chessGet<ArenaListWire>("/arenas", { limit: "100" });
  return response.items.map(toArenaSummary);
}

export async function fetchArena(id: string, player?: string): Promise<ArenaDetail> {
  const response = await chessGet<ArenaDetailWire>(`/arenas/${requireArenaId(id)}`, {
    limit: "100",
    ...(player ? { player } : {}),
  });
  return toArenaDetail(response);
}

export interface CreateArenaInput {
  organizer: string;
  name: string;
  initialSeconds: number;
  incrementSeconds: number;
  durationMinutes: number;
  maxPlayers: number;
  startDelaySeconds: number;
}

export async function createArena(input: CreateArenaInput): Promise<ArenaSummary> {
  return toArenaSummary(await chessPost<ArenaSummaryWire>("/arenas", { ...input }));
}

export async function joinArena(
  id: string,
  input: { name: string; walletAddress: string; rating?: number }
): Promise<ArenaDetail> {
  return toArenaDetail(
    await chessPost<ArenaDetailWire>(`/arenas/${requireArenaId(id)}/join`, input)
  );
}

export async function withdrawArena(
  id: string,
  input: { name: string; walletAddress: string }
): Promise<ArenaDetail> {
  return toArenaDetail(
    await chessPost<ArenaDetailWire>(`/arenas/${requireArenaId(id)}/withdraw`, input)
  );
}

export async function startArena(id: string, organizer: string): Promise<ArenaDetail> {
  return toArenaDetail(
    await chessPost<ArenaDetailWire>(`/arenas/${requireArenaId(id)}/start`, { organizer })
  );
}
