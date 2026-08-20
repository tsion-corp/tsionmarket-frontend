export function parseMoney(value: string): number {
  return parseFloat(value.replace(/[$,¢%]/g, ""));
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

function subscript(count: number): string {
  return String(count)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
}

// Amounts below a thousandth, with their run of leading zeros counted rather
// than spelled out: 0.0000000000000001751 reads 0.0₁₅1751. The convention every
// DEX front-end uses, and the only one that stays a fixed width — a memecoin
// price runs to fourteen characters and dust reaches twenty-one, either of which
// shoves whatever sits beside it out of the row.
//
// Returns null above the threshold, where the zeros still read at a glance, so
// callers keep their own formatting for ordinary amounts.
export function subscriptZeros(value: number, digitsKept = 4): string | null {
  if (!Number.isFinite(value) || value <= 0 || value >= 0.001) return null;
  // Read the exponent back from the rounded mantissa: rounding 9.9999e-5 up
  // carries it to 1.000e-4, and deriving the zero count from the input instead
  // would name one zero too many.
  const [mantissa, exponent] = value.toExponential(digitsKept - 1).split("e");
  const zeros = -Number(exponent) - 1;
  if (zeros < 3) return null;
  const digits = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  return `0.0${subscript(zeros)}${digits}`;
}

export function formatQty(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const plain = n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  // Satoshi-scale balances (e.g. a few dollars of BTC) round to a bare "0" at
  // 4dp, which reads as a missing quantity rather than a tiny one.
  return plain === "0" ? (subscriptZeros(n) ?? plain) : plain;
}

export function isUp(change: string): boolean {
  return !change.startsWith("-");
}

export function predictionPayout(stake: number, cents: string): string {
  return (stake / (parseMoney(cents) / 100)).toFixed(2);
}

export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Compact "time ago" for feed timestamps: "just now", "5m ago", "3h ago",
// "2d ago", then a short date once it's a week out. `now` is injectable so the
// output is deterministic in tests. Returns "" for an unparseable timestamp.
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
