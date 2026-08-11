// Time controls for the board games on the chess service. Chess and draughts
// are separate modules upstream but share one clock encoding: a starting bank
// and a Fischer increment, both in seconds. These helpers turn that pair into
// the chip a player picks and back again, so neither game owns the format.

export interface TimeControlSeconds {
  initialSeconds: number;
  incrementSeconds: number;
}

// A per-move budget of `seconds` shown as a single chip: "30s", or "2m" for a
// whole number of minutes. The seconds form is kept below a minute so a 45s
// budget doesn't render as "0.75m".
function formatPerMove(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

// The seconds behind a per-move chip: "30s" -> 30, "2m" -> 120, bare "90" -> 90.
function parsePerMove(label: string): number {
  const trimmed = label.trim();
  const unit = trimmed.slice(-1);
  const value = Number(unit === "s" || unit === "m" ? trimmed.slice(0, -1) : trimmed);
  if (!Number.isFinite(value)) throw new Error(`Unrecognised time control: ${label}`);
  return unit === "m" ? value * 60 : value;
}

// The chosen label a match's clocks read back as. Our own games use the per-move
// model, where the service holds an equal base and Fischer increment, so an
// `initialSeconds === incrementSeconds` pair is shown as one per-move budget.
// A match made elsewhere with a distinct base and increment (standard chess)
// still reads correctly as "5+3" rather than being forced into the per-move form.
export function formatTimeControl(initialSeconds: number, incrementSeconds: number): string {
  if (initialSeconds === incrementSeconds) return formatPerMove(initialSeconds);
  const minutes = initialSeconds / 60;
  const main = Number.isInteger(minutes) ? `${minutes}` : `${initialSeconds}s`;
  return `${main}+${incrementSeconds}`;
}

// Turn a chip back into the seconds the create endpoint wants. A per-move chip
// ("30s", "2m") maps to an equal base and increment: every move restores that
// budget, so the player always has about that long to move. A legacy "5+3" chip
// still parses into a distinct base and increment.
export function parseTimeControl(label: string): TimeControlSeconds {
  if (label.includes("+")) {
    const [main = "", increment = "0"] = label.split("+");
    const initialSeconds = main.endsWith("s") ? Number(main.slice(0, -1)) : Number(main) * 60;
    const incrementSeconds = Number(increment);
    if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) {
      throw new Error(`Unrecognised time control: ${label}`);
    }
    return { initialSeconds, incrementSeconds };
  }
  const perMove = parsePerMove(label);
  return { initialSeconds: perMove, incrementSeconds: perMove };
}
