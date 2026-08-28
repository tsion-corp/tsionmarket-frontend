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

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import { apiError } from "@/lib/api/envelope";
import { formatTimeControl, isMatchId } from "@/features/casino/lib/api/chess-wire";

export type SwissStatusWire = "created" | "started" | "finished";
export type SwissPairingStatus = "bye" | "ongoing" | "white" | "black" | "draw";
export type SwissPrizePolicy = "standard" | "highStakes";
export type SwissFormat = "swiss" | "champions";
export type SwissPhase = "registration" | "league" | "playoff" | "knockout" | "finished";

export interface SwissTimeControlWire {
  initialSeconds: number;
  incrementSeconds: number;
}

// Swiss is shared by the two board games on this service. A tournament creates
// boards of its own kind, so the kind decides which surface a pairing opens.
export type SwissGameKind = "chess" | "draughts";

// Older responses predate the field, and everything before draughts was chess.
export function toSwissGameKind(value: string | undefined): SwissGameKind {
  return value === "draughts" ? "draughts" : "chess";
}

export interface SwissSurfaceRoutes {
  label: "Chess" | "Checkers";
  home: string;
  tournaments: string;
  create: string;
  games: string;
  detail: (tournamentId: string) => string;
  play: (matchId: string, playerName: string | null) => string;
}

// The tournament API is shared, but each game owns its own browser surface.
// Keeping every route in one mapping prevents a draughts tournament from
// leaking back into chess when a user shares or opens a paired board.
export function swissSurfaceRoutes(
  game: SwissGameKind,
  format: SwissFormat = "swiss"
): SwissSurfaceRoutes {
  if (game === "draughts") {
    return {
      label: "Checkers",
      home: "/casino/checkers",
      tournaments: "/casino/checkers/tournaments",
      create: "/casino/checkers/create",
      games: "/casino/checkers",
      detail: (tournamentId) => `/casino/checkers/tournaments/${tournamentId}`,
      play: (matchId) => `/casino/checkers?match=${encodeURIComponent(matchId)}`,
    };
  }

  return {
    label: "Chess",
    home: "/casino/chess",
    tournaments: format === "champions" ? "/casino/chess/tournaments" : "/casino/chess/swiss",
    create: format === "champions" ? "/casino/chess/tournaments/create" : "/casino/chess/create",
    games: "/casino/chess/history",
    detail: (tournamentId) =>
      format === "champions"
        ? `/casino/chess/tournaments/${tournamentId}`
        : `/casino/chess/swiss/${tournamentId}`,
    play: (matchId, playerName) =>
      `/casino/chess/play?match=${encodeURIComponent(matchId)}&player=${encodeURIComponent(playerName ?? "")}`,
  };
}

export interface SwissSummaryWire {
  id: string;
  name: string;
  organizer: string;
  game?: string;
  status: SwissStatusWire;
  round: number;
  nbRounds: number;
  participantCount: number;
  ongoingCount: number;
  timeControl: SwissTimeControlWire;
  entryFeeUsdc?: string;
  maxPlayers?: number;
  prizePolicy?: SwissPrizePolicy | "high_stakes";
  prizePoolBps?: number;
  platformShareBps?: number;
  minimumPlayers?: number;
  winner: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  format?: SwissFormat;
  phase?: SwissPhase;
  leagueRounds?: number;
  bracketSize?: number;
  directQualifiers?: number;
  playoffPlayers?: number;
  eliminatedPlayers?: number;
  knockoutRound?: number;
  knockoutGamesPerTie?: number;
}

export interface SwissStandingWire {
  rank: number;
  name: string;
  points: number;
  tieBreak: number;
  directEncounter?: number;
  buchholzCutOne?: number;
  sonnebornBerger?: number;
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
  game?: string;
  white: string;
  black: string | null;
  matchId: string | null;
  status: SwissPairingStatus;
  result: string | null;
  isForfeit: boolean;
  stage?: "league" | "playoff" | "knockout";
  stageRound?: number;
  tieNumber?: number | null;
  leg?: number;
  armageddon?: boolean;
  whiteSeed?: number | null;
  blackSeed?: number | null;
}

