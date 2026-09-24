# Server-side Mixpanel events: integration brief and agent prompt

**Date:** 15 September 2026
**For:** the backend team, or an AI coding agent working in the backend (gateway services) repository
**Companion to:** [ADR-2026-09-22-mixpanel-frontend-tracking](./adr/ADR-2026-09-22-mixpanel-frontend-tracking.md), `ARK-TRACKING-PLAN-004`, `ARK-METRICS-SPEC-001`
**Mixpanel project:** 4051122
**Status:** proposal. Nothing is to be implemented until the ADRs in Part C step 2 are approved by a human.

This file has three parts:

- **Part A** explains the decision for people.
- **Part B** is the technical design.
- **Part C** is a prompt to hand to the implementing agent or developer, verbatim.

---

## Part A: the decision

### Should Mixpanel be added to the backend?

**Yes, for business records only, and not by calling Mixpanel inside request handlers.**

Today every Mixpanel event is sent from the user's browser. That works for behaviour (what people looked at, where they dropped off) but it cannot count money or accounts:

- A deposit that settles while the app is closed is never reported, or is reported as the wrong rail.
- A signup where the tab closes early has no event, although the account exists.
- A perp stop-loss, take-profit or liquidation runs on-chain via the keeper, so no browser ever sees it.
- Ad blockers drop 20-40% of browser events.
- Browser code can only report what the user typed, which is how sells ended up with token quantities in `amount_usd`.

The backend is where these records are written, so the backend is the only place that can report them completely and with the real figures.

### What goes where

| Kind of fact             | Sent from                                       | Examples                                                                                                                            |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Behaviour**            | Browser (stays as it is)                        | `page_view`, `add_funds_opened`, `trade_previewed`, `market_viewed`, `passkey_skipped`                                              |
| **Business records**     | Backend (new)                                   | `signup_completed`, `deposit_completed`, `withdraw_completed`, `trade_completed`, `kash_bought`, `game_result`, `perp_trade_closed` |
| **Authoritative totals** | The ledger and Privy, via the daily metrics job | Accounts, funded users, volume, revenue                                                                                             |

Mixpanel is still not the source of truth for totals. Server events make Mixpanel's funnels and cohorts accurate; the `daily_metrics` job still reads the ledger and Privy, as Desmond's spec requires.

### Why this shape does not affect the backend

- **Nothing in the request path calls Mixpanel.** Services write a small row into an outbox table, in the same transaction as the business record. A separate worker sends it later.
- **Mixpanel being down, slow or misconfigured cannot fail, slow or roll back a deposit, trade or signup.**
- **Everything is additive:** a new module, a new table, a new worker, a feature flag that defaults to off. No existing response, schema, route or behaviour changes.
- **It is rolled out one event at a time,** first into a separate test project, and only switched on for production after the numbers are checked against the ledger.

---

## Part B: technical design

### B1. Architecture

```
 ┌────────────────────────── Backend service (ramping, trade, kash, chess, perp, …) ──────────────────────────┐
 │                                                                                                             │
 │  business handler / settlement worker                                                                       │
 │     BEGIN TRANSACTION                                                                                       │
 │       write business record (order settled, trade filled, …)       ← existing code, unchanged              │
 │       analytics.emit(event, distinctId, props, sourceId)           ← one added line: INSERT into outbox    │
 │     COMMIT                                                                                                  │
 │                                                                                                             │
 └───────────────────────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                                 │ analytics_outbox table (pending rows)
                                                 ▼
 ┌──────────────────────────── analytics-forwarder (new worker, separate process or job) ──────────────────────┐
 │  loop: claim ≤ N pending rows (SKIP LOCKED) → validate against schema → batch → POST Mixpanel /import       │
 │        success → mark sent        4xx validation → mark rejected + log        5xx/429/timeout → retry w/ backoff │
 │        attempts > max → dead-letter + alert                                                                  │
 └───────────────────────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                                 ▼
                                   Mixpanel project (per environment)

 Privy ── user.created webhook ──► auth/provisioning service ──► analytics.emit("signup_completed", …)
 Chain indexer (deposits to static addresses, Last Man, keeper perp closes) ──► analytics.emit(…)
```

