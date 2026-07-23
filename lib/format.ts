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
