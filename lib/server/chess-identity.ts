import type { User } from "@privy-io/node";

const PRIVATE_READ_PATTERNS = [
  /^cashier\/players\/[^/]+\/balance$/u,
  /^betting\/markets\/[^/]+\/bets$/u,
  /^betting\/swiss\/[^/]+\/bets$/u,
  /^players\/[^/]+\/product-access$/u,
  /^players\/[^/]+\/coach\/(?:home|training)$/u,
  /^computer\/matches\/[^/]+\/coach$/u,
  /^matches\/[^/]+\/note$/u,
  /^lottery\/tickets\/[^/]+$/u,
  /^lottery\/players\/[^/]+\/(?:tickets|eligibility)$/u,
];

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;
const TOURNAMENT_NAME_MAX = 30;
const PUBLIC_NAME_MAX = 60;

function normalizedPublicName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || name === "Account" || name === "World Street user") return null;
  return [...name].slice(0, PUBLIC_NAME_MAX).join("");
}

export function chessDisplayNameOfUser(user: User | null): string | null {
  if (!user) return null;
  const accountByType = (type: string) =>
    user.linked_accounts.find((account) => account.type === type) as
      Record<string, unknown> | undefined;
  const google = accountByType("google_oauth");
  const twitter = accountByType("twitter_oauth");
  const github = accountByType("github_oauth");
  const farcaster = accountByType("farcaster");
  const telegram = accountByType("telegram");
  const email = accountByType("email");
  const telegramName = [telegram?.first_name, telegram?.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  const candidates = [
    google?.name,
    twitter?.name,
    twitter?.username,
    github?.name,
    github?.username,
    farcaster?.display_name,
    farcaster?.username,
    telegramName,
    telegram?.username,
  ];
  for (const candidate of candidates) {
    const name = normalizedPublicName(candidate);
    if (name) return name;
  }
  const address = typeof email?.address === "string" ? email.address : "";
  return normalizedPublicName(address.split("@")[0]);
}

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
  /^matches\/[^/]+\/(moves|resign|draw-offer|draw-response|claim-draw|claim-timeout|abort|rematch|rematch-decline|takeback|takeback-decline|comments(?:\/[^/]+)?|note|chat|video\/token)$/u;
const ARENA_JOIN = /^arenas\/[^/]+\/join$/u;

function isWalletLike(value: unknown): boolean {
  return typeof value !== "string" || value === "" || EVM_WALLET.test(value);
}

// Force an identity field to the proven wallet unless it is a tournament seat
// name (a non-wallet string) on a seat-identity path, which is kept intact.
function seatOrWallet(joined: string, value: unknown, wallet: string): string {
  return MATCH_SEAT_IDENTITY.test(joined) && !isWalletLike(value) ? (value as string) : wallet;
}

// Swiss stores its organizer as the same short, ASCII seat name used by the
// tournament UI. Derive it from the verified wallet so a browser cannot claim
// somebody else's organizer authority in create/start/reconcile requests.
function tournamentOrganizer(wallet: string): string {
  return wallet.length <= TOURNAMENT_NAME_MAX
    ? wallet
    : `${wallet.slice(0, 8)}-${wallet.slice(-4)}`;
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

// The identity the chess service knows a player by must be the same wallet the
// client identifies as (lib/user.ts getWalletAddress): the embedded Privy
// wallet. A user who signed in with or linked an external EVM wallet can have
// it listed first, and stamping that address would post moves and chat under
// an identity the client never matches — their own lines would render as
// someone else's.
export function walletOfUser(user: User | null): string | null {
  const wallets = (user?.linked_accounts ?? []).filter(
    (account) =>
      account.type === "wallet" &&
      "chain_type" in account &&
      account.chain_type === "ethereum" &&
      "address" in account
  );
  const embedded = wallets.find(
    (account) => "wallet_client_type" in account && account.wallet_client_type === "privy"
  );
  const wallet = embedded ?? wallets[0];
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
  if ("organizer" in record) record.organizer = tournamentOrganizer(wallet);
  if (ARENA_JOIN.test(joined)) {
    delete record.countryCode;
    delete record.country_code;
  }
  return JSON.stringify(record);
}

export function withChessCountry(joined: string, raw: string, countryCode: string | null): string {
  if (!ARENA_JOIN.test(joined) || !countryCode) return raw;
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code)) return raw;
  const record = parseBody(raw);
  if (!record) return raw;
  record.countryCode = code;
  return JSON.stringify(record);
}

export function withChessReadIdentity(
  joined: string,
  searchParams: URLSearchParams,
  wallet: string
): URLSearchParams {
  const params = new URLSearchParams(searchParams);
  if (/^betting\/(?:markets|swiss)\/[^/]+\/bets$/u.test(joined)) {
    params.set("bettor", wallet);
    return params;
  }
  if (/^matches\/[^/]+\/note$/u.test(joined)) {
    if (!params.get("player")) params.set("player", wallet);
    return params;
  }
  if (/^matches\/[^/]+\/chat$/u.test(joined) && params.get("room") === "player") {
    if (!params.get("player")) params.set("player", wallet);
    return params;
  }
  if (/^lottery\/tickets\/[^/]+$/u.test(joined)) {
    params.set("player", wallet);
    return params;
  }
  return params;
}
