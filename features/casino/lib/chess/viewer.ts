import type { ChessColor, ChessMatch, ChessPlayer } from "@/features/casino/lib/api/types";

function matchesViewer(
  player: ChessPlayer | null,
  walletAddress: string | null,
  seatName: string | null
): boolean {
  if (!player) return false;
  if (walletAddress && player.walletAddress.toLowerCase() === walletAddress.toLowerCase())
    return true;
  if (!seatName) return false;
  return player.username === seatName || player.walletAddress === seatName;
}

export function resolveViewerColor(
  match: ChessMatch | null | undefined,
  walletAddress: string | null,
  seatName: string | null
): ChessColor | null {
  if (!match) return null;
  if (matchesViewer(match.white, walletAddress, seatName)) return "w";
  if (matchesViewer(match.black, walletAddress, seatName)) return "b";
  return null;
}
