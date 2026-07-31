"use client";

// Client and normalizer for the swiss tournament arm of the chess service.
// Same seam as chess-wire.ts: the service's shapes stop here, and screens only
// ever see our domain types.
//
// Tournament identity is a display name, not a wallet. The service seats
// managed matches by the name a player registered with, and the organizer
// field is capped at 30 characters, so a full address never fits. We derive a
// deterministic short name from the wallet instead, which keeps "is this me"
// checks stable across devices.

import { chessGet, chessPost } from "@/lib/casino/api/chess-client";
import { apiError } from "@/lib/casino/api/envelope";
import { formatTimeControl, isMatchId } from "@/lib/casino/api/chess-wire";

export type SwissStatusWire = "created" | "started" | "finished";
export type SwissPairingStatus = "bye" | "ongoing" | "white" | "black" | "draw";

export interface SwissTimeControlWire {
  initialSeconds: number;
  incrementSeconds: number;
}

export interface SwissSummaryWire {
  id: string;
  name: string;
  organizer: string;
  status: SwissStatusWire;
  round: number;
  nbRounds: number;
  participantCount: number;
  ongoingCount: number;
  timeControl: SwissTimeControlWire;
  entryFeeUsdc: string;
  winner: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SwissStandingWire {
  rank: number;
  name: string;
  points: number;
  tieBreak: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  absent: boolean;
}

// A bye has no opponent and no board to play, so black and matchId are null.
export interface SwissPairingWire {
  round: number;
  board: number;
  white: string;
  black: string | null;
  matchId: string | null;
  status: SwissPairingStatus;
  result: string | null;
  isForfeit: boolean;
}

export interface SwissRoundWire {
  round: number;
  pairings: SwissPairingWire[];
}

export interface SwissDetailWire extends SwissSummaryWire {
  standings: SwissStandingWire[];
  rounds: SwissRoundWire[];
}

// Domain types. Standings and pairings pass through nearly as-is, but the seam
// stays: a wire rename lands here, not in every screen.

export type SwissState = "open" | "running" | "finished";

export interface SwissSummary {
  id: string;
  name: string;
  organizer: string;
  state: SwissState;
  round: number;
  nbRounds: number;
  participantCount: number;
  ongoingCount: number;
  timeControl: string;
  winner: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SwissStanding {
  rank: number;
  name: string;
  points: number;
  tieBreak: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  absent: boolean;
}

export interface SwissPairing {
  round: number;
  board: number;
  white: string;
  black: string | null;
  matchId: string | null;
  status: SwissPairingStatus;
  isForfeit: boolean;
}

export interface SwissRound {
  round: number;
  pairings: SwissPairing[];
}

export interface SwissDetail extends SwissSummary {
  standings: SwissStanding[];
  rounds: SwissRound[];
}

const STATE_BY_STATUS: Record<SwissStatusWire, SwissState> = {
  created: "open",
  started: "running",
  finished: "finished",
};

export function toSwissSummary(wire: SwissSummaryWire): SwissSummary {
  return {
    id: wire.id,
    name: wire.name,
    organizer: wire.organizer,
    state: STATE_BY_STATUS[wire.status],
    round: wire.round,
    nbRounds: wire.nbRounds,
    participantCount: wire.participantCount,
    ongoingCount: wire.ongoingCount,
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    winner: wire.winner,
    createdAt: wire.createdAt,
    startedAt: wire.startedAt,
    finishedAt: wire.finishedAt,
  };
}

export function toSwissDetail(wire: SwissDetailWire): SwissDetail {
  return {
    ...toSwissSummary(wire),
    standings: wire.standings.map((s) => ({
      rank: s.rank,
      name: s.name,
      points: s.points,
      tieBreak: s.tieBreak,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      byes: s.byes,
      absent: s.absent,
    })),
    rounds: wire.rounds.map((r) => ({
      round: r.round,
      pairings: r.pairings.map((p) => ({
        round: p.round,
        board: p.board,
        white: p.white,
        black: p.black,
        matchId: p.matchId,
        status: p.status,
        isForfeit: p.isForfeit,
      })),
    })),
  };
}

// The pairings of the round in play, or of the last round once it is over.
export function currentRound(detail: SwissDetail): SwissRound | null {
  return detail.rounds.find((r) => r.round === detail.round) ?? null;
}

// Name rules. The service documents 1 to 30 characters with no spaces, and its
// pairing engine additionally falls over on non-ASCII names (verified live:
// a name containing "…" makes rounds/next answer 500), so we hold names to
// printable ASCII before a request is spent on them.
export const PLAYER_NAME_MAX = 30;
export const TOURNAMENT_NAME_MIN = 2;
export const TOURNAMENT_NAME_MAX = 60;
export const ROUNDS_MIN = 1;
export const ROUNDS_MAX = 32;

const PRINTABLE_ASCII_NO_SPACE = /^[\x21-\x7e]+$/;

export type SwissNameError = "empty" | "tooLong" | "invalid" | null;

export function playerNameError(name: string): SwissNameError {
  if (name.length === 0) return "empty";
  if (name.length > PLAYER_NAME_MAX) return "tooLong";
  if (!PRINTABLE_ASCII_NO_SPACE.test(name)) return "invalid";
  return null;
}

export type SwissTournamentNameError = "tooShort" | "tooLong" | null;

export function tournamentNameError(name: string): SwissTournamentNameError {
  const trimmed = name.trim();
  if (trimmed.length < TOURNAMENT_NAME_MIN) return "tooShort";
  if (trimmed.length > TOURNAMENT_NAME_MAX) return "tooLong";
  return null;
}

export function roundsError(nbRounds: number): boolean {
  return !Number.isInteger(nbRounds) || nbRounds < ROUNDS_MIN || nbRounds > ROUNDS_MAX;
}

// The name a wallet plays under when the user picks nothing else. ASCII only,
// for the pairing engine, so this is not truncateAddress with its ellipsis.
export function defaultPlayerName(wallet: string | null): string {
  if (!wallet) return "";
  if (wallet.length <= PLAYER_NAME_MAX) return wallet;
  return `${wallet.slice(0, 8)}-${wallet.slice(-4)}`;
}

// Whether this wallet is the tournament's organizer. The organizer string is
// the derived short name for tournaments created here; a raw address is also
// accepted in case a future service build lifts the length cap.
export function organizerWalletMatches(organizer: string, wallet: string | null): boolean {
  if (!wallet) return false;
  return (
    organizer.toLowerCase() === wallet.toLowerCase() || organizer === defaultPlayerName(wallet)
  );
}

export function pairingSeats(pairing: SwissPairing): string[] {
  return pairing.black === null ? [pairing.white] : [pairing.white, pairing.black];
}

export function isSeated(pairing: SwissPairing, name: string | null): boolean {
  return name !== null && pairingSeats(pairing).includes(name);
}

// The name this wallet already plays under in the tournament, if any. Checked
// against the standings so a stale memory of a withdrawn seat reads as "not
// joined" rather than offering actions the service would reject.
export function seatedName(
  detail: SwissDetail,
  rememberedName: string | null,
  wallet: string | null
): string | null {
  const candidates = [rememberedName, defaultPlayerName(wallet) || null];
  for (const candidate of candidates) {
    if (candidate && detail.standings.some((s) => s.name === candidate)) return candidate;
  }
  return null;
}

// True while this player has a board they are expected to be playing, which is
// when leaving must also concede that game.
export function hasOngoingPairing(detail: SwissDetail, name: string | null): boolean {
  const round = currentRound(detail);
  if (!round || name === null) return false;
  return round.pairings.some((p) => p.status === "ongoing" && isSeated(p, name));
}

// Swiss ids are UUIDs like match ids, and the gateway answers a malformed one
// with plain text instead of the envelope, so the shape is checked first.
function requireSwissId(id: string): string {
  if (!isMatchId(id)) {
    throw apiError("NOT_FOUND", "That tournament doesn't exist.", 404);
  }
  return id;
}

interface SwissListWire {
  items: SwissSummaryWire[];
}

export async function fetchSwissList(): Promise<SwissSummary[]> {
  const data = await chessGet<SwissListWire>("/swiss", { limit: "50" });
  return data.items.map(toSwissSummary);
}

export async function fetchSwiss(id: string): Promise<SwissDetail> {
  return toSwissDetail(await chessGet<SwissDetailWire>(`/swiss/${requireSwissId(id)}`));
}

export interface CreateSwissInput {
  organizer: string;
  name: string;
  nbRounds: number;
  initialSeconds: number;
  incrementSeconds: number;
  password?: string;
}

// Paid tournaments exist in the contract but the cashier behind them is not
// configured on the service yet (creates answer CONFLICT), so entryFeeUsdc is
// deliberately never sent and every tournament created here is free.
export async function createSwiss(input: CreateSwissInput): Promise<SwissSummary> {
  const wire = await chessPost<SwissSummaryWire>("/swiss", {
    organizer: input.organizer,
    name: input.name.trim(),
    nbRounds: input.nbRounds,
    initial_seconds: input.initialSeconds,
    increment_seconds: input.incrementSeconds,
    ...(input.password ? { password: input.password } : {}),
  });
  return toSwissSummary(wire);
}

export interface JoinSwissInput {
  name: string;
  walletAddress: string;
  password?: string;
}

export async function joinSwiss(id: string, input: JoinSwissInput): Promise<SwissDetail> {
  const wire = await chessPost<SwissDetailWire>(`/swiss/${requireSwissId(id)}/join`, {
    name: input.name,
    walletAddress: input.walletAddress,
    ...(input.password ? { password: input.password } : {}),
  });
  return toSwissDetail(wire);
}

export interface WithdrawSwissInput {
  name: string;
  walletAddress: string;
  forfeit?: boolean;
}

export async function withdrawSwiss(id: string, input: WithdrawSwissInput): Promise<SwissDetail> {
  const wire = await chessPost<SwissDetailWire>(`/swiss/${requireSwissId(id)}/withdraw`, {
    name: input.name,
    walletAddress: input.walletAddress,
    ...(input.forfeit ? { forfeit: true } : {}),
  });
  return toSwissDetail(wire);
}

// Only the organizer can start a round. The service pairs automatically and
// answers 409 while boards are still in play or fewer than two players are
// registered; those messages are worth showing as-is.
export async function startNextSwissRound(id: string, organizer: string): Promise<SwissDetail> {
  const wire = await chessPost<SwissDetailWire>(`/swiss/${requireSwissId(id)}/rounds/next`, {
    organizer,
  });
  return toSwissDetail(wire);
}
