# Backend Migration Specification: Frontend Server-Side Offloading & Architecture Handoff

**Target Audience:** Backend Engineering Team, Platform Architecture, Security Team  
**Date:** September 2026  
**Status:** Ready for Implementation  
**Document Scope:** Architecture Handoff & Security Hardening

---

## Executive Summary

The WSWS Next.js application (`wsws-frontend`) currently houses multiple high-stakes, security-critical services in its server runtime (`lib/server/` and `app/api/`). Because these services run in Next.js serverless functions / Node.js BFF containers, they:

1. **Hold sensitive private keys and partner credentials** (e.g., `SOLANA_PRIVATE_KEY`, `POLYMARKET_BUILDER_SECRET`, `DEXTOPUS_API_KEY`, `POUCHPAY_API_LIVE_KEY`, `ALCHEMY_API_KEY`).
2. **Execute core financial and transaction logic** (Solana fee sponsorship, ATA rent subsidies, cross-chain quote routing, on-chain transaction history indexing).
3. **Act as unmetered, high-privilege proxies** to upstream third-party APIs and internal microservices.

This specification documents **every service currently misplaced in the frontend**, details its technical inner workings, identifies its risks, and defines the target backend architecture, API contracts, and migration roadmap.

---

## Architectural Principle: The Clean Separation of Concerns

```
[ BROWSER CLIENT ]
       │
       │ (1) User Actions & UI State
       │ (2) Privy Access Token (Authorization: Bearer <jwt>)
       ▼
┌─────────────────────────────────────────────────────────────┐
│                   WSWS API GATEWAY (KONG / ENVOY)           │
│   • Global Rate Limiting & DDoS Protection                  │
│   • Privy JWT Authentication & Identity Extraction           │
│   • Geolocation & Compliance Boundary Filtering             │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐
│ Gas Station ││ Prediction  ││ Settlement  ││ Fiat & KYC  │
│ & Relayer   ││ & Polymkt   ││ & Bridge    ││ Service     │
│ Service     ││ Gateway     ││ (Dextopus)  ││ (Pouch/Diff)│
└─────────────┘└─────────────┘└─────────────┘└─────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐
│ Portfolio & ││ Activity    ││ Game &      ││ Node RPC    │
│ Pricing     ││ Indexer     ││ Wagering    ││ Gateway     │
│ Service     ││ Service     ││ Engine      ││ (Sol/EVM)   │
└─────────────┘└─────────────┘└─────────────┘└─────────────┘
```

**Rule:** The frontend must act purely as a presentation layer. It must **never** hold private keys, compute HMAC builder signatures, rewrite transaction fee payers, or talk directly to external partner backends.

---

## Detailed Service Breakdown & Migration Specifications

---

### Service 1: Solana Gas Station & Transaction Cosigner

#### 1. Current Frontend Location

- `lib/server/solana-cosigner.ts`
- `lib/server/solana-sponsor.ts`
- `app/api/gas-sponsor/solana/prepare/route.ts`
- `app/api/gas-sponsor/solana/route.ts`
- `app/api/alchemy-solana-sponsor/route.ts`

#### 2. Secrets & Credentials Held

- `SOLANA_PRIVATE_KEY` (Base58 or JSON array of 64-byte private key)
- `GAS_SPONSOR_API_URL`

#### 3. How It Works Today

1. **Prepare Phase (`/api/gas-sponsor/solana/prepare`)**:
   - The client sends a serialized unsigned Solana transaction (`serializedTransaction`) and optional `prefundRent: boolean`.
   - The frontend server decompiles the versioned wire transaction using `@solana/kit`.
   - It fetches lookup tables via Solana RPC.
   - It rewrites the `feePayer` to the local sponsor public key (`localSponsorAddress()`).
   - If `prefundRent` is true and an instruction calls the Associated Token Program (`ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`), it replaces the rent-paying account with the sponsor wallet.
   - It caps priority fee compute unit prices to a maximum (`MAX_PRIORITY_FEE_LAMPORTS = 10_000n`).
   - Recompiles the transaction and returns it to the client.
