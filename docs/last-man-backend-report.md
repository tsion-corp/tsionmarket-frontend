# Last Man Standing: backend status and what is still broken

Re-checked 16 August 2026, 01:50 UTC, after the backend reported the fixes
done, and again at 03:00 UTC after the redeploy. Every claim below was
verified against the live gateway, the live socket, or the chain, and every
section ends with the exact command or read to reproduce it.

**Game 7, played live at 03:24 UTC after the redeploy**, is the cleanest
evidence yet. Started at 03:24:07 (block 50030650), one wager at 03:24:49
(block 50030671, `WagerPlaced` fired), clock out at 03:25:49. It was settled at
03:26:13, 24 seconds after expiry, by the **frontend's own gasless settle**
(sender is the Alchemy bundler `0xe19635…0ce1`, not the keeper key
`0x83ba9a…dfb5`), and `GameSettled` fired with `toWinner 0.000201778…`. Ten
minutes later `GET /games/7` is `404`, `GET /game/activities` is `[]`, and
`GET /game/winners` is `[]`. So: the keeper did not settle a game that sat
expired for 24 seconds (item 2), and the indexer did not pick up a start, a
wager and a settlement that all happened after the redeploy (item 3).

**After the 03:00 redeploy:** the `500` on `GET /games/:id` is gone, but every
existing game (`/games/1` to `/games/6`) now returns `404 NOT_FOUND "Game not
found"`, so the chain fallback is still not reading the contract. The three
feeds are still `[]`. Nothing has moved on-chain since the settle burst (head
50029883, `nextGameId` still 7), so this is not indexer lag on new events: the
six starts and six settlements from 14 and 15 August are still not indexed.

Contract: v4 vault on Base (chain 8453), proxy
`0x202Af4dB1F742782709873040Afd6c99190E2684`, implementation
`0x0a2ae0d51ca7ec1b0bb18eee0feba64c0a5cdc07` (EIP-1967 slot). Chain head at
the time of the check: block 50027830.

Gateway: `https://api.worldstreetwebservices.com/v1/world-street-vault`.
Socket: `wss://ws.worldstreetwebservices.com/`, topic `vault:king-of-night`.

## Summary

| #   | Item                                                                  | Status                              |
| --- | --------------------------------------------------------------------- | ----------------------------------- |
| 1   | Settle games 1–6                                                      | **Done**                            |
| 2   | Settler running in the keeper                                         | **Not shown**, one-off burst only   |
| 3   | Indexer watching the proxy and backfilled; feeds return rows          | **Not done**, every feed still `[]` |
| 4   | `GameStarted` ABI corrected; canonical ABI published; source verified | **Partly done**, ABI published      |
| 5   | `GET /games/:id` returns the game                                     | **Done** (18:52 UTC re-check)       |
| 6   | Index `GameSettled` and `WagerPlaced`                                 | **Not done**, both events exist     |
| 7   | Socket frames confirmed                                               | **Hub up; no frame ever observed**  |
| 8   | Contract parameters in the API docs                                   | **Not received**                    |

One of eight is done. It is the one that mattered most, the winners have been
paid. Everything the frontend reads from the service is still empty or
erroring, so the app is still running entirely on its own chain reads (see the
last section). Items 3 and 5 are the ones blocking production; 2 is the one
that will lose money next.

---

## 1. Settling games 1–6: done

All six games are settled and paid. Each settle emitted a `GameSettled` event
(see item 6) whose amounts match `previewSplit` to the wei.

```
game 1 | block 50022603 2026-08-15T22:55:53Z | tx 0x95d6b2b73b222ea66225cc71235738a662955cfaa6f9d864e750df0a79fcb47a | pot 0.000201719927805499 winner 0.000100859963902749 treasury 0.000080687971122201 starter 0.000020171992780549
game 3 | block 50022605 2026-08-15T22:55:57Z | tx 0x07d0f0c4f4816b85e6ce2329547cffa62d0aebdb29c1298f396782d09f4e2d5b | pot 0.000202282599437867 winner 0.000101141299718933 treasury 0.000080913039775148 starter 0.000020228259943786
game 5 | block 50022607 2026-08-15T22:56:01Z | tx 0xed3414bf3e9f756c2568e32b339c47fe6f40ca0f1f7b60d22501dfa5b757a6ba | pot 0.000202818104184457 winner 0.000101409052092228 treasury 0.000081127241673784 starter 0.000020281810418445
game 2 | block 50022625 2026-08-15T22:56:37Z | tx 0xaf24ab64ec512e8d0054b799af9673fb0384f098cb470f024fb433bc3791e03a | pot 0.000201544467073998 winner 0.000100772233536999 treasury 0.000080617786829600 starter 0.000020154446707399
game 4 | block 50022633 2026-08-15T22:56:53Z | tx 0xee0f4f92d9fd89d3ec802bc582bab1e968757f7c646cc6c0a09c4ce043dfba88 | pot 0.000202582392391431 winner 0.000101291196195715 treasury 0.000081032956956573 starter 0.000020258239239143
game 6 | block 50022634 2026-08-15T22:56:55Z | tx 0xf4f9a86c229a9807fd742dfe6f7d1500e7322af197f64559aa71a56ee7d3a475 | pot 0.000201979398101393 winner 0.000100989699050696 treasury 0.000080791759240558 starter 0.000020197939810139
```

