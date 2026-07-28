export function parseMoney(value: string): number {
  return parseFloat(value.replace(/[$,¢%]/g, ""));
}

export function formatQty(n: number): string {
  return n >= 1000
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
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
