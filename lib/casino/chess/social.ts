import { truncateAddress } from "@/lib/format";
import type { ChessMatch, ChessPlayer } from "@/lib/casino/api/types";

export function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayName(
  name: string | null | undefined,
  wallet: string | null | undefined
): string | null {
  if (name && name !== "Account" && name !== "World Street user") return name;
  return wallet ? truncateAddress(wallet) : null;
}

export function playerDisplayName(
  player: ChessPlayer | null,
  walletName: string | null | undefined,
  walletAddress: string | null | undefined,
  fallback: string
): string {
  if (!player) return fallback;
  const playerWallet = player.walletAddress.toLowerCase();
  const viewerWallet = walletAddress?.toLowerCase() ?? null;

  if (viewerWallet && playerWallet === viewerWallet) {
    return displayName(walletName, player.walletAddress) ?? fallback;
  }

  return displayName(player.username, player.walletAddress) ?? fallback;
}

export function matchActorLabel({
  actor,
  match,
  walletName,
  walletAddress,
  whiteDisplayName,
  blackDisplayName,
  youLabel,
}: {
  actor: string;
  match: ChessMatch;
  walletName: string | null | undefined;
  walletAddress: string | null | undefined;
  whiteDisplayName: string;
  blackDisplayName: string;
  youLabel: string;
}): string {
  const normalizedActor = actor.toLowerCase();
  if (walletAddress && normalizedActor === walletAddress.toLowerCase()) return youLabel;
  if (match.white?.walletAddress.toLowerCase() === normalizedActor) return whiteDisplayName;
  if (match.black?.walletAddress.toLowerCase() === normalizedActor) return blackDisplayName;
  return displayName(walletName, actor) ?? displayName(undefined, actor) ?? actor;
}