export interface SwissRoundWire {
  round: number;
  pairings: SwissPairingWire[];
}

export interface SwissDetailWire extends SwissSummaryWire {
  standings: SwissStandingWire[];
  rounds: SwissRoundWire[];
  standingsTotal?: number;
  standingsOffset?: number;
  standingsHasMore?: boolean;
  pairingsTotal?: number;
  pairingsOffset?: number;
  pairingsHasMore?: boolean;
  myPairing?: SwissPairingWire | null;
}

// Domain types. Standings and pairings pass through nearly as-is, but the seam
// stays: a wire rename lands here, not in every screen.

export type SwissState = "open" | "running" | "finished";

export interface SwissSummary {
  id: string;
  name: string;
  organizer: string;
  game: SwissGameKind;
  state: SwissState;
  round: number;
  nbRounds: number;
  participantCount: number;
  ongoingCount: number;
  timeControl: string;
  entryFeeUsdc: string;
  maxPlayers: number;
  prizePolicy: SwissPrizePolicy;
  prizePoolBps: number;
  platformShareBps: number;
  minimumPlayers: number;
  winner: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  format: SwissFormat;
  phase: SwissPhase;
  leagueRounds: number;
  bracketSize: number;
  directQualifiers: number;
  playoffPlayers: number;
  eliminatedPlayers: number;
  knockoutRound: number;
  knockoutGamesPerTie: number;
}

export interface SwissStanding {
  rank: number;
  name: string;
  points: number;
  tieBreak: number;
  directEncounter: number;
  buchholzCutOne: number;
  sonnebornBerger: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  absent: boolean;
}

export interface SwissPairing {
  round: number;
  board: number;
  game: SwissGameKind;
  white: string;
  black: string | null;
  matchId: string | null;
  status: SwissPairingStatus;
  isForfeit: boolean;
  stage: "league" | "playoff" | "knockout";
  stageRound: number;
  tieNumber: number | null;
  leg: number;
  armageddon: boolean;
  whiteSeed: number | null;
  blackSeed: number | null;
}

export interface SwissRound {
  round: number;
  pairings: SwissPairing[];
}

export interface SwissDetail extends SwissSummary {
  standings: SwissStanding[];
  rounds: SwissRound[];
  standingsTotal: number;
  standingsOffset: number;
  standingsHasMore: boolean;
  pairingsTotal: number;
  pairingsOffset: number;
  pairingsHasMore: boolean;
  myPairing: SwissPairing | null;
}

const STATE_BY_STATUS: Record<SwissStatusWire, SwissState> = {
  created: "open",
  started: "running",
  finished: "finished",
};

export function toSwissSummary(wire: SwissSummaryWire): SwissSummary {
  const prizePolicy =
    wire.prizePolicy === "highStakes" || wire.prizePolicy === "high_stakes"
      ? "highStakes"
      : "standard";
  return {
    id: wire.id,
    name: wire.name,
    organizer: wire.organizer,
    game: toSwissGameKind(wire.game),
    state: STATE_BY_STATUS[wire.status],
    round: wire.round,
    nbRounds: wire.nbRounds,
    participantCount: wire.participantCount,
    ongoingCount: wire.ongoingCount,
    timeControl: formatTimeControl(
      wire.timeControl.initialSeconds,
      wire.timeControl.incrementSeconds
    ),
    entryFeeUsdc: wire.entryFeeUsdc ?? "0",
    maxPlayers: wire.maxPlayers ?? 4000,
    prizePolicy,
    prizePoolBps: wire.prizePoolBps ?? 10_000,
    platformShareBps: wire.platformShareBps ?? 0,
    minimumPlayers: wire.minimumPlayers ?? 2,
    winner: wire.winner,
    createdAt: wire.createdAt,
    startedAt: wire.startedAt,
    finishedAt: wire.finishedAt,
    format: wire.format ?? "swiss",
    phase:
      wire.phase ??
      (wire.status === "created"
        ? "registration"
        : wire.status === "finished"
          ? "finished"
          : "league"),
    leagueRounds: wire.leagueRounds ?? wire.nbRounds,
    bracketSize: wire.bracketSize ?? 0,
    directQualifiers: wire.directQualifiers ?? 0,
    playoffPlayers: wire.playoffPlayers ?? 0,
    eliminatedPlayers: wire.eliminatedPlayers ?? 0,
    knockoutRound: wire.knockoutRound ?? 0,
    knockoutGamesPerTie: wire.knockoutGamesPerTie ?? 1,
  };
}