All six from `0x83ba9add556308aa5695658cecd9aa09aa91dfb5`. After settlement
the contract balance is `0` and `pendingWithdrawals(0x6Fe0c92D…877F) = 0`, so
the contract pushes payouts on settle rather than leaving them to `claim()`.
Good to know, and worth a line in the docs (item 8).

Reproduce: `games(1..6)` returns `settled = true`; `eth_getBalance(proxy)` is
`0`; `eth_getLogs` on the proxy for topic0
`0xc5e5d8e57acbb6c994ff73f732415a546127b8ce4386d608a2d8b92a521048d3` returns
the six logs above.

---

## 2. Settler in the keeper: not shown

The six settles landed in a 31-block window (50022603 to 50022634, 62 seconds)
starting 29 hours after game 1 ended and 5.5 hours after game 6 ended, in the
order 1, 3, 5, 2, 4, 6. That is a script run by hand, not a keeper watching the
clock. Nothing has touched the contract since block 50022634.

There is no expired-but-unsettled game to test against right now, so this
cannot be confirmed from outside. To close it: start a game, let its 60 seconds
run out, and show that `settle(id)` lands without anyone opening the page.
Until then, assume the next winner who closes their tab is not paid and the
treasury does not collect.

What the keeper has to do, every few seconds or on each new block:

- read `nextGameId`
- for each unsettled game in the tail with `block.timestamp >= endTime`,
  send `settle(id)` (permissionless, selector `0x8df82800`)
- once mined, publish `gameSettled` on the socket (item 7)

Reproduce the finding: `eth_getLogs` on the proxy from block 50022634 to
latest returns nothing.

---

## 3. Indexer and feeds: not done, every feed is still empty

Every read endpoint returns an empty list, before and after the redeploy.
Called at 01:49 UTC and again at 02:58 UTC with the same result:

```
GET /games                        200  {"success":true,"data":{"games":[]}}
GET /games?limit=50               200  {"success":true,"data":{"games":[]}}
GET /games?status=all             200  {"success":true,"data":{"games":[]}}
GET /game/winners                 200  {"success":true,"data":{"winners":[]}}
GET /game/winners?limit=50        200  {"success":true,"data":{"winners":[]}}
GET /game/activities              200  {"success":true,"data":{"activities":[]}}
GET /game/activities?limit=50     200  {"success":true,"data":{"activities":[]}}
```

`/games` being empty is correct today, no game is live. `/game/winners` and
`/game/activities` being empty is not. The chain has, since deployment at
block 49926095:

- six `GameStarted` logs (blocks 49969541, 49969995, 49971338, 49971378,
  49971627, 50012874), the oldest 32 hours old
- six `GameSettled` logs (blocks 50022603 to 50022634), 3 hours old

so the winners feed should have six rows and the activity feed at least twelve
(six starts, six settlements). The indexer is not seeing this contract.

Check, in this order:

1. **The address the indexer watches.** It must be
   `0x202Af4dB1F742782709873040Afd6c99190E2684`, the proxy. Logs are emitted
   under the proxy address, not the implementation. The frontend `.env` was
   pointed at the v3 contract until three days ago; the indexer may be too.
2. **The `GameStarted` topic** (item 4). Filtering `eth_getLogs` by the wrong
   signature returns zero logs, which looks exactly like "no games".
3. **The start block.** Backfill from 49926095.
4. **The RPC.** The public Base RPC caps `eth_getLogs` at 10,000 blocks and
   returned `over rate limit` (`-32016`) to me after four `eth_call`s in a
   row. If the indexer is on it, it is silently failing. Use a paid endpoint.

Reproduce:

```
curl -s https://api.worldstreetwebservices.com/v1/world-street-vault/game/winners
curl -s https://api.worldstreetwebservices.com/v1/world-street-vault/game/activities
```

---

## 4. ABI and verification: ABI published, Basescan still blank

**Update, 16 August 02:00 UTC.** The implementation is now an exact match on
Sourcify, and the API doc points at the compiled artifact
(`apps/world-street-vault/src/chain/king-of-night-abi.json`). That closes the
part that mattered: the frontend now imports the artifact
(`features/casino/lib/last-standing/king-of-night-abi.ts`, generated from
`https://sourcify.dev/server/v2/contract/8453/0x0A2AE0D51ca7eC1b0bB18eee0FeBA64c0A5CdC07?fields=abi`)
and hand-types nothing. Note that the Sourcify **v1** repository URL in the API
doc (`repo.sourcify.dev/contracts/full_match/...`) returns `503 API v1
Brownout`; link the v2 URL above instead.

