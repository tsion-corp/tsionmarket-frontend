import { keccak256, toHex, type Log } from "viem";

// What a swap delivered, read from the receipt the send already holds instead
// of two balance reads around it. An ERC-20 emits Transfer(from, to, value)
// for every credit, and a user operation's receipt lists only that
// operation's own logs, so the sum of transfers of the bought token into the
// wallet is exactly what this swap paid out.

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

export type ReceiptLog = Pick<Log, "address" | "topics" | "data">;

function topicAddress(topic: `0x${string}`): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

// Null when there are no logs to read (a send that did not come back with a
// receipt); zero when the receipt shows nothing arriving.
export function receivedFromLogs(
  logs: readonly ReceiptLog[] | null,
  token: `0x${string}`,
  wallet: `0x${string}`
): bigint | null {
  if (logs === null) return null;
  let total = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
    if (topicAddress(log.topics[2]) !== wallet.toLowerCase()) continue;
    if (!/^0x[0-9a-fA-F]{64}$/.test(log.data)) continue;
    total += BigInt(log.data);
  }
  return total;
}

// Base units to a display string, four decimals at most, no trailing zeros.
export function formatReceived(amount: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = amount / unit;
  const frac = (amount % unit).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toLocaleString()}${frac ? `.${frac}` : ""}`;
}
