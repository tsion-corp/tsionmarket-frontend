import type {
  TokenAmount,
  VaultActivity,
  VaultGame,
  VaultWinner,
} from "@/features/casino/lib/vault-api";

// The shape the lobby renders: the vault API's view of a game, with USD
// figures. The socket hub has published the contract's own shape instead
// (potWei, minWagerWei), so a row is checked here before any component can
// read pot.usdValue from it. Two boundaries use this: the REST list and the
// socket snapshot.

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

// The service records a winner or a starter as null when a log did not carry
// it. A row like that has nothing to name and nothing to link, and rendered
// as-is it took the page down on `address.length`. Rows are checked here, at
// the boundary, and a malformed one is dropped rather than drawn half-empty.
function isVaultWinner(value: unknown): value is VaultWinner {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gameId === "number" &&
    typeof v.winner === "string" &&
    typeof v.starter === "string" &&
    isTokenAmount(v.pot) &&
    isTokenAmount(v.toWinner) &&
    (v.paidToWinner === undefined || isTokenAmount(v.paidToWinner)) &&
    typeof v.settlementTx === "string" &&
    typeof v.settledAt === "string"
  );
}

export function onlyVaultWinners(value: unknown): VaultWinner[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVaultWinner);
}

const ACTIONS = new Set(["started", "joined", "won"]);

function isVaultActivity(value: unknown): value is VaultActivity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.gameId === "number" &&
    typeof v.action === "string" &&
    ACTIONS.has(v.action) &&
    typeof v.address === "string" &&
    typeof v.amountWei === "string" &&
    typeof v.transactionHash === "string" &&
    typeof v.createdAt === "string"
  );
}

export function onlyVaultActivities(value: unknown): VaultActivity[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isVaultActivity);
}

// The contract's own view of a game, as the socket hub publishes it: amounts
// in wei, as strings on the wire. Priced by the lobby with the ETH price it
// holds, since the hub cannot know dollars.
export interface ChainGame {
  gameId: number;
  starter: string;
  king: string;
  potWei: bigint;
  minWagerWei: bigint;
  endTime: number;
}

const WEI = /^\d+$/;

export function toChainGame(value: unknown): ChainGame | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.gameId !== "number" ||
    typeof v.starter !== "string" ||
    typeof v.king !== "string" ||
    typeof v.endTime !== "number" ||
    typeof v.potWei !== "string" ||
    typeof v.minWagerWei !== "string" ||
    !WEI.test(v.potWei) ||
    !WEI.test(v.minWagerWei)
  ) {
    return null;
  }
  return {
    gameId: v.gameId,
    starter: v.starter,
    king: v.king,
    potWei: BigInt(v.potWei),
    minWagerWei: BigInt(v.minWagerWei),
    endTime: v.endTime,
  };
}

// A snapshot sorted by shape: API rows for the indexed list, contract rows
// for the chain list, and the count of rows that were neither.
export function sortGameRows(rows: unknown[]): {
  api: VaultGame[];
  chain: ChainGame[];
  dropped: number;
} {
  const api: VaultGame[] = [];
  const chain: ChainGame[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (isVaultGame(row)) {
      api.push(row);
      continue;
    }
    const contract = toChainGame(row);
    if (contract) chain.push(contract);
    else dropped += 1;
  }
  return { api, chain, dropped };
}
