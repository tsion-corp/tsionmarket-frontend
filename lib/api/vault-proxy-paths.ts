// Which vault service paths the same-origin proxy (app/api/vault) forwards.
//
// Only the public reads. `games` and `games/:id` are the v4 multi-game reads
// (the lobby and one game); `game/...` carries the feeds that stayed singular,
// winners and activities; `config` is the contract's tunables and
// `players/:address` a wallet's pending payout, both read from the chain by
// the service so the browser never has to. Anything else, including the
// service's own health and docs, is not ours to expose.

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export function isProxiedVaultRead(joined: string): boolean {
  if (joined === "games" || joined === "config") return true;
  if (/^games\/\d+$/.test(joined)) return true;
  // One game's own feed. v5 splits this out of the global `game/activities`.
  if (/^games\/\d+\/activities$/.test(joined)) return true;
  if (joined.startsWith("game/")) return true;
  // What a transaction we sent turned out to be. This is what replaces polling
  // a receipt and decoding GameStarted to learn our own gameId.
  const tx = /^transactions\/(.+)$/.exec(joined);
  if (tx !== null) return TX_HASH.test(tx[1]);
  const player = /^players\/(.+)$/.exec(joined);
  return player !== null && ADDRESS.test(player[1]);
}

/**
 * The one path the proxy forwards a POST to: handing the service a hash the
 * wallet just sent, so it can report back what the transaction did.
 *
 * Nothing else is writable through this proxy. The game's real writes are
 * transactions from the player's own wallet, which never pass through here,
 * and the admin surface is not ours to expose.
 */
export function isProxiedVaultWrite(joined: string): boolean {
  return joined === "transactions";
}
