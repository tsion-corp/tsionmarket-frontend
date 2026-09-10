// Which vault service paths the same-origin proxy (app/api/vault) forwards.
//
// Only the public reads. `games` and `games/:id` are the v4 multi-game reads
// (the lobby and one game); `game/...` carries the feeds that stayed singular,
// winners and activities; `config` is the contract's tunables and
// `players/:address` a wallet's pending payout, both read from the chain by
// the service so the browser never has to. Anything else, including the
// service's own health and docs, is not ours to expose.

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isProxiedVaultRead(joined: string): boolean {
  if (joined === "games" || joined === "config") return true;
  if (/^games\/\d+$/.test(joined)) return true;
  if (joined.startsWith("game/")) return true;
  const player = /^players\/(.+)$/.exec(joined);
  return player !== null && ADDRESS.test(player[1]);
}
