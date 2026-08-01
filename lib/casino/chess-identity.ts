import type { User } from "@privy-io/node";

const PRIVATE_READ_PATTERNS = [
  /^cashier\/players\/[^/]+\/balance$/u,
  /^betting\/markets\/[^/]+\/bets$/u,
];

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

export function chessReadNeedsSession(joined: string): boolean {
  return PRIVATE_READ_PATTERNS.some((pattern) => pattern.test(joined));
}

export function withChessIdentity(raw: string, wallet: string): string {
  const record = parseBody(raw);
  if (!record) return raw;
  if ("creator" in record) record.creator = wallet;
  if ("player" in record) record.player = wallet;
  if ("bettor" in record) record.bettor = wallet;
  if ("walletAddress" in record) record.walletAddress = wallet;
  return JSON.stringify(record);
}