If the service cannot share a transaction with an outbox table (for example it only calls an external provider and stores nothing), emit **after** the record is confirmed, still into the outbox, never directly to Mixpanel.

If the backend already has an event bus or message queue (Kafka, SQS, NATS, Redis streams, BullMQ, domain events), the forwarder should subscribe to the existing domain events instead of adding an outbox. Reuse beats a second mechanism. The agent must check this first.

### B2. The emitter interface

One module, used by every service. Language-neutral contract; TypeScript shown for illustration only.

```ts
// analytics/emit.ts: adapt to the backend's language and DB layer
export interface AnalyticsEmit<E extends ServerEventName> {
  event: E;
  /** EIP-55 checksummed EVM address; the same string the web app identifies with. */
  distinctId: string;
  /** The business record's own id: order id, tx hash, swap id, Privy user id. */
  sourceId: string;
  /** When the business fact happened, not when it was emitted. */
  occurredAt: Date;
  properties: ServerEvents[E];
}

/**
 * Writes one row to analytics_outbox using the caller's transaction.
 * Never makes a network call. Validates the payload against the schema and
 * throws only on a programming error (unknown event, wrong property type) in
 * non-production; in production logs and records a rejected row instead, so a
 * misspelt property can never roll back a deposit.
 */
export function emit<E extends ServerEventName>(
  tx: Transaction,
  input: AnalyticsEmit<E>
): Promise<void>;
```

Call site, as a one-line addition next to existing code:

```ts
await db.transaction(async (tx) => {
  await markOrderSettled(tx, order); // existing
  await analytics.emit(tx, {
    // added
    event: "deposit_completed",
    distinctId: toChecksum(order.walletEvm),
    sourceId: order.id,
    occurredAt: order.settledAt,
    properties: {
      method: "bank",
      amount_usd: order.amountUsdc,
      amount_ngn: order.amountNgn,
      fx_rate: order.appliedRate,
      provider: order.providerName,
      order_id: order.id,
    },
  });
});
```

### B3. Outbox table

```sql
CREATE TABLE analytics_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_name      TEXT        NOT NULL,
  distinct_id     TEXT        NOT NULL,
  insert_id       CHAR(32)    NOT NULL,      -- deterministic, see B5
  occurred_at     TIMESTAMPTZ NOT NULL,
  properties      JSONB       NOT NULL,
  schema_version  INTEGER     NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',  -- pending | sent | rejected | dead
  attempts        INTEGER     NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  UNIQUE (event_name, insert_id)                        -- makes emit idempotent on retries
);
CREATE INDEX analytics_outbox_pending ON analytics_outbox (next_attempt_at) WHERE status = 'pending';
```

- `INSERT … ON CONFLICT (event_name, insert_id) DO NOTHING`, so a retried settlement handler cannot create a second event.
- Retention: delete `sent` rows older than 30 days; keep `rejected` and `dead` for 90 days.
- Adapt to the backend's database (the shape matters, not the dialect). A migration that only creates a table is additive.

### B4. The forwarder

