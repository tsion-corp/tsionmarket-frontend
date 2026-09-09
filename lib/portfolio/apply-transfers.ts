import type { Portfolio, TokenBalance } from "@/lib/server/alchemy";
import type { ReceiptLog } from "@/lib/meme/delivery";

// Moves a portfolio by what a receipt says the wallet paid and received, so
// the balance on screen is right the moment the receipt lands instead of
// after the first successful re-read. Only rows the portfolio already lists
// move; a coin the wallet did not hold before is left for the read that
// follows, because a row needs a symbol, decimals and a price to be shown.
// Native value moved by the transaction is not in these logs and is left to
// the read as well.

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topicAddress(topic: `0x${string}`): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

// Net movement per token contract for one wallet: credits add, debits take.
export function walletDeltas(logs: readonly ReceiptLog[], wallet: string): Map<string, bigint> {
  const me = wallet.toLowerCase();
  const deltas = new Map<string, bigint>();
  for (const log of logs) {
    if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
    if (!/^0x[0-9a-fA-F]{64}$/.test(log.data)) continue;
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    if (from !== me && to !== me) continue;
    const token = log.address.toLowerCase();
    const value = BigInt(log.data);
    const signed = (to === me ? value : 0n) - (from === me ? value : 0n);
    deltas.set(token, (deltas.get(token) ?? 0n) + signed);
  }
  return deltas;
}

function moved(row: TokenBalance, delta: bigint): TokenBalance {
  const raw = BigInt(row.rawBalance) + delta;
  const rawBalance = raw < 0n ? 0n : raw;
  const balance = Number(rawBalance) / 10 ** row.decimals;
  return { ...row, rawBalance: rawBalance.toString(), balance, valueUsd: balance * row.priceUsd };
}

export function applyTransfers(
  portfolio: Portfolio,
  input: { network: string; wallet: string; logs: readonly ReceiptLog[] }
): Portfolio {
  const deltas = walletDeltas(input.logs, input.wallet);
  if (deltas.size === 0) return portfolio;
  let changed = false;
  const tokens = portfolio.tokens.map((row) => {
    if (row.network !== input.network || !row.address) return row;
    const delta = deltas.get(row.address.toLowerCase());
    if (!delta) return row;
    changed = true;
    return moved(row, delta);
  });
  if (!changed) return portfolio;
  return { totalUsd: tokens.reduce((sum, t) => sum + t.valueUsd, 0), tokens };
}
