// Pure math for the landing scroll film ("The Silver Thread"). The page is one
// continuous camera move: nine waypoints the camera rests at, and eight
// scroll-scrubbed transit clips between them. Everything on screen derives
// from a single frame value computed here — no independent animation clock —
// which is what keeps film, copy and camera locked together and makes
// scrubbing backwards rewind cleanly.
//
// The constants are the tuned values from the design handoff and must not be
// "simplified": 0.42/0.58 copy handoff, 0.62 reveal window, 0.03s scrub
// deadband, 1.10 viewport scroll depth.

export const WAYPOINTS = 9;

// Scroll distances, all in px, derived from the viewport height.
const SCROLL_DEPTH = 1.1;
const MIN_HOLD = 420;
const MIN_TRANSIT = 360;
const TRANSIT_RATIO = 0.82;
// Tail room so the closing waypoint finishes its hold before the footer
// scrolls up into the frame.
const TAIL_VIEWPORTS = 1.5;
// Waypoint 0 is a held composition shown whole from the first paint — there
// is no reveal cadence to pace, so its hold is just a beat before the camera
// moves. The full-length hold read as dead scroll between Enter and the hero.
const ENTER_HOLD_RATIO = 0.35;
const MIN_ENTER_HOLD = 180;

// Legibility: flat black veil over the film, and the scrim gradient strength.
// These are what keep light frames from washing out the white type.
export const TEXT_VEIL = 0.45;
export const SCRIM_STRENGTH = 0.62;

// Copy handoff inside a transit: outgoing copy fades over the first 42%,
// incoming fades in over the last 42%. The 16% dead zone in the middle is
// where the camera moves fastest and the frame is unreadable anyway.
const COPY_OUT = 0.42;
const COPY_IN_START = 0.58;

// Sequential reveal: item k of `total` appears at p >= (k * 0.62) / total, so
// all reveals finish by ~66% of the hold, leaving a beat of stillness.
const REVEAL_WINDOW = 0.62;

// Transit scrubbing: deadband stops seek thrash; the end clamp avoids the
// black frame some browsers show at exact duration.
export const SCRUB_DEADBAND_S = 0.03;
export const SCRUB_END_CLAMP_S = 0.05;

export interface JourneyMetrics {
  // Hold distance per waypoint (waypoint 0 is shorter — see ENTER_HOLD_RATIO).
  holds: number[];
  transit: number;
  // Scroll offset where each waypoint's hold begins; starts[i+1] - starts[i]
  // is that waypoint's hold + transit.
  starts: number[];
  trackHeight: number;
}

export function journeyMetrics(viewportHeight: number, waypoints = WAYPOINTS): JourneyMetrics {
  const hold = Math.max(MIN_HOLD, viewportHeight * SCROLL_DEPTH);
  const enterHold = Math.max(MIN_ENTER_HOLD, viewportHeight * SCROLL_DEPTH * ENTER_HOLD_RATIO);
  const transit = Math.max(MIN_TRANSIT, viewportHeight * SCROLL_DEPTH * TRANSIT_RATIO);
  const holds = Array.from({ length: waypoints }, (_, i) => (i === 0 ? enterHold : hold));
  const starts: number[] = [0];
  for (let i = 1; i < waypoints; i++) starts.push(starts[i - 1] + holds[i - 1] + transit);
  const trackHeight =
    starts[waypoints - 1] + holds[waypoints - 1] + viewportHeight * TAIL_VIEWPORTS;
  return { holds, transit, starts, trackHeight };
}

export interface JourneyFrame {
  // Active waypoint index, 0..WAYPOINTS-1.
  i: number;
  // Whether the camera is resting at waypoint i (vs. moving to i+1).
  inHold: boolean;
  // Progress through the hold or the transit, 0..1.
  p: number;
}

export function journeyFrame(
  scrollY: number,
  metrics: JourneyMetrics,
  waypoints = WAYPOINTS
): JourneyFrame {
  const { holds, transit, starts } = metrics;
  const y = Math.max(0, scrollY);
  let i = waypoints - 1;
  for (let k = 1; k < waypoints; k++) {
    if (y < starts[k]) {
      i = k - 1;
      break;
    }
  }
  const local = y - starts[i];
  // The last waypoint holds forever — there is no transit out of it.
  const inHold = i === waypoints - 1 || local < holds[i];
  const raw = inHold ? local / holds[i] : (local - holds[i]) / transit;
  const p = Math.min(1, Math.max(0, raw));
  return { i, inHold, p };
}

// Opacity of copy layer k for a given frame: the active layer holds at 1,
// then hands off to the next layer inside the transit.
export function copyOpacity(k: number, frame: JourneyFrame): number {
  const { i, inHold, p } = frame;
  if (inHold) return k === i ? 1 : 0;
  if (k === i) return 1 - Math.min(1, p / COPY_OUT);
  // The in-window is 0.58..1.0, which is 0.42 wide only up to float error —
  // clamp so an opacity of 1.0000000000000002 can never reach the DOM.
  if (k === i + 1) return Math.min(1, Math.max(0, (p - COPY_IN_START) / COPY_OUT));
  return 0;
}

// Whether reveal item k (of `total` items in the active layer) is shown.
// Waypoint 0 is a held composition, not a reveal: it shows whole from the
// first paint. Outside a hold every item of the active layer stays shown so
// the handoff fades a complete layer, not a half-revealed one.
export function revealShown(
  item: number,
  total: number,
  frame: JourneyFrame,
  waypoint: number
): boolean {
  if (waypoint === 0) return true;
  if (!frame.inHold) return true;
  // The handoff prose adds a 0.04 base offset to every threshold; the tuned
  // prototype shows item 0 at the hold start (its layer just faded in during
  // the transit carrying that item, so a delay would blink it off). The
  // prototype is the executable spec — follow it.
  const threshold = item === 0 ? 0 : (item * REVEAL_WINDOW) / Math.max(1, total);
  return frame.p >= threshold;
}

// Target currentTime for a scrubbed transit video, or null when the write
// should be skipped (inside the deadband).
export function scrubTarget(
  progress: number,
  duration: number,
  currentTime: number
): number | null {
  if (!duration || !isFinite(duration)) return null;
  const target = Math.min(duration - SCRUB_END_CLAMP_S, Math.max(0, progress * duration));
  if (Math.abs(currentTime - target) <= SCRUB_DEADBAND_S) return null;
  return target;
}

// The film scrim: protects the navbar and footer edges without flattening the
// centre of the shot.
export function scrimGradient(strength = SCRIM_STRENGTH): string {
  const s = strength;
  return `linear-gradient(180deg, rgba(0,0,0,${s.toFixed(2)}) 0%, rgba(0,0,0,${(s * 0.3).toFixed(2)}) 30%, rgba(0,0,0,${(s * 0.45).toFixed(2)}) 62%, rgba(0,0,0,${Math.min(0.92, s * 1.34).toFixed(2)}) 100%)`;
}

// Self-hosted film assets (design CDN links are temporary). Waypoint 8 has no
// transit — it is the end of the line.
export interface FilmWaypoint {
  still: string;
  ambient: string;
  transit: string | null;
}

export const FILM: FilmWaypoint[] = Array.from({ length: WAYPOINTS }, (_, i) => ({
  still: `/film/w${i}-still.jpg`,
  ambient: `/film/w${i}-amb.mp4`,
  transit: i < WAYPOINTS - 1 ? `/film/w${i}-transit.mp4` : null,
}));
