export interface VisemeCue {
  viseme: number;
  ms: number;
}

export function parseVisemeTrack(raw: string): VisemeCue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .flatMap((cue): VisemeCue[] => {
      if (!Array.isArray(cue) || cue.length !== 2) return [];
      const [viseme, ms] = cue;
      if (!Number.isInteger(viseme) || typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
        return [];
      }
      return [{ viseme: viseme as number, ms }];
    })
    .sort((left, right) => left.ms - right.ms);
}

export function visemeAt(track: VisemeCue[], elapsedMs: number): number | null {
  if (track.length === 0 || elapsedMs < track[0].ms) return null;

  let low = 0;
  let high = track.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (track[middle].ms <= elapsedMs) low = middle;
    else high = middle - 1;
  }
  return track[low].viseme;
}