2. **Sign & Submit Phase (`/api/gas-sponsor/solana`)**:
   - The user signs their transaction slots in the browser using their Privy embedded wallet.
   - The partially signed transaction is sent back to the server.
   - The server verifies that the fee payer is the sponsor wallet, adds the sponsor's signature with `SOLANA_PRIVATE_KEY`, and broadcasts the transaction to the Solana network.

#### 4. Critical Security & Architectural Flaws

- **Arbitrary Program Cosigning:** The server does not inspect which programs are invoked. An attacker can submit transactions calling arbitrary Solana smart contracts, forcing the sponsor wallet to pay network fees.
- **Rent Drainage:** If `prefundRent: true`, the server funds the creation of any Associated Token Account. Attackers can spam batch ATA creations for dummy tokens, draining ~0.002039 SOL per ATA from the sponsor wallet, and subsequently close the accounts to harvest the SOL into their personal wallet.
- **Key Exposure Risk:** Placing a raw private key in the frontend deployment environment creates catastrophic risk if SSRF or serverless inspection vulnerabilities occur.

#### 5. Target Backend Service: `gas-station-service`

The backend must implement a dedicated Gas Station microservice:

- **Contract / Program Allowlist:** Only cosign transactions interacting with approved WSWS contracts, Jupiter Swap, or authorized system transfers.
- **Strict Rent Policy:** Only allow rent prefunding for recognized assets (e.g. WSWS USDC mint). Cap ATA creation to 1 per transaction and enforce daily quotas per user ID.
- **Simulated Execution:** Simulate the transaction on-chain via `simulateTransaction` before signing to guarantee it does not drain funds or revert.
- **HSM / KMS Signing:** Move the private key out of raw environment variables into AWS KMS, Google Cloud KMS, or a Turnkey / Fireblocks institutional vault.

```yaml
# Target Backend API Endpoint
POST /v1/gas/solana/prepare
Headers:
  Authorization: Bearer <privy-jwt>
Body:
  serializedTransaction: string # base64
  actionType: "SWAP" | "TRANSFER" | "CASINO_WAGER"
Response:
  serializedTransaction: string
  sponsorPublicKey: string

POST /v1/gas/solana/submit
Headers:
  Authorization: Bearer <privy-jwt>
Body:
  signedTransaction: string # base64
Response:
  signature: string
  status: "SUBMITTED"
```

---

### Service 2: Polymarket Builder Signing & Direct Integration

#### 1. Current Frontend Location

- `app/api/polymarket/sign/route.ts`
- `app/api/polymarket/access/route.ts`
- `app/api/polymarket/deposit-address/route.ts`

#### 2. Secrets & Credentials Held

- `POLYMARKET_BUILDER_API_KEY`
- `POLYMARKET_BUILDER_SECRET`
- `POLYMARKET_BUILDER_PASSPHRASE`
- `NEXT_PUBLIC_POLYMARKET_BUILDER_CODE`

#### 3. How It Works Today

- The client-side Polymarket SDK needs authenticated HTTP headers for Polymarket's CLOB API.
- The browser calls `POST /api/polymarket/sign` with `{ method, path, body }`.
- The server generates an HMAC-SHA256 signature using `POLYMARKET_BUILDER_SECRET` over `${timestamp}${method}${path}${body}`.
- **Crucially**, the route returns:
  ```json
  {
    "POLY_BUILDER_API_KEY": key,
    "POLY_BUILDER_PASSPHRASE": passphrase,
    "POLY_BUILDER_SIGNATURE": signature,
    "POLY_BUILDER_TIMESTAMP": "..."
  }
  ```

#### 4. Critical Security & Architectural Flaws

- **Full Credential Compromise:** The API key and passphrase are leaked directly in HTTP response bodies to all authenticated users.
- **Unrestricted Signing Oracle:** Any user can generate valid cryptographic signatures for arbitrary actions on Polymarket under WSWS's account.

#### 5. Target Backend Service: `prediction-market-gateway`