Still open here:

- Basescan shows no source for `0x0a2ae0d5…dc07`. Verify there too; it is where
  a player who clicks a transaction link ends up.
- Whether the **service's own** `GameStarted` ABI was corrected still cannot be
  seen from outside while the index returns nothing (item 3). For the record,
  the field the doc calls `pot` is the third data word:

```
event GameStarted(uint256 indexed gameId, address indexed starter, uint256 minWager, uint256 pot, uint256 endTime)
topic0 0xd638ae86679fdf64b28c14eae71d8facbf04f828463fdc2c9f0bf05089ef98e5
```

The four-field `(…, uint256 minWager, uint64 endTime)` in the old frontend
guide hashes to a topic that matches no log.

---

## 5. `GET /games/:id`: done

**Re-checked 16 August, 18:52 UTC.** Fixed. `/games/1`, `/games/7` and
`/games/8` return `200` with the full game object, and every field matches
the contract: game 8 reports `endTime 1786893739`, `settled: true`,
`pot 0.0002018227783561 ETH`, exactly what `games(8)` reads on-chain.
`/games/9` (`nextGameId` is 9) is a clean `404 NOT_FOUND`, `/games/abc` a
`400`. The frontend keeps reading the contract for its own hot path (a game
the user just started is not indexed yet), and can now trust this endpoint
for everything else.

The two earlier states, for the record: `500 INTERNAL_ERROR` at 01:49 UTC
(request id `d747f764-31de-4d43-9270-74baa711c451`), then `404` for real
games at 03:00 UTC after the first redeploy.

## 6. Events: both exist, neither is indexed

**Resolved by the published ABI.** The contract emits a log for every player
action:

```
event GameStarted(uint256 indexed gameId, address indexed starter, uint256 minWager, uint256 pot, uint256 endTime)
event WagerPlaced(uint256 indexed gameId, address indexed player, uint256 amount, uint256 newPot, uint256 newEndTime)
event GameSettled(uint256 indexed gameId, address indexed winner, address indexed starter, uint256 pot, uint256 toWinner, uint256 toTreasury, uint256 toStarter)
event PayoutFallback(address indexed to, uint256 amount)
event Claimed(address indexed who, uint256 amount)
```

So the earlier ask for a contract upgrade is withdrawn: nothing needs adding.
`WagerPlaced` has simply never fired, because nobody has ever wagered on this
contract (all six games have `king == starter`, pot equal to the opening
stake, and `eth_getLogs` for its topic returns zero rows). `GameSettled` has
fired six times (item 1) and its amounts match `previewSplit` to the wei.

What is still not done is indexing them: `/game/winners` should be built from
`GameSettled` (it carries the settle tx, the winner, the starter and all three
amounts) and `/game/activities` should carry `started`, `joined` and `won` rows
from the three events. Today both endpoints return `[]` (item 3).

The frontend now reads all three events itself for the recent window (about
5.5 hours of blocks) and shows starts, joins and wins in the activity feed, and
links each Hall of Winners row to its `settle()` transaction where the log is
in reach. Beyond that window it is the index's job.

Every log the proxy has produced, grouped by topic, now all named from the ABI:

```
0xd638ae86…  x6   GameStarted
0xc5e5d8e5…  x6   GameSettled
0xc7f505b2…  x1   Initialized(uint64)
0xbc7cd75a…  x1   Upgraded(address)
0x0de9f81d…  x3   MinStartStakeSet(uint256,uint256)     0.001 -> 0.0003 -> 0.0002 ETH
0xd8e39828…  x2   TimerDurationSet(uint256,uint256)     300 -> 60 s
0x9dcc542e…  x1   SplitSet(uint16,uint16,uint16)        5000 / 1000 / 4000
0xb532073b…  x1   TreasurySet(address,address)
0x21eb5487…  x1   OwnerChanged(address,address)
```

Two more things the ABI settled, worth a line in the docs (item 8): the revert
for wagering on a finished game is `GameOver(uint256 gameId)` (the frontend
guide's `AlreadySettled()` is what `settle()` throws on a settled game, and it
takes the id), and `settle()` pushes payouts, with `PayoutFallback` +
`pendingWithdrawals` only for a transfer that fails.

---

## 7. Socket: hub up, frames never observed

The hub answers and subscribes:

```
-> {"type":"subscribe","topics":["vault:king-of-night"]}
<- {"type":"welcome","data":{"ok":true},"timestamp":1786844349510}
<- {"type":"subscribed","data":{"topics":["vault:king-of-night"]},"timestamp":1786844349750}
```