export function toSwissDetail(wire: SwissDetailWire): SwissDetail {
  const mapPairing = (pairing: SwissPairingWire): SwissPairing => ({
    round: pairing.round,
    board: pairing.board,
    game: toSwissGameKind(pairing.game ?? wire.game),
    white: pairing.white,
    black: pairing.black,
    matchId: pairing.matchId,
    status: pairing.status,
    isForfeit: pairing.isForfeit,
    stage: pairing.stage ?? "league",
    stageRound: pairing.stageRound ?? pairing.round,
    tieNumber: pairing.tieNumber ?? null,
    leg: pairing.leg ?? 1,
    armageddon: pairing.armageddon ?? false,
    whiteSeed: pairing.whiteSeed ?? null,
    blackSeed: pairing.blackSeed ?? null,
  });
  return {
    ...toSwissSummary(wire),
    standings: wire.standings.map((s) => ({
      rank: s.rank,
      name: s.name,
      points: s.points,
      tieBreak: s.tieBreak,
      directEncounter: s.directEncounter ?? 0,
      buchholzCutOne: s.buchholzCutOne ?? s.tieBreak,
      sonnebornBerger: s.sonnebornBerger ?? 0,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      byes: s.byes,
      absent: s.absent,
    })),
    rounds: wire.rounds.map((r) => ({
      round: r.round,
      pairings: r.pairings.map(mapPairing),
    })),
    standingsTotal: wire.standingsTotal ?? wire.standings.length,
    standingsOffset: wire.standingsOffset ?? 0,
    standingsHasMore: wire.standingsHasMore ?? false,
    pairingsTotal:
      wire.pairingsTotal ?? wire.rounds.reduce((total, round) => total + round.pairings.length, 0),
    pairingsOffset: wire.pairingsOffset ?? 0,
    pairingsHasMore: wire.pairingsHasMore ?? false,
    myPairing: wire.myPairing ? mapPairing(wire.myPairing) : null,
  };
}