- Decommission the signing endpoint entirely.
- The client should **never** talk directly to Polymarket's CLOB API using WSWS builder credentials.
- All order placements, cancellations, and orderbook queries must flow through `prediction-market-gateway`:

```yaml
# Target Backend API
POST /v1/prediction/orders
Headers:
  Authorization: Bearer <privy-jwt>
Body:
  marketId: string
  outcome: "YES" | "NO"
  amountUsd: string
  side: "BUY" | "SELL"
Response:
  orderId: string
  status: "MATCHED" | "PLACED"

POST /v1/prediction/deposit-address
Headers:
  Authorization: Bearer <privy-jwt>
Response:
  depositAddress: string
```

---

### Service 3: Multi-Chain Portfolio Aggregator & Pricing Indexer

#### 1. Current Frontend Location

- `lib/server/alchemy.ts`
- `lib/server/alchemy-prices.ts`
- `lib/server/alchemy-keys.ts`
- `lib/server/rwa-prices.ts`
- `app/api/portfolio/route.ts`
- `app/api/prices/route.ts`

#### 2. Secrets & Credentials Held

- `ALCHEMY_API_KEY`
- `ALCHEMY_API_KEY_FALLBACK`
- `ZERODEV_PROJECT_ID`

#### 3. How It Works Today

1. Next.js receives a portfolio request with user wallet addresses (`?evm=0x...&solana=...`).
2. It makes chunked calls (max 20 networks per batch) to Alchemy Portfolio Data API across **28 EVM networks** plus Solana.
3. It handles key rotation (`ALCHEMY_API_KEY_FALLBACK`) on 429/5xx responses.
4. It resolves native tokens (ETH, POL, SOL, BERA, HYPE, MON) which lack contract metadata.
5. It fetches missing spot prices for native tokens via Alchemy Price API.
6. It merges Real-World Asset (RWA) tokens and pricing metadata.
7. It filters zero-value spam tokens, computes floating-point and raw balances, and totals USD value.

#### 4. Critical Architectural Flaws

- **Massive Latency & Concurrency Bottleneck:** Running 30+ network queries and price joins in a serverless function causes 2–5 second cold starts, frequent rate limiting (Alchemy 429s), and high compute resource waste.
- **Floating-Point Float64 Truncation:** `Number(raw) / 10 ** decimals` truncates 18-decimal token balances over ~0.009 tokens, violating standard financial precision rules.

#### 5. Target Backend Service: `portfolio-indexer-service`

- **Background Event Ingestion:** Track user wallet balances via Alchemy Webhooks or RPC event listeners rather than polling 28 chains on demand.
- **Cache-Optimized Storage:** Cache aggregated balances in Redis / PostgreSQL with a 30-second TTL.
- **Pure BigInt Decimal Support:** All asset values stored and transmitted as exact base-unit integers with `decimals` attributes.

```yaml
# Target Backend API
GET /v1/portfolio/balances?wallets=0x...,Sol...
Headers:
  Authorization: Bearer <privy-jwt>
Response:
  totalUsd: "1420.50"
  tokens:
    - symbol: "USDC"
      chain: "base"
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      rawBalance: "1500000000"
      decimals: 6
      priceUsd: "1.00"
      valueUsd: "1500.00"
```

---

### Service 4: Cross-Chain Bridge & Swap Engine (Dextopus Integration)

#### 1. Current Frontend Location

- `lib/server/dextopus.ts`
- `app/api/dextopus/[...path]/route.ts`
- `lib/buy-quote.ts`
- `lib/buy.ts`

#### 2. Secrets & Credentials Held

- `DEXTOPUS_API_KEY`
- `DEXTOPUS_WITHDRAW_API_KEY`
- `DEXTOPUS_TRADE_API_KEY`

#### 3. How It Works Today

- The frontend exposes a wildcard route `/api/dextopus/[...path]`.
- It selects credentials based on route prefix (`withdraw/`, `trade/`, or default).
- Proxies requests directly to `https://swap-api.dextopus.com/api` with `x-api-key`.
- Implements custom client-side retry loops for transport failures on `/deposit/quote` and `/deposit/status`.
- Manages state machine reconciliations for cross-chain execution.