and then nothing, which is expected with no game live. No game frame of any
kind has ever been observed on this topic. The frames the client handles:

| `type`        | `data`                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `activeGames` | `{ games: VaultGame[] }`, the full lobby snapshot (replaces, not merges)                                                              |
| `gameStarted` | `{ gameId: number, starter: string, minWagerWei: string, potWei: string, endTime: number }`                                           |
| `wagerPlaced` | `{ gameId: number, player: string, amountWei: string, newPotWei: string, newEndTime: number }`                                        |
| `gameSettled` | `{ gameId: number, winner: string, starter: string, potWei?, toWinnerWei?, toTreasuryWei?, toStarterWei?, transactionHash?: string }` |

`endTime` / `newEndTime` are unix seconds. Wei amounts are decimal strings.
The API doc says `gameSettled` carries "split amounts"; please give the exact
field names, the client accepts the ones above and ignores anything extra.
The hub does not replay state on subscribe, so the client resyncs over REST
on every reconnect; that resync is item 3.

To close this: with the indexer live, start one game and capture the frames
the hub sends for the start, one wager, and the settle. Paste them into the
reply and I will confirm the shapes against the client.

Reproduce: any WebSocket client, send the subscribe frame above.

---

## 8. Parameters in the API docs: not received

Each of these was learned by reading the chain and should be in the docs the
frontend reads:

- Round length is **60 s** (changed on-chain at block 49970438 from 300 s; the
  spec sent to the frontend still says five minutes).
- `minStartStake` is **0.0002 ETH** (changed twice since deployment).
- Split is **50 / 10 / 40** winner / starter / treasury (5000 / 1000 / 4000
  bps).
- `settle(uint256)` selector `0x8df82800`, permissionless.
- `wager(uint256)` selector `0xb76b0b99`; `startGame()` `0xd65ab5f2`;
  `claim()` `0x4e71d92d`.
- Payouts are pushed on settle; `pendingWithdrawals` / `claim()` is the
  fallback path, not the normal one.
- The proxy uses the EIP-1967 implementation slot.
- The gateway rate limit is 1000 requests / 60 s per key
  (`RateLimit-Policy: "gateway-default"; q=1000; w=60`); the frontend proxies
  every user through one server IP and caches, so this number matters.

---

## What the frontend does meanwhile

Shipped in frontend PR #210. It is what makes the game playable while the
service returns nothing, and it moves back to the service as each item lands.

| Concern             | Frontend today                                                                                                                             | Should be                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Settling a won game | Winner's client calls `settle()` at the reveal; any visitor to a finished game's page can settle it                                        | Keeper settles every expired game within seconds (item 2) |
| Lobby               | Multicall `getGameStatus` over the last 20 ids, merged with `GET /games`                                                                   | `GET /games`                                              |
| Winners             | Multicall `games()` over the last 20 ids, `previewSplit` for payouts, merged with `GET /game/winners`. Shows the six settled games today.  | `GET /game/winners`                                       |
| Activity            | `GameStarted` logs from the last 10k blocks with block timestamps, merged with `GET /game/activities`; joins and settlements are not shown | `GET /game/activities`, including joins                   |
| Single game         | Contract read                                                                                                                              | `GET /games/:id` (item 5)                                 |

These are bounded on purpose: 20 games of history, about 5.5 hours of
activity, one RPC round trip per user per poll. Anything beyond that is empty
until the service fills it. Also fixed on the frontend side while doing this:
the claim path was reading `pendingWinnings()`, a v3 name v4 does not have, so
a fallback credit could never have been collected; it now reads
`pendingWithdrawals()` from the artifact.

---

## Checklist

Status as of 16 August 2026, 03:00 UTC, after the redeploy.

- [x] 1. `settle()` games 1–6
- [ ] 2. Settler running in the keeper (games 7 and 8 were both settled by the frontend's own client, 24 s and 6 s after expiry; the keeper key `0x83ba9a…dfb5` has not sent a transaction since the 15 Aug burst)
- [ ] 3. Indexer watching `0x202Af4dB…2684`, backfilled from 49926095; `/game/winners` and `/game/activities` return rows (both still `[]` at 18:52 UTC with eight settled games on-chain, two of them played after the redeploys)
- [x] 4a. Compiled ABI published; Sourcify exact match
- [ ] 4b. Basescan verification; service's own `GameStarted` ABI confirmed correct
- [x] 5. `GET /games/:id` returns the game (fixed by 18:52 UTC; matches the chain field for field)
- [ ] 6. `GameSettled` and `WagerPlaced` indexed (both exist; the upgrade ask is withdrawn)
- [ ] 7. Socket frames captured on a real game and confirmed against the table
- [ ] 8. Parameters, payout behaviour, `GameOver` vs `AlreadySettled`, and the `gameSettled` frame's field names in the API docs
