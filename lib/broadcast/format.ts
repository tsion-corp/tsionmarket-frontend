// Formatting for the live bar. Pure, so the clock and the surface chip can be
// tested without a broadcast.

/** mm:ss, and h:mm:ss once a broadcast passes an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * What is being shared, always shown. Not knowing what is going out is the
 * single most common complaint in the research behind the spec, so this never
 * returns an empty string.
 */
export function surfaceChipLabel(
  mode: "ark" | "camera-ark" | "screen" | null,
  surface: string | null
): string {
  if (mode === "ark") return "Sharing: Ark only";
  if (mode === "camera-ark") return "Sharing: Camera + Ark";
  if (mode === "screen") return surface ? `Sharing: ${surface}` : "Sharing: your screen";
  return "Sharing: nothing yet";
}

/** Viewer count, or null when the number cannot be known honestly. */
export function viewerLabel(viewers: number | null): string | null {
  if (viewers === null || viewers < 0) return null;
  return `${viewers} watching`;
}