#### 4. Critical Security & Architectural Flaws

- **Path Traversal / SSRF:** `isAllowedPath` allows traversal (e.g. `deposit/../../internal`), exposing internal Dextopus endpoints with the partner key.
- **No Ownership Binding:** The proxy does not enforce that the `recipient` or `refundTo` in a quote body matches the logged-in user's wallet.
- **Money In Flight Without Backend Audit Log:** Financial settlement status is polled directly from the browser through the Next.js server without writing persistent audit logs or ledger entries to the internal platform database.

#### 5. Target Backend Service: `settlement-bridge-service`

The backend must mediate all bridge and swap operations:

- Bind all deposit quotes to verified user IDs and registered wallet addresses.
- Store every quote, execution hash, and settlement status in an immutable database ledger.
- Webhook/Daemon reconciliation: A background worker monitors Dextopus deposit statuses and updates the user's account state asynchronously.

```yaml
# Target Backend API
POST /v1/swap/quote
Headers:
  Authorization: Bearer <privy-jwt>
Body:
  originChainId: 8453
  originAsset: "0x8335..."
  destinationChainId: 1
  destinationAsset: "0x..."
  amount: "100000000"
  slippageBps: 50
Response:
  quoteId: string
  depositAddress: string
  estimatedOutput: string
  expiresAt: string

GET /v1/swap/status/:quoteId
Headers:
  Authorization: Bearer <privy-jwt>
Response:
  status: "PENDING" | "COMPLETED" | "FAILED"
  txHashes: string[]
```

---

### Service 5: Fiat On/Off-Ramp & Shared KYC Gateway (Pouch Finance)

#### 1. Current Frontend Location

- `lib/server/pouch.ts`
- `app/api/pouch/verify-bank/route.ts`
- `app/api/pouch/kyc/initiate/route.ts`
- `app/api/pouch/kyc/verify/route.ts`
- `app/api/pouch/kyc/submit/route.ts`
- `app/api/pouch/kyc/status/route.ts`
- `app/api/pouch/onramp/route.ts`
- `app/api/pouch/offramp/route.ts`

#### 2. Secrets & Credentials Held

- `POUCHPAY_API_LIVE_KEY`
- `POUCH_API_BASE_URL`

#### 3. How It Works Today

- Proxies Pouch Finance API endpoints (`api.pouchfinance.xyz`).
- Manages Nigerian bank verification, OTP generation, document submission, and virtual account generation.
- Attaches the live partner key (`x-api-key: POUCHPAY_API_LIVE_KEY`).

#### 4. Critical Security & Architectural Flaws

- **Unauthenticated Bank Enumeration:** `POST /api/pouch/verify-bank` takes any account number and bank code, returning full account holder legal names to anyone without authentication.
- **Unthrottled OTP Dispatch:** Anyone can trigger OTP emails to arbitrary email addresses.
- **Unverified Identity Association:** Pouch JWT tokens are accepted directly from headers without verifying whether they belong to the authenticated Privy session.

#### 5. Target Backend Service: `fiat-ramp-service`

- **KYC & Account Association:** Link every external KYC record and Pouch token directly to the internal user ID in Postgres.
- **Strict Anti-Abuse & Rate Limiting:** Enforce Redis-backed rate limiting (max 3 bank lookups/min per authenticated user; CAPTCHA on OTP initiation).
- **Webhook-Based Order Finalization:** Receive Pouch payment webhooks on the backend to settle funds, rather than having the frontend poll unverified endpoints.

---

### Service 6: On-Chain Activity & Transaction History Indexer

#### 1. Current Frontend Location

- `lib/server/activity.ts`
- `lib/server/action-registry.ts`
- `app/api/activity/route.ts`

#### 2. How It Works Today

