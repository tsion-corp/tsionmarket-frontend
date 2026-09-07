import type { TokenAmount, VaultGame } from "@/features/casino/lib/vault-api";

// The shape the lobby renders: the vault API's view of a game, with USD
// figures. The vault's own domain Game carries potWei and minWagerWei
// instead, and the socket feed has published that shape, so a row is checked
// here before any component can read pot.usdValue from it. Two boundaries
// use this: the REST list and the socket snapshot.

function isTokenAmount(value: unknown): value is TokenAmount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.amount === "string" &&
    typeof v.tokenSymbol === "string" &&
    typeof v.usdValue === "number" &&
    Number.isFinite(v.usdValue) &&
    typeof v.formattedUsd === "string"
  );
}

export function isVaultGame(value: unknown): value is VaultGame {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gameId === "number" &&
    typeof v.starter === "string" &&
    typeof v.king === "string" &&
    isTokenAmount(v.pot) &&
    isTokenAmount(v.minWager) &&
    typeof v.endTime === "number" &&
    typeof v.timeRemaining === "number" &&
    typeof v.settled === "boolean" &&
    typeof v.active === "boolean"
  );
}

// The well-formed rows of a list, whatever else it held. A malformed row is
// dropped rather than rendered half-empty, and the caller says so.
export function onlyVaultGames(value: unknown): VaultGame[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVaultGame);
}
