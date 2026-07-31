# Casino gateway contract

The casino frontend is built against this contract. Every screen already calls
it; nothing is stubbed and there are no fixtures in the UI. Until a gateway
answers, the screens show their "not available yet" state.

Set `NEXT_PUBLIC_CASINO_API_URL` to the gateway base URL and, if the gateway
requires one, `CASINO_API_KEY` to the service key. The key is read server-side
only and never reaches the browser.

## Transport

All traffic goes through the frontend's own proxy at `/api/casino/*`, which
forwards to `${NEXT_PUBLIC_CASINO_API_URL}/*`. The proxy:

- rejects every write from a caller without a verified Privy session (401)
- forwards the caller as `x-user-id` and the originating IP as
  `x-forwarded-for`, so the gateway authorises and rate-limits per user
- attaches `authorization: Bearer ${CASINO_API_KEY}` when configured
- caches public GETs for 3s to collapse concurrent polls; per-caller GETs are
  never cached

Every response uses the platform envelope:

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "INSUFFICIENT_BALANCE", "message": "…" } }
```

Error codes the UI branches on: `NOT_CONFIGURED`, `UNAUTHORIZED`, `NOT_FOUND`,
`INSUFFICIENT_BALANCE`, `ODDS_MOVED`, `ILLEGAL_MOVE`, `ROUND_CLOSED`,
`UPSTREAM_ERROR`. Anything else renders as a generic failure.

## Money

Amounts are always:

```json
{ "wei": "50000000000000000", "tokenSymbol": "ETH", "usdValue": 100.0 }
```

`wei` is authoritative and exact. `usdValue` is for display only. The draw and
spectator betting settle in the same asset the player already holds on Base, so
a stake spends the balance the dashboard shows and winnings land back in it.
Those games have no float and never ask a player to fund a casino wallet.

Chess is the exception, and this line used to claim otherwise. Its service runs
a backend-custody USDC cashier with its own balance, which a player funds and
withdraws from deliberately. See `docs/chess-backend.md`.

The platform takes a **5% participation fee from the pot** on settlement. The
frontend shows this breakdown before a player commits; the gateway must apply
the same arithmetic on integers.

## Endpoints

### Hub

| Method | Path                      | Auth   | Returns                        |
| ------ | ------------------------- | ------ | ------------------------------ |
| GET    | `/hub/recent-wins?limit=` | public | `{ wins: RecentWin[] }`        |
| GET    | `/hub/presence`           | public | `{ presence: GamePresence[] }` |

`RecentWin.playerHandle` must already be masked by the gateway (`8***7`). The
frontend never receives another player's identity.

`GamePresence.game` matches the catalogue ids in `lib/casino/games.ts`:
`chess`, `draw`, `last-standing`.

### Chess

Chess moved to its own service with its own contract, including a stake cashier
this document does not cover. See `docs/chess-backend.md`. Nothing under
`/chess/*` on the casino gateway is called any more.

### Spectator betting

| Method | Path                                     | Auth    | Returns                   |
| ------ | ---------------------------------------- | ------- | ------------------------- |
| GET    | `/betting/markets/:matchId/odds`         | public  | `MarketOdds`              |
| GET    | `/betting/markets/:matchId/odds/history` | public  | `{ points: OddsPoint[] }` |
| GET    | `/betting/bets?matchId=`                 | session | `{ bets: BetSlip[] }`     |
| POST   | `/betting/bets`                          | session | `BetSlip`                 |

Spectators stake from the same platform balance as players. The server prices
the market: the client never computes a payout it then asks to be paid.

`POST /betting/bets` carries `expectedOdds`, the price the user was shown. If
the live price has moved beyond tolerance, reject with `ODDS_MOVED` rather than
filling at a worse number. On success, escrow the stake and return the slip
with `lockedOdds` — settlement pays against that, not the price at match end.

Bets settle automatically when the match resolves, crediting the winner's
platform balance.

### Draw

| Method | Path                      | Auth    | Returns                     |
| ------ | ------------------------- | ------- | --------------------------- |
| GET    | `/draw/rounds/current`    | public  | `DrawRound`                 |
| GET    | `/draw/results?limit=`    | public  | `{ results: DrawResult[] }` |
| GET    | `/draw/entries`           | session | `{ entries: DrawEntry[] }`  |
| POST   | `/draw/entries`           | session | `{ entries: DrawEntry[] }`  |
| POST   | `/draw/entries/:id/claim` | session | `DrawEntry`                 |

`DrawRound.closesAt` is an ISO timestamp, not a seconds countdown: the client
derives the timer from it so a reload or a slept tab shows the true time left.

Winning numbers come from the server's published draw. The client only submits
picks and reads results — it never generates a draw.

Buying entries charges the caller's balance and must reject with
`ROUND_CLOSED` once the round is no longer `open`.

## Types

The authoritative TypeScript definitions live in
[`lib/casino/api/types.ts`](../lib/casino/api/types.ts). Treat that file as the
schema; it is what the UI is compiled against.

## What the frontend guarantees

- No mock data. Every figure on screen comes from this API.
- Stakes are checked against the player's real balance before submission, and
  the exact wei amount is sent — never a rounded dollar figure.
- Loading, empty and error states exist on every screen, including a distinct
  state for a gateway that isn't configured yet.
- The client never decides a game outcome, a payout, or an odds price.
