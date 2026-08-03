import type { User } from "@privy-io/node";

const PRIVATE_READ_PATTERNS = [
  /^cashier\/players\/[^/]+\/balance$/u,
  /^betting\/markets\/[^/]+\/bets$/u,
  /^matches\/[^/]+\/note$/u,
];

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

// The match endpoints whose caller identity names a seat: moves, the match
// actions, and the social surfaces (comments, note, chat) that the service gates
// behind "are you a player in this match". On a managed Swiss-tournament board a
// seat is the short display name the player registered under, not a wallet, so a
// non-wallet identity on these paths is a tournament seat name and must survive
// to the service or it rejects the caller as a non-player. The proven wallet
// still rides along in `x-wallet-address`, so binding the named seat to the
// caller stays a server concern. A wallet-shaped or empty identity is forced to
// the proven wallet as before, which is what an ordinary wallet-seated game
// sends.
const MATCH_SEAT_IDENTITY =
  /^matches\/[^/]+\/(moves|resign|draw-offer|draw-response|claim-draw|claim-timeout|abort|rematch|rematch-decline|takeback|takeback-decline|comments(?:\/[^/]+)?|note|chat)$/u;

function isWalletLike(value: unknown): boolean {
  return typeof value !== "string" || value === "" || EVM_WALLET.test(value);
}

// Force an identity field to the proven wallet unless it is a tournament seat
// name (a non-wallet string) on a seat-identity path, which is kept intact.
function seatOrWallet(joined: string, value: unknown, wallet: string): string {
  return MATCH_SEAT_IDENTITY.test(joined) && !isWalletLike(value) ? (value as string) : wallet;
}

function parseBody(raw: string): Record<string, unknown> | null {
  try {
    const body = raw ? JSON.parse(raw) : {};
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function walletOfUser(user: User | null): string | null {
  const wallet = user?.linked_accounts.find(
    (account) =>
      account.type === "wallet" && "chain_type" in account && account.chain_type === "ethereum"
  );
  return wallet && "address" in wallet ? wallet.address : null;
}

export function chessReadNeedsSession(joined: string, searchParams?: URLSearchParams): boolean {
  if (PRIVATE_READ_PATTERNS.some((pattern) => pattern.test(joined))) return true;
  return /^matches\/[^/]+\/chat$/u.test(joined) && searchParams?.get("room") === "player";
}

export function withChessIdentity(joined: string, raw: string, wallet: string): string {
  const record = parseBody(raw);
  if (!record) return raw;
  if (/^matches\/[^/]+\/chat$/u.test(joined) && !("author" in record)) record.author = wallet;
  if (
    (/^matches\/[^/]+\/note$/u.test(joined) ||
      /^matches\/[^/]+\/comments(?:\/[^/]+)?$/u.test(joined)) &&
    !("player" in record)
  ) {
    record.player = wallet;
  }
  // `author` (chat) and `player` (moves, actions, comments, note) name a seat, so
  // a tournament display name on a seat-identity path is kept; everything else is
  // the proven wallet. `creator`, `bettor` and `walletAddress` never carry a
  // display name, so they are always forced.
  if ("author" in record) record.author = seatOrWallet(joined, record.author, wallet);
  if ("player" in record) record.player = seatOrWallet(joined, record.player, wallet);
  if ("creator" in record) record.creator = wallet;
  if ("bettor" in record) record.bettor = wallet;
  if ("walletAddress" in record) record.walletAddress = wallet;
  return JSON.stringify(record);
}

export function withChessReadIdentity(
  joined: string,
  searchParams: URLSearchParams,
  wallet: string
): URLSearchParams {
  const params = new URLSearchParams(searchParams);
  if (/^matches\/[^/]+\/note$/u.test(joined)) {
    if (!params.get("player")) params.set("player", wallet);
    return params;
  }
  if (/^matches\/[^/]+\/chat$/u.test(joined) && params.get("room") === "player") {
    if (!params.get("player")) params.set("player", wallet);
    return params;
  }
  return params;
}