// The pairings of the round in play, or of the last round once it is over.
export function currentRound(detail: SwissDetail): SwissRound | null {
  const round = detail.rounds.find((item) => item.round === detail.round) ?? null;
  if (!detail.myPairing || detail.myPairing.round !== detail.round) return round;
  if (!round) return { round: detail.round, pairings: [detail.myPairing] };
  if (round.pairings.some((pairing) => pairing.board === detail.myPairing?.board)) return round;
  return { ...round, pairings: [...round.pairings, detail.myPairing] };
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
export const HIGH_STAKES_ENTRY_MIN_USDC = "2";
export const HIGH_STAKES_PLAYERS_MIN = 4;
export const HIGH_STAKES_PLAYERS_MAX = 200;
export const CHAMPIONS_PLAYERS_MIN = 4;
export const CHAMPIONS_PLAYERS_MAX = 10_000;

export interface ChampionsPlan {
  leagueRounds: number;
  bracketSize: number;
  directQualifiers: number;
  playoffPlayers: number;
  eliminatedPlayers: number;
}

export function championsPlan(players: number): ChampionsPlan | null {
  if (
    !Number.isInteger(players) ||
    players < CHAMPIONS_PLAYERS_MIN ||
    players > CHAMPIONS_PLAYERS_MAX
  ) {
    return null;
  }
  const target = Math.max(2, Math.floor((players * 2) / 3));
  const bracketSize = 2 ** Math.floor(Math.log2(target));
  const directQualifiers = bracketSize / 2;
  const playoffPlayers = bracketSize;
  const leagueRounds =
    players <= 5 ? players - 1 : players <= 16 ? 5 : players <= 24 ? 6 : players <= 32 ? 7 : 8;
  return {
    leagueRounds,
    bracketSize,
    directQualifiers,
    playoffPlayers,
    eliminatedPlayers: players - directQualifiers - playoffPlayers,
  };
}

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
  if (detail.format === "champions" && rememberedName) return rememberedName;
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

export async function fetchSwissList(format?: SwissFormat): Promise<SwissSummary[]> {
  const data = await chessGet<SwissListWire>("/swiss", {
    limit: "50",
    ...(format ? { format } : {}),
  });
  return data.items.map(toSwissSummary);
}

export interface FetchSwissOptions {
  player?: string;
  standingsOffset?: number;
  standingsLimit?: number;
  round?: number;
  pairingsOffset?: number;
  pairingsLimit?: number;
}

export async function fetchSwiss(
  id: string,
  options: FetchSwissOptions = {}
): Promise<SwissDetail> {
  return toSwissDetail(
    await chessGet<SwissDetailWire>(`/swiss/${requireSwissId(id)}`, {
      ...(options.standingsOffset !== undefined
        ? { standingsOffset: String(options.standingsOffset) }
        : {}),
      ...(options.player ? { player: options.player } : {}),
      ...(options.standingsLimit !== undefined
        ? { standingsLimit: String(options.standingsLimit) }
        : {}),
      ...(options.round !== undefined ? { round: String(options.round) } : {}),
      ...(options.pairingsOffset !== undefined
        ? { pairingsOffset: String(options.pairingsOffset) }
        : {}),
      ...(options.pairingsLimit !== undefined
        ? { pairingsLimit: String(options.pairingsLimit) }
        : {}),
    })
  );
}

export interface CreateSwissInput {
  organizer: string;
  name: string;
  // Which board game the tournament runs. Defaults to chess when omitted, which
  // is what every tournament created before draughts existed was.
  game?: SwissGameKind;
  nbRounds: number;
  initialSeconds: number;
  incrementSeconds: number;
  entryFeeUsdc?: string;
  maxPlayers?: number;
  prizePolicy?: SwissPrizePolicy;
  password?: string;
  // Optional newline-separated "A B" lines the service must never pair; passed
  // through to the bbpPairings TRF as forbidden pairings.
  forbiddenPairings?: string;
  format?: SwissFormat;
  knockoutGamesPerTie?: 1 | 2;
}

export async function createSwiss(input: CreateSwissInput): Promise<SwissSummary> {
  const forbidden = input.forbiddenPairings?.trim();
  const wire = await chessPost<SwissSummaryWire>("/swiss", {
    organizer: input.organizer,
    name: input.name.trim(),
    ...(input.game ? { game: input.game } : {}),
    nbRounds: input.nbRounds,
    initialSeconds: input.initialSeconds,
    incrementSeconds: input.incrementSeconds,
    ...(input.entryFeeUsdc ? { entryFeeUsdc: input.entryFeeUsdc } : {}),
    ...(input.maxPlayers ? { maxPlayers: input.maxPlayers } : {}),
    ...(input.prizePolicy ? { prizePolicy: input.prizePolicy } : {}),
    ...(input.password ? { password: input.password } : {}),
    ...(forbidden ? { forbiddenPairings: forbidden } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(input.knockoutGamesPerTie ? { knockoutGamesPerTie: input.knockoutGamesPerTie } : {}),
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
export async function startNextSwissRound(
  id: string,
  organizer: string,
  // Optional override: newline-separated "white black" (or "player 1" for a bye)
  // lines. When present the service uses them verbatim instead of the bundled
  // pairing engine — the fallback for a deployment without bbpPairings.
  manualPairings?: string
): Promise<SwissDetail> {
  const manual = manualPairings?.trim();
  const wire = await chessPost<SwissDetailWire>(`/swiss/${requireSwissId(id)}/rounds/next`, {
    organizer,
    ...(manual ? { manualPairings: manual } : {}),
  });
  return toSwissDetail(wire);
}

// Organizer-only repair path for a round that has boards stuck "ongoing" until
// their underlying matches are reconciled.
export async function reconcileSwiss(id: string, organizer: string): Promise<SwissDetail> {
  const wire = await chessPost<SwissDetailWire>(`/swiss/${requireSwissId(id)}/reconcile`, {
    organizer,
  });
  return toSwissDetail(wire);
}