- When a user opens the Activity tab, the frontend server queries Alchemy asset transfers (`alchemy_getAssetTransfers`) across EVM chains and parsed transaction history on Solana.
- It parses transfer logs and runs them through a local action classifier (`action-registry.ts`) to label them (e.g. "Swapped on Jupiter", "Bought RWA", "Casino Wager", "Settled Game").

#### 3. Why It Belongs on Backend

- Real-time on-chain indexing is inherently backend work.
- Polling raw blockchain logs on every user tab click is slow and throttles RPC limits.
- **Target Architecture:** An asynchronous ingestion worker (via Kafka / RabbitMQ or Alchemy Webhooks) indexes user transactions into an `activity_feed` database table. The frontend simply queries `GET /v1/activity` for instantaneous, paginated results.

---

### Service 7: EVM & Solana RPC Relays

#### 1. Current Frontend Location

- `app/api/solana-rpc/route.ts`
- `app/api/evm-rpc/[network]/route.ts`
- `lib/server/evm-rpc.ts`
- `lib/server/solana-rpc-upstreams.ts`
- `lib/server/zerodev.ts`

#### 2. Secrets & Credentials Held

- `HELIUS_API_KEY`
- `HELIUS_API_KEY_FALLBACK`
- `SOLANA_RPC_URL`
- `ZERODEV_PROJECT_ID`

#### 3. Security & Operational Concerns

- `app/api/solana-rpc/route.ts` permits `"sendTransaction"`. An authenticated user can use the WSWS server as an unmetered, free Solana transaction relay using WSWS's private Helius/Alchemy keys.
- **Target Backend Service:** Route RPC requests through a dedicated Cloudflare / Envoy RPC Gateway that enforces per-user request budgets, method allowlists, and IP throttles.

---

## Migration Plan & Phased Roadmap

### Phase 1: Immediate Security Offloading (P0)

1. **Polymarket Gateway:** Deploy backend order proxy; eliminate `app/api/polymarket/sign`.
2. **Solana Gas Station:** Stand up `gas-station-service` with strict contract allowlisting and ATA limits; remove `SOLANA_PRIVATE_KEY` from frontend environment.

### Phase 2: Financial Rails & Third-Party Key Migration (P1)

3. **Pouch & Fiat Ramp:** Move `POUCHPAY_API_LIVE_KEY` to `fiat-ramp-service`; gate bank lookup behind authenticated sessions and rate limits.
4. **Dextopus Bridge:** Migrate swap/quote routing to `settlement-bridge-service` with backend ledger recording.

### Phase 3: Data Aggregation & Indexing Offloading (P2)

5. **Portfolio & Activity Services:** Deploy indexed portfolio and transaction history APIs; decommission 28-chain serverless fan-out in `lib/server/alchemy.ts`.
6. **Dashboard Feed Backend:** Replace frontend server feed aggregation with a unified gateway endpoint (`GET /v1/feed/dashboard`).

---

## Deliverable Summary: Target Environment Variable Deprecation

Once the backend services are live, the following variables will be **permanently removed** from the frontend deployment:

| Variable to Remove from Frontend | Migrated To Backend Service |
| -------------------------------- | --------------------------- |
| `SOLANA_PRIVATE_KEY`             | `gas-station-service`       |
| `POLYMARKET_BUILDER_API_KEY`     | `prediction-market-gateway` |
| `POLYMARKET_BUILDER_SECRET`      | `prediction-market-gateway` |
| `POLYMARKET_BUILDER_PASSPHRASE`  | `prediction-market-gateway` |
| `DEXTOPUS_API_KEY`               | `settlement-bridge-service` |
| `DEXTOPUS_WITHDRAW_API_KEY`      | `settlement-bridge-service` |
| `DEXTOPUS_TRADE_API_KEY`         | `settlement-bridge-service` |
| `POUCHPAY_API_LIVE_KEY`          | `fiat-ramp-service`         |
| `HELIUS_API_KEY`                 | `rpc-gateway-service`       |
| `HELIUS_API_KEY_FALLBACK`        | `rpc-gateway-service`       |
| `ZERODEV_PROJECT_ID`             | `rpc-gateway-service`       |
