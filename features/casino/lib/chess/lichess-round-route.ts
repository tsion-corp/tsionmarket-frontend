const ROUND_ANALYSIS_PATH = /^\/([^/]+)\/(?:white|black)(?:\/analysis)?\/?$/u;

export function lichessRoundReviewRoute(
  href: string,
  matchId: string,
  selectedPly: number
): string | null {
  let path: string;
  try {
    path = new URL(href, "https://ark.invalid").pathname;
  } catch {
    return null;
  }

  const routeMatch = ROUND_ANALYSIS_PATH.exec(path);
  if (!routeMatch || decodeURIComponent(routeMatch[1] ?? "") !== matchId) return null;

  const ply = Number.isFinite(selectedPly) ? Math.max(0, Math.trunc(selectedPly)) : 0;
  return `/casino/chess/review?match=${encodeURIComponent(matchId)}#${ply}`;
}
