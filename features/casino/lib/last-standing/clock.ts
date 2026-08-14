// One clock for every countdown on the screen.
//
// The lobby shows a timer per game, and the old approach — a setState every
// second inside each timer — costs one React render per second per game. Ten
// live games is ten renders a second doing nothing but changing a digit.
//
// Instead there is a single interval for the whole app, and subscribers are
// plain callbacks. A countdown writes its new text straight into its own text
// node, so a tick costs no render at all. The interval only exists while
// something is listening.

type Tick = () => void;

const listeners = new Set<Tick>();
let interval: ReturnType<typeof setInterval> | null = null;

function start(): void {
  if (interval !== null) return;
  interval = setInterval(() => {
    for (const listener of listeners) listener();
  }, 1000);
}

function stop(): void {
  if (interval === null) return;
  clearInterval(interval);
  interval = null;
}

/** Runs `tick` once a second until the returned function is called. */
export function subscribeToClock(tick: Tick): () => void {
  listeners.add(tick);
  start();
  return () => {
    listeners.delete(tick);
    if (listeners.size === 0) stop();
  };
}

/**
 * Seconds left until `endTime` (unix seconds), never negative.
 *
 * Derived from the wall clock rather than counted down from a snapshot, so a
 * tab that was backgrounded or a laptop that slept shows the right number the
 * moment it comes back instead of resuming from where it stopped.
 */
export function secondsUntil(endTime: number): number {
  return Math.max(0, endTime - Math.floor(Date.now() / 1000));
}

/** `m:ss` for anything under an hour, `h:mm:ss` beyond it. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// The longest countdown seen per game, which stands in for the round length
// v4 does not report. Held outside React so a render can read it without
// touching a ref, which the compiler rightly refuses.
const longestSeen = new Map<number, number>();

/** Records `seconds` for `gameId` and returns the longest ever seen for it. */
export function rememberRoundLength(gameId: number, seconds: number): number {
  const previous = longestSeen.get(gameId) ?? 0;
  if (seconds <= previous) return previous;
  longestSeen.set(gameId, seconds);
  return seconds;
}