- Runs as its own process, cron job or queue consumer, never inside an API request.
- Claims rows with `FOR UPDATE SKIP LOCKED` (or the queue's equivalent) so several instances are safe.
- Sends in batches to Mixpanel's **Import API**: `POST https://api.mixpanel.com/import?strict=1&project_id=<id>` (the US host, which is the region project 4051122 is stored in), authenticated with a **service account** (HTTP Basic, `username:secret`), gzip body.
- Each event on the wire:
  ```json
  {
    "event": "deposit_completed",
    "properties": {
      "time": 1757940000000,
      "distinct_id": "0xAbC…",
      "$insert_id": "5f2c…(32 hex)",
      "source": "server",
      "environment": "production",
      "service": "ramping",
      "schema_version": 1,
      "method": "bank",
      "amount_usd": 24.8
    }
  }
  ```
- Response handling:
  - 200: mark all `sent`.
  - 400 with `strict=1`: Mixpanel reports per-event failures; mark those `rejected` with the error, mark the rest `sent`.
  - 429, 5xx, timeout: leave `pending`, `attempts += 1`, exponential backoff with jitter (for example 30s × 2^attempts, capped at 1h).
  - `attempts > 12`: mark `dead` and alert.
- Timeouts on every call (10s). A slow Mixpanel only slows the forwarder.
- Batch size, payload limits and rate limits: **check Mixpanel's current Import API documentation** and configure below them (historically ~2,000 events per request).
- Profile updates (`$set`, `$set_once`, `$add`, `$union`) go through Mixpanel's Engage API from the same forwarder, from a second row type (`kind = 'profile'`) or a sibling table.
- Kill switch: `ANALYTICS_FORWARDER_ENABLED=false` stops sending; rows accumulate and drain when re-enabled (as far back as the Import API accepts).

### B5. Identity and deduplication rules

| Rule               | Detail                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `distinct_id`      | The wallet EVM address **exactly as the web app sends it**: EIP-55 checksummed, as Privy returns it. Normalise with a checksum function (`getAddress` in viem/ethers, or equivalent) before emitting. Do **not** lowercase: Mixpanel cannot merge two identified ids, and every existing user profile is keyed by the checksummed form. Before rollout, look up three known users in Mixpanel and confirm the exact string matches. |
| No wallet yet      | Do not emit anonymously. Emit once the wallet exists (for signup: after the embedded wallet is provisioned, or store the row with a `pending_identity` status and resolve it).                                                                                                                                                                                                                                                      |
| `$insert_id`       | Deterministic, so the same fact always produces the same id: `sha256("<event_name>:<source_id>")` as hex, first 32 characters. Mixpanel limits `$insert_id` to 36 characters, so a raw tx hash (66 characters) cannot be used directly.                                                                                                                                                                                             |
| `time`             | The business record's own timestamp (`settled_at`, `filled_at`, block time), in milliseconds. Never `now()` at send time.                                                                                                                                                                                                                                                                                                           |
| Lowercase join key | Add `wallet_evm` (lowercase) as an event property, for joins against on-chain data and Dune, without changing the id.                                                                                                                                                                                                                                                                                                               |

### B6. Environment separation

- **One Mixpanel project per environment** (production, staging/preview, development), each with its own service account. Set per deployment, never shared.
- Every event also carries `environment` and `service` properties.
- With no credentials configured the emitter still writes outbox rows and the forwarder logs once at startup that sending is disabled. A missing variable must never stop a service from booting.

### B7. Event contract

- Single schema, shared by frontend and backend. Recommended: publish the catalog as JSON Schema (or Zod) in a small shared package; the web app's `lib/analytics/events.ts` is the current source to start from.
- Every server event schema has `additionalProperties: false`, so a field can only be sent if it has been added to the schema on purpose.
- `schema_version` on every event; bump on any change to an event's properties.
- Naming follows the tracking plan: snake_case, past tense, `amount_usd` and `amount_ngn` as numbers, `_completed` / `_failed`.
- **Additive rule for existing reports:** when the plan renames a property (`stake_usd` → `amount_usd`, `match_id` → `game_id`, `result` → `outcome`), send **both** names until the data team confirms reports have moved.
- `reason` on every `_failed` event is one of: `insufficient_balance`, `address_unavailable`, `no_route`, `simulation_failed`, `slippage_exceeded`, `rail_rejected`, `provider_timeout`, `user_cancelled`, `unknown`, plus optional `reason_detail` carrying a coded value only.

### B8. Privacy: the never-send list

Server code sees far more personal data than the browser. None of the following may appear in any event or profile property, and the schema must make it impossible:

- NIN, BVN, passport or ID document numbers, selfies, document images
- Bank account numbers, virtual account numbers, transfer references, recipient account names
- Email, phone, full name as **event** properties (profile `$email` / `$name` only, and only if the data team and legal confirm; the web app already sets them)
- OTPs, passkeys, private keys, seed phrases, session tokens, API keys, webhook signatures
- Raw provider error text (it can echo user input); send a coded `reason_detail`

A unit test must assert that every schema's property names are on an allowlist and that none match a deny-pattern (`/nin|bvn|account_number|iban|otp|secret|token|password|phone|email/i`, excluding the allowlisted `$email` profile field).

### B9. Events to move server-side

Service names are those the web app calls through `wsapiService(...)`. The agent must confirm the real writer and trigger in the backend code; this table is the starting hypothesis.

| Event                                                                          | Owning service (hypothesis)                              | Trigger: when the record is final                                                             | Required properties                                                                                                                                                                                  | `source_id`           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `signup_completed`                                                             | auth / provisioning, fed by Privy `user.created` webhook | Account created and EVM wallet exists                                                         | `method`, `referral_code`, `utm_source` (if captured)                                                                                                                                                | Privy user id         |
| `deposit_completed` (bank)                                                     | `ramping` (and/or `pouch` provider integration)          | Onramp order status becomes completed                                                         | `method: "bank"`, `amount_usd`, `amount_ngn`, `fx_rate` (applied), `provider`, `order_id`, `fee_ngn`                                                                                                 | order id              |
| `deposit_completed` (crypto)                                                   | static deposit address service / chain indexer           | Inbound transfer confirmed to a user's deposit address                                        | `method: "crypto"`, `amount_usd`, `network`, `asset`, `token_address`, `chain_id`, `tx_hash`                                                                                                         | tx hash + log index   |
| `deposit_failed`                                                               | `ramping`, deposit address service                       | Onramp order failed; address mint failed                                                      | `method`, `reason`, `amount_usd` if known, `network`                                                                                                                                                 | order id / request id |
| `withdraw_completed` / `withdraw_failed`                                       | `ramping` (bank), withdrawal service (wallet)            | Payout completed / failed                                                                     | `method`, `amount_usd`, `amount_ngn`, `fx_rate`, `bank` (customer's), `provider`, `network`, `tx_hash`, `order_id`, `reason` on failure                                                              | order id              |
| `trade_completed` / `trade_failed`                                             | `trade` (spot, memecoin), `rwa` / Dextopus integration   | Fill verified on-chain or settlement confirmed                                                | `order_id`, `side`, `vertical`, `asset`, `token_address`, `chain_id`, `tx_hash`, `amount_usd` (fill qty × fill price), `token_quantity`, `fee_usd` (actual), `price_impact_pct`; `reason` on failure | swap id / request id  |
| `kash_bought` / `kash_sold` / `kash_earned`                                    | `kash`                                                   | Mint / burn / claim confirmed                                                                 | `amount_usd`, `kash_amount`, `order_id`, `tx_hash`, `source`                                                                                                                                         | tx hash               |
| `game_staked`, `chess_game_created`, `chess_game_started`, `tournament_joined` | `chess`, draughts, tournaments                           | Stake locked / both seats filled / entry paid                                                 | `game_type` + `game`, `game_id` + `match_id`, `amount_usd` + `stake_usd`, `kash_amount`                                                                                                              | match id + wallet     |
| `game_result`                                                                  | `chess`, draughts settlement                             | Match settled and paid                                                                        | `game_type`, `game_id`, `outcome` + `result`, `amount_usd` (payout), `stake_usd`, `fee_usd` (actual rake)                                                                                            | match id + wallet     |
| `last_man_played` / `last_man_won`                                             | Last Man indexer / backend                               | Play / settle confirmed on-chain                                                              | `game_id`, `amount_usd`, `pot_usd`, `winnings_usd`                                                                                                                                                   | tx hash               |
| `perp_trade_opened` / `perp_trade_closed`                                      | `perp` + keeper indexer                                  | Position opened / closed **including keeper-executed stop-loss, take-profit and liquidation** | `market`, `side`, `leverage`, `collateral_usd`, `notional_usd` (collateral × leverage), `close_reason`, `pnl_usd`, `fee_usd`, `tx_hash`                                                              | trade index + tx hash |
| `prediction_bet_placed`, `prediction_payout_claimed`                           | `prediction-market`                                      | Order filled / claim confirmed                                                                | existing properties + `tx_hash`, `order_id`                                                                                                                                                          | tx hash               |
| `trade_recording_mismatch`                                                     | `trade`                                                  | **Delete when the swap verifier fault is fixed** (audit F19); do not port                     | none                                                                                                                                                                                                 | none                  |

Browser events that stay browser-only are not touched by this work.

### B10. Cutover without double counting

For each event, in this order:

1. **Shadow:** enable the server event in the **staging** Mixpanel project with production traffic mirrored, or in production with the event name suffixed `_server` (for example `deposit_completed_server`). Nothing existing changes.
2. **Reconcile for 7 days:** compare the server event's count and sum against the ledger for the same days. Target: within 1% on count and sum. Compare against the existing browser event to quantify what it was missing.
3. **Cut over, in one release pair:**
   - Backend: emit under the real name (`deposit_completed`) with `source: "server"`.
   - Frontend (separate PR in `ark_market`): delete the browser `track()` for that event. The client watcher code for deposits (`use-deposit-analytics.ts`, `use-onramp-settlement.ts`) is then removed entirely.
4. **Annotate** the cutover date in Mixpanel, so the step change in the chart is explained.
5. Only then move to the next event.

### B11. Monitoring

- Forwarder metrics: rows pending, oldest pending age (lag), sent per minute, rejected, dead.
- Alerts: lag > 15 minutes; any `dead` row; rejected rate > 1% over an hour.
- **Dead-event check** (from `ARK-METRICS-SPEC-001` 2.4), run daily from the outbox: an event that was emitted in the last 90 days, emitted zero times in the last 48 hours, while its upstream event still fires. Maintain an exclusion list for features that are deliberately hidden.

### B12. Relationship to the `daily_metrics` job

- `daily_metrics` reads the **ledger, Privy and provider ledgers**, not Mixpanel and not the outbox.
- The outbox is a useful **cross-check**: the job can compare ledger volume with the sum of server events for the same day and flag a gap above a threshold. That catches a service that settles money but forgot to emit.

---

## Part C: prompt for the implementing agent

Copy everything inside the block below into the agent working in the backend repository.

```markdown
# Task: design server-side Mixpanel events for the backend, without changing existing behaviour

You are working in the backend (gateway services) repository for Ark. The web app (`ark_market`)
currently sends all Mixpanel events from the browser, which loses and misreports money and signup
events. Your job is to add server-side analytics for business records, using a transactional outbox
and a separate forwarder, so that no existing request, response, schema or behaviour changes.

Reference design: `docs/mixpanel-server-events-integration.md` from the ark_market repo (Part B).
If it has not been copied into this repo, ask for it before continuing.

## Hard constraints (non-negotiable)

1. **Do not implement anything until a human approves your ADRs.** Follow this repository's own
   AGENTS.md / CLAUDE.md / CONTRIBUTING rules first; where they are stricter than this prompt, they win.
2. **No network call to Mixpanel in any request handler, settlement handler or transaction.**
   Business code only writes an outbox row (or publishes to an existing internal event bus).
3. **Additive only.** New module, new table (additive migration), new worker, new env vars that are
   optional. No change to existing API responses, database columns, routes, job schedules or
   dependencies' major versions. No refactor of surrounding code.
4. **Analytics must never fail business logic.** Outbox insert failures in production are logged
   with a metric and a rejected-row record; they do not throw into, roll back, or delay the business
   transaction beyond the insert itself. Do not silently swallow errors: every failure is logged and
   counted. In non-production, schema violations throw so they are caught in tests.
5. **Feature-flagged, default off:** `ANALYTICS_EMIT_ENABLED` (write outbox rows) and
   `ANALYTICS_FORWARDER_ENABLED` (send to Mixpanel). Missing Mixpanel credentials must not stop any
   service from booting.
6. **Never send** personal or secret data: NIN, BVN, ID documents, bank/virtual account numbers,
   transfer references, email/phone/name as event properties, OTPs, keys, tokens, raw provider error
   text. Enforce with schemas (`additionalProperties: false`) and a test.
7. **Identity:** `distinct_id` is the user's EVM wallet address in EIP-55 checksummed form, identical
   to what the web app sends. Never lowercase it, never use email or Privy id as `distinct_id`.
   Add lowercase `wallet_evm` as a property.
8. **Deduplication:** `$insert_id` = first 32 hex chars of sha256("<event_name>:<source_record_id>");
   `time` = the business record's own timestamp in ms. Outbox has UNIQUE(event_name, insert_id).
9. **Environments:** a separate Mixpanel project and service account per environment. Every event
   carries `source: "server"`, `environment`, `service`, `schema_version`.
10. Work on a branch or worktree, never on main. Do not commit, push or open a PR unless asked.

## Phase 1: discover (read-only). Report back before designing.

Produce `docs/analytics/discovery.md` answering, with file paths and line references:

1. Language(s), frameworks, service layout, how services are deployed and scheduled.
2. Database(s) and migration tooling per service. Can the settlement code share a transaction with a
   new table?
3. Existing messaging: event bus, queue, outbox, domain events, webhooks, cron/worker framework.
   If one exists, the forwarder must consume it instead of adding a new outbox.
4. For each event in the table below, the exact code path where the business record becomes final
   (not where the request arrives), and which fields are available there.
5. Where the account record is created after Privy sign-up. Is a Privy `user.created` webhook
   received anywhere? When does the embedded EVM wallet become known to the backend?
6. How wallet addresses are stored (checksummed or lowercase).
7. Which of `order_id`, `tx_hash`, `token_address`, `chain_id`, fill quantity, fill price, actual fee,
   applied FX rate are available at each trigger point. List gaps.
8. Whether keeper-executed perp closes (stop loss, take profit, liquidation) and Last Man plays are
   visible to any backend service or indexer.
9. What causes the static deposit address mint to fail (`address_unavailable`), from logs or code.
10. Why the trade service returns 409 `SWAP_ALREADY_SUBMITTED` for swaps that delivered on-chain
    (sponsored user operation verification). Report only; fixing it is a separate ticket.
11. Existing logging, metrics and alerting libraries to reuse.

Events to locate:
signup_completed; deposit_completed (bank, crypto); deposit_failed; withdraw_completed;
withdraw_failed; trade_completed; trade_failed; kash_bought; kash_sold; kash_earned; game_staked;
chess_game_created; chess_game_started; tournament_joined; game_result; last_man_played;
last_man_won; perp_trade_opened; perp_trade_closed; prediction_bet_placed; prediction_payout_claimed.

Stop after Phase 1 and present discovery.md.

## Phase 2: decide. Write the ADRs and stop for approval.

Write two documents (follow this repo's ADR location and naming if it has one):

1. Technical ADR: context, the outbox + forwarder design adapted to this stack (or reuse of the
   existing bus), schema/contract location, identity and dedupe rules, environment separation,
   failure modes and their handling, rollout and cutover plan (Part B10), monitoring, rollback,
   component diagram, alternatives considered (direct SDK calls in handlers; Mixpanel data pipelines;
   CDP such as Segment/RudderStack) and why they were rejected or deferred.
2. Plain-English companion ADR for non-technical readers (data team, marketing, leadership).

Do not write implementation code in this phase. Wait for explicit human approval of both.

## Phase 3: plan (after approval)

Write an implementation plan with: module boundaries, the emitter interface, migration file, forwarder
design, schema files per event with property types and required flags, the per-event trigger mapping
from discovery, test strategy, rollout order, and the exact frontend removals needed at each cutover
(to be done in ark_market by a separate PR).

## Phase 4: build (after plan approval), test-first

Order:

1. Shared event schema (start with 3 events: `deposit_completed`, `withdraw_completed`,
   `signup_completed`), privacy allowlist test, insert-id and checksum helpers with unit tests.
2. Outbox migration (additive) and `emit()` with tests: idempotent insert, validation, flag off
   writes nothing, production validation failure does not throw into the caller.
3. Forwarder with tests against a mocked Mixpanel endpoint: batching, 200, strict 400 per-event
   rejection, 429/5xx backoff, timeout, dead-lettering, kill switch, no credentials.
4. Wire `emit()` into the confirmed trigger point of ONE event (`deposit_completed` bank), behind the
   flag. Integration test: settling an order writes exactly one outbox row with ledger figures;
   rolling back the business transaction writes none; a Mixpanel outage does not affect settlement.
5. Metrics and alerts (lag, dead, rejected rate) and the dead-event daily check.
6. Stop. Report results. Remaining events are added one at a time through the cutover process.

Required tests before any PR:

- Existing test suite passes unchanged (no modified or deleted existing tests).
- Business-path tests prove behaviour is identical with flags on and off.
- Privacy test: no schema contains a deny-listed property.
- `$insert_id` is ≤ 36 chars and stable for the same inputs.
- `distinct_id` equals the checksummed address for lowercase, uppercase and mixed inputs.

## Phase 5: verify and roll out

1. Staging project first. Send test settlements; confirm events in Mixpanel Live View with the right
   `distinct_id` (matches an existing user profile created by the web app), properties and time.
2. Shadow in production (`<event>_server` or staging project), reconcile 7 days against the ledger,
   target within 1% on count and sum. Report the comparison.
3. Cutover per event with the paired frontend PR, then annotate in Mixpanel.

## Deliverables at each stop

- Phase 1: discovery.md.
- Phase 2: two ADRs. Wait.
- Phase 3: plan. Wait.
- Phase 4: branch with changes, test output, a short report of anything that deviated from this prompt
  and why.
- Phase 5: reconciliation table per event.

## Mixpanel API facts to verify against current Mixpanel docs before coding

- Import API: `POST https://api.mixpanel.com/import?strict=1&project_id=<id>`
  (the US host; a project stored in another region has its own, and Mixpanel
  rejects events sent to the wrong one), service account Basic auth, gzip
  supported, batch and payload limits per request, rate limits.
- `$insert_id` max length and allowed characters; how far back `time` may be.
- Engage API for `$set`, `$set_once`, `$add`, `$union` profile operations.
- Simplified ID Merge behaviour for server events that carry only `distinct_id`.
```

---

## Appendix: frontend follow-ups in `ark_market` (not part of the backend task)

These happen in this repository, in separate PRs, at each cutover:

- Remove the browser `track()` for each event once its server version is live: `use-deposit-analytics.ts`, `use-onramp-settlement.ts`, `bank-withdraw-screen.tsx`, `crypto-withdraw-screen.tsx`, the `trade_completed` calls in trade sheets and settlement trackers, Kash modals, casino hooks, `analytics-identity.tsx` (signup).
- Keep browser behaviour events and the `_failed` events the user sees on screen, with the standard `reason` values.
- Remove the matching profile accumulation in `lib/analytics/mixpanel.ts` (`accumulateProfile`) for events that move server-side, or the totals will be counted twice. The backend sends the profile increments instead.
- Move `lib/analytics/events.ts` onto the shared schema package once it exists.
