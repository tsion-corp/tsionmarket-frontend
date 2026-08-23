import { truncateAddress } from "@/lib/format";
import type { ChessMatch, ChessPlayer } from "@/features/casino/lib/api/types";

export function countryFlag(countryCode: string | null | undefined): string {
  const code = countryCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/u.test(code)) return "";
  return String.fromCodePoint(...code.split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

export function playerIdentityLabel(
  label: string,
  player: ChessPlayer | null,
  rating: number | null = player?.rating ?? null
): string {
  const flag = countryFlag(player?.countryCode);
  const identity = flag ? `${flag} ${label}` : label;
  return rating === null ? identity : `${identity} (${rating})`;
}

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

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

export function matchActorLabel({
  actor,
  match,
  walletAddress,
  whiteDisplayName,
  blackDisplayName,
  youLabel,
}: {
  actor: string;
  match: ChessMatch;
  walletAddress: string | null | undefined;
  whiteDisplayName: string;
  blackDisplayName: string;
  youLabel: string;
}): string {
  const normalizedActor = actor.toLowerCase();
  if (walletAddress && normalizedActor === walletAddress.toLowerCase()) return youLabel;
  if (match.white?.walletAddress.toLowerCase() === normalizedActor) return whiteDisplayName;
  if (match.black?.walletAddress.toLowerCase() === normalizedActor) return blackDisplayName;
  // An actor who is neither the viewer nor a seated player is labelled by
  // their own identity — a truncated wallet, or a tournament seat name as-is.
  return EVM_WALLET.test(actor) ? truncateAddress(actor) : actor;
}
