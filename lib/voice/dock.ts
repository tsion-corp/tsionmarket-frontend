// Where the Vivid control sits on screen, and the rules for keeping it there.
//
// The control floats over every page, so wherever it rests it covers something.
// Letting the user move it is the fix, which means a position that survives a
// reload, a resize, and a rotate without ever landing off-screen. No framework
// imports, so the geometry is unit tested.

// Offsets from the viewport's bottom-right corner, in CSS pixels. Anchored to
// that corner rather than top-left so the control keeps its place when the
// on-screen keyboard or a mobile browser chrome changes the viewport height.
export interface DockPosition {
  right: number;
  bottom: number;
}

// The resting place before anyone moves it: clear of the mobile tab bar, inside
// the thumb arc on a phone.
export const DEFAULT_DOCK: DockPosition = { right: 20, bottom: 96 };

// The control's hit area, and the breathing room kept between it and every
// viewport edge so it never sits flush against one.
export const DOCK_SIZE = 64;
const EDGE_MARGIN = 12;

export interface Viewport {
  width: number;
  height: number;
}

// Pulls a position back inside the viewport. Applied on drag, on load, and on
// resize: a spot that was reachable on a desktop window can be off-screen on a
// phone, and a restored position must never strand the control where it cannot
// be tapped.
//
// When the viewport is smaller than the control plus its margins the clamp
// would invert, so the lower bound wins and the control stays reachable.
export function clampDock(position: DockPosition, viewport: Viewport): DockPosition {
  const maxRight = Math.max(EDGE_MARGIN, viewport.width - DOCK_SIZE - EDGE_MARGIN);
  const maxBottom = Math.max(EDGE_MARGIN, viewport.height - DOCK_SIZE - EDGE_MARGIN);
  return {
    right: Math.min(Math.max(position.right, EDGE_MARGIN), maxRight),
    bottom: Math.min(Math.max(position.bottom, EDGE_MARGIN), maxBottom),
  };
}

// A pointer moved by (dx, dy) from where the drag began. The anchors are the
// opposite edges, so both axes invert: dragging right reduces the right offset.
export function dockFromDrag(start: DockPosition, dx: number, dy: number): DockPosition {
  return { right: start.right - dx, bottom: start.bottom - dy };
}

// How far a pointer must travel before the gesture counts as a drag rather than
// a tap. Without this every attempt to move the control also opens a voice
// session, since a tap and the first pixel of a drag look identical.
const DRAG_THRESHOLD_PX = 6;

export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

// Versioned: a position saved against an older layout can sit under chrome that
// did not exist then. The phone tab bar took over the bottom-right corner, so
// v1 positions are dropped and everyone starts from DEFAULT_DOCK again.
const DOCK_KEY = "ws.voice-dock.v2";

export function saveDock(position: DockPosition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCK_KEY, JSON.stringify(position));
  } catch {
    // Storage can be unavailable (private mode, quota). Where the control sits
    // is a preference, so losing it just means it returns to the default.
  }
}

// A stored position, or null when there is none or it is unusable. Parsed
// defensively: this is user-writable storage, and a malformed value must not
// put the control somewhere it cannot be reached.
export function loadDock(): DockPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DOCK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { right, bottom } = parsed as Partial<DockPosition>;
    if (typeof right !== "number" || typeof bottom !== "number") return null;
    if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null;
    return { right, bottom };
  } catch {
    return null;
  }
}
