type RoundStep = {
  check?: unknown;
  ply?: unknown;
  fen?: unknown;
  san?: unknown;
  uci?: unknown;
};

type RoundData = {
  clock?: unknown;
  game?: unknown;
  local?: unknown;
  opponent?: unknown;
  player?: unknown;
  possibleMoves?: unknown;
  steps?: unknown;
};

type LichessColor = "white" | "black";

type LichessStatus = {
  id: number;
  name: string;
};

export type LichessApiMove = {
  bDraw?: boolean;
  check?: boolean;
  clock?: {
    black: number;
    white: number;
  };
  dests: string | Record<string, string>;
  fen: string;
  ply: number;
  san: string;
  status?: LichessStatus;
  uci: string;
  wDraw?: boolean;
  winner?: LichessColor;
};

export type LichessRoundSyncController = {
  data: RoundData;
  ply: number;
};

export function reloadInteractiveLichessRound<T extends RoundData>(
  controller: { reload(data: T): void },
  incoming: T
): void {
  const hadLocalProxy = Object.prototype.hasOwnProperty.call(incoming, "local");
  const localProxy = incoming.local;
  if (hadLocalProxy) delete incoming.local;
  try {
    controller.reload(incoming);
  } finally {
    if (hadLocalProxy) incoming.local = localProxy;
  }
}

function steps(data: RoundData): RoundStep[] | null {
  return Array.isArray(data.steps) && data.steps.length > 0 ? (data.steps as RoundStep[]) : null;
}

function lastPly(data: RoundData): number | null {
  const history = steps(data);
  const ply = history?.at(-1)?.ply;
  return typeof ply === "number" ? ply : null;
}

function hasStepAtPly(data: RoundData, ply: number): boolean {
  const history = steps(data);
  if (!history) return false;
  const firstPly = history[0]?.ply;
  if (typeof firstPly !== "number") return false;
  const index = ply - firstPly;
  if (!Number.isInteger(index) || index < 0 || index >= history.length) return false;
  const step = history[index];
  return step?.ply === ply && typeof step.fen === "string" && step.fen.length > 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function status(data: RoundData): LichessStatus | undefined {
  const value = record(record(data.game)?.status);
  return typeof value?.id === "number" && typeof value.name === "string"
    ? { id: value.id, name: value.name }
    : undefined;
}

function winner(data: RoundData): LichessColor | undefined {
  const value = record(data.game)?.winner;
  return value === "white" || value === "black" ? value : undefined;
}

function drawOffer(data: RoundData, color: LichessColor): boolean | undefined {
  for (const value of [data.player, data.opponent]) {
    const seat = record(value);
    if (seat?.color === color && typeof seat.offeringDraw === "boolean") {
      return seat.offeringDraw;
    }
  }
  return undefined;
}

function clock(data: RoundData): LichessApiMove["clock"] {
  const value = record(data.clock);
  return typeof value?.white === "number" && typeof value.black === "number"
    ? { white: value.white, black: value.black }
    : undefined;
}

function dests(data: RoundData): LichessApiMove["dests"] {
  if (typeof data.possibleMoves === "string") return data.possibleMoves;
  const value = record(data.possibleMoves);
  if (!value) return "";
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    })
  );
}

function sameStep(left: RoundStep, right: RoundStep): boolean {
  return left.ply === right.ply && left.fen === right.fen;
}

// Lichess receives moves as socket events. Using this path is important:
// RoundController.reload deliberately cancels a queued premove when ply changes.
export function lichessApiMoveForAppend(
  current: RoundData,
  incoming: RoundData
): LichessApiMove | null {
  const before = steps(current);
  const after = steps(incoming);
  if (!before || !after || after.length !== before.length + 1) return null;
  if (!before.every((step, index) => sameStep(step, after[index]!))) return null;

  const previous = before.at(-1)!;
  const move = after.at(-1)!;
  if (
    typeof previous.ply !== "number" ||
    typeof move.ply !== "number" ||
    move.ply !== previous.ply + 1 ||
    typeof move.fen !== "string" ||
    move.fen.length === 0 ||
    typeof move.san !== "string" ||
    move.san.length === 0 ||
    typeof move.uci !== "string" ||
    move.uci.length < 4
  ) {
    return null;
  }

  const event: LichessApiMove = {
    ply: move.ply,
    fen: move.fen,
    san: move.san,
    uci: move.uci,
    check: move.check === true,
    dests: dests(incoming),
  };
  const nextClock = clock(incoming);
  const nextStatus = status(incoming);
  const nextWinner = winner(incoming);
  const whiteDraw = drawOffer(incoming, "white");
  const blackDraw = drawOffer(incoming, "black");
  if (nextClock) event.clock = nextClock;
  if (nextStatus) event.status = nextStatus;
  if (nextWinner) event.winner = nextWinner;
  if (whiteDraw !== undefined) event.wDraw = whiteDraw;
  if (blackDraw !== undefined) event.bDraw = blackDraw;
  return event;
}

// RoundController.reload keeps its current ply when the history length is
// unchanged, otherwise it jumps to the incoming last ply. Validate the exact
// slot ground.makeConfig will read before handing data to copied Lichess code.
export function canReloadLichessRound(
  controller: LichessRoundSyncController,
  incoming: RoundData
): boolean {
  const incomingHistory = steps(incoming);
  const currentHistory = steps(controller.data);
  const incomingLastPly = lastPly(incoming);
  const currentLastPly = lastPly(controller.data);
  if (!incomingHistory || incomingLastPly === null) return false;
  if (currentLastPly !== null && incomingLastPly < currentLastPly) return false;

  const targetPly =
    incomingHistory.length !== (currentHistory?.length ?? 0) ? incomingLastPly : controller.ply;
  return hasStepAtPly(incoming, targetPly);
}
