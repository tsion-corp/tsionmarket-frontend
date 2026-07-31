# Chess service contract

The chess frontend is built against this contract. Every screen calls it;
nothing is stubbed and there are no fixtures in the UI. Until the service
answers, the screens show their "not available yet" state.

Set `NEXT_PUBLIC_CHESS_API_URL` to the gateway base path, e.g.
`https://api.worldstreetwebservices.com/v1/chess`. Unset, every chess screen
reads as not configured.

## Transport

All traffic goes through the frontend's own proxy at `/api/chess/*`, which
forwards to `${NEXT_PUBLIC_CHESS_API_URL}/*`. The proxy:

- serves public reads (lobby, board, moves, PGN, tournaments) without a session
  and caches them for 1s, so two players watching one board collapse into a
  single upstream call
- requires a verified Privy session for every write
- requires a verified session for every `cashier/*` read, and never caches one:
  a balance is per-caller
- names the acting player from the session rather than from the request body

Every response uses the platform envelope:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "CONFLICT", "message": "it is not your turn" } }
```

Error codes the UI branches on: `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`,
`FORBIDDEN`, `INTERNAL_ERROR`, plus `UNAUTHORIZED` and `NOT_CONFIGURED` from the
proxy itself. Anything else renders as a generic failure.

## Identity, and why money is stricter

The service does no token verification. It acts on the `player`, `creator` and
`organizer` names it is handed, so the proxy is the trust boundary.

For game actions the proxy overwrites those names with the wallet the session
provably owns, when it can establish one. That needs a Privy identity token,
which is optional and can be cold on first load. When it is missing the client's
own claim stands, because a chess move is not worth blocking play over.

**Money is different.** `POST /cashier/withdrawals` takes
`{ player, amountUsdc, toAddress }`: a forged `player` there sends somebody
else's balance to an address of the attacker's choosing. So for

- anything under `cashier/`
- any request whose body carries a stake or an entry fee above zero

the proxy requires a wallet it can prove, and answers `401 UNAUTHORIZED`
otherwise. On those paths it also derives the swiss `organizer` and `name`
tokens from that wallet, and overwrites `walletAddress` so a refund can only go
to the session's own wallet.

Swiss names are **not** rewritten on free tournaments: a player picks their own
token there, and rewriting it would rename entrants out of tournaments they had
already joined.

The rules live in `lib/casino/chess-identity.ts`, free of Next and of fetch, and
are covered by `__tests__/chess-identity.test.ts`.

## Money

The cashier is **backend custody**, not an on-chain escrow: the service holds
one Base wallet and one internal ledger. This is a real difference from the
vault game, where the user's own wallet signs, and every screen that shows a
chess balance says the service holds it.

Amounts cross the wire as decimal strings (`"10"`, `"9.5"`) and are exact
integer micro-USDC (six decimals) everywhere inside the app. No float touches a
stake, a fee or a balance. See `lib/casino/cashier-money.ts`; do not reuse
`lib/casino/money.ts`, whose `STAKE_DECIMALS` is 18 for the ETH-settled draw.

`feeBps` comes from `GET /cashier/config` and is never hardcoded. The fee is
floored, so any rounding remainder goes to the winner and `fee + payout` always
equals the pot exactly.

**When the cashier is off** the service answers `409 CONFLICT "cashier is not
configured"`. That is a deployment without a cashier, not a fault: it reads as
`enabled: false` and every staking affordance disappears. A chess deployment
with no cashier shows no money anywhere, which
`__tests__/casino-screens.test.tsx` pins.

## Endpoints

### Cashier

| Method | Path                                | Auth          | Returns                 |
| ------ | ----------------------------------- | ------------- | ----------------------- |
| GET    | `/cashier/config`                   | session       | `CashierConfigResponse` |
| GET    | `/cashier/players/{player}/balance` | session       | `PlayerBalanceResponse` |
| POST   | `/cashier/deposits/confirm`         | proven wallet | `DepositResponse`       |
| POST   | `/cashier/withdrawals`              | proven wallet | `WithdrawalResponse`    |

`POST /cashier/deposits/confirm` is idempotent: `txHash` is unique upstream and
re-confirming returns the row already credited. The frontend relies on that,
retrying the call and persisting the hash to `localStorage` before it is first
attempted. The gap between the transfer landing and the credit succeeding is the
one place money can be stranded, and that hash is the only proof of it.

Withdrawals are checked against `availableUsdc`, never `totalUsdc`: money locked
in a game in progress is not withdrawable.

### Matches

| Method | Path                          | Auth    | Returns              |
| ------ | ----------------------------- | ------- | -------------------- |
| GET    | `/matches?status=&limit=`     | public  | `{ items: Match[] }` |
| GET    | `/matches/{id}`               | public  | `Match`              |
| GET    | `/matches/{id}/moves`         | public  | `{ moves: Move[] }`  |
| GET    | `/matches/{id}/pgn`           | public  | `{ pgn: string }`    |
| GET    | `/players/{wallet}/matches`   | public  | `{ items: Match[] }` |
| POST   | `/matches`                    | session | `Match`              |
| POST   | `/matches/{id}/join`          | session | `Match`              |
| POST   | `/matches/{id}/moves`         | session | `{ match, move }`    |
| POST   | `/matches/{id}/resign`        | session | `Match`              |
| POST   | `/matches/{id}/draw-offer`    | session | `Match`              |
| POST   | `/matches/{id}/draw-response` | session | `Match`              |
| POST   | `/matches/{id}/claim-draw`    | session | `Match`              |
| POST   | `/matches/{id}/claim-timeout` | session | `Match`              |
| POST   | `/matches/{id}/abort`         | session | `Match`              |
| POST   | `/matches/{id}/rematch`       | session | `Match` (a new one)  |

**The server owns the game.** It holds the position, validates every move, runs
both clocks and decides the result. The client sends a move in coordinate
notation (`e2e4`, `e7e8q`) and renders whatever comes back. It computes
legal-move highlights locally only so the board feels responsive; those carry no
authority.

Match ids are UUIDs and are checked client-side before a request is spent on
them, because the gateway answers a malformed id with plain text rather than the
envelope.

Two service behaviours the frontend has to compensate for:

- **The service never ends a game on time.** A flag fall has to be claimed by the
  opponent, so the client claims automatically when a clock hits zero. That claim
  now retries up to three times: one dropped request used to leave the game
  `active` forever, which for a staked game means the money stays locked.
- **Rematch is not an invitation.** It opens a fresh one-seat game with the
  colours swapped and never tells the opponent, so the client watches the waiting
  list for a game the ex-opponent opened rather than opening a third.

`stake_usdc` on create is omitted entirely for a free game. Sending `"0"` would
make the service open a settlement row for nothing.

### Swiss tournaments

| Method | Path                      | Auth    | Returns         |
| ------ | ------------------------- | ------- | --------------- |
| GET    | `/swiss?status=&limit=`   | public  | `{ items: [] }` |
| GET    | `/swiss/{id}`             | public  | `Swiss`         |
| POST   | `/swiss`                  | session | `SwissSummary`  |
| POST   | `/swiss/{id}/join`        | session | `Swiss`         |
| POST   | `/swiss/{id}/withdraw`    | session | `Swiss`         |
| POST   | `/swiss/{id}/rounds/next` | session | `Swiss`         |

Withdrawing means two different things and the UI has to say which: **before
round one the entry fee is refunded; once the tournament has started it is
forfeited.** That distinction is the reason a player would act now rather than
later, so it is on the button itself, not buried in a tooltip.

`POST /swiss/{id}/rounds/next` pairs the round with a bundled engine. Without
one it answers `400 BAD_REQUEST` asking for `manualPairings`, which the frontend
treats as a request for input rather than a failure: it opens a pairings editor
that validates duplicates, self-pairings and unknown names before sending.

Swiss players are named by a token of 1 to 30 characters with no spaces. A
42-character address would be rejected, so `swissNameFor` shortens it to
`first6 + last4`. It is derived, never stored, so the same wallet is always the
same entrant.

## Live updates

The service holds no client sockets. It publishes frames to the WS gateway,
which the browser subscribes to at `NEXT_PUBLIC_WS_GATEWAY_URL` (falling back to
`NEXT_PUBLIC_VAULT_WS_URL`, which named the same gateway first).

Bootstrap with `GET /matches/{id}`, then subscribe to the `liveTopic` the
response carries. Do not rebuild that string client-side.

| Frame      | When                  | Payload                                        |
| ---------- | --------------------- | ---------------------------------------------- |
| `state`    | join, draw offer, end | a whole match                                  |
| `position` | a move is applied     | `{ fen, turn, ply, lastMove, clocks, status }` |
| `gameOver` | the match finishes    | `{ result, reason }`                           |

Polling runs at 2s while the socket is down and drops to 20s once it is up.

## Request body casing

Match bodies are **snake_case** (`initial_seconds`, `stake_usdc`); swiss bodies
are **camelCase** (`nbRounds`, `entryFeeUsdc`). This is the service's own split,
not ours. `lib/casino/api/chess.ts` and `swiss.ts` each match their own side.

## Known gaps

1. The deployed cashier answers `409 "cashier is not configured"`. Until the
   operator sets `CHESS_CASHIER_WALLET_ADDRESS` and
   `CHESS_CASHIER_WALLET_PRIVATE_KEY`, staking cannot be exercised end to end.
2. There are no player profiles. A wallet address doubles as a display name and
   `rating` is always 0.
3. There is no matchmaking queue. Quick match joins the oldest waiting game and
   opens one when every seat is taken.
