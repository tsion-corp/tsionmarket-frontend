# Comprehensive WSWS API Endpoint Catalog

This document is the complete inventory of all 51 API route handlers implemented in `app/api/`, their upstream base URLs, HTTP methods, authentication levels, and backend handoff status.

---

## Service Groups Summary

| Group                   | Target Upstream Provider / Base URL       | Route Count | Primary Credentials / Keys                                   |        Handoff to Backend?        |
| ----------------------- | ----------------------------------------- | :---------: | ------------------------------------------------------------ | :-------------------------------: |
| **1. WSWS Gateway**     | `https://api.tsionark.com/v1/*`           |     17      | Platform Gateway JWT / Internal                              | Partially (Orchestration & Rules) |
| **2. Dextopus Bridge**  | `https://swap-api.dextopus.com/api`       |      2      | `DEXTOPUS_API_KEY`, `DEXTOPUS_WITHDRAW_API_KEY`              |     **YES** (Move to Backend)     |
| **3. Pouch Finance**    | `https://api.pouchfinance.xyz`            |      9      | `POUCHPAY_API_LIVE_KEY`                                      |     **YES** (Move to Backend)     |
| **4. Polymarket**       | `https://gamma-api.polymarket.com` / CLOB |      4      | `POLYMARKET_BUILDER_SECRET`, `POLYMARKET_BUILDER_PASSPHRASE` |     **YES** (Move to Backend)     |
| **5. Gas Relayer**      | Local Solana Keypair / Alchemy Bundler    |      4      | `SOLANA_PRIVATE_KEY`, `ALCHEMY_GAS_POLICY_ID`                |     **YES** (Move to Backend)     |
| **6. Multi-Chain RPC**  | Alchemy / Helius / ZeroDev                |      4      | `ALCHEMY_API_KEY`, `HELIUS_API_KEY`, `ZERODEV_PROJECT_ID`    |     **YES** (Move to Backend)     |
| **7. Market Data / FX** | CoinGecko, GeckoTerminal, Open-ER         |      8      | Public / Rate-Limited External CDNs                          |      Keep on BFF / CDN Cache      |
| **8. Auth & Dev Labs**  | Privy Server SDK / Local Fixtures         |      2      | `PRIVY_APP_SECRET`                                           |  Keep on BFF (Frontend Session)   |
| **9. Circle CCTP**      | `https://iris-api.circle.com`             |      1      | None (public attestation service)                            |   Keep on BFF (validation only)   |

---

## Detailed Endpoint Catalog (1 to 51)

### 1. WSWS Gateway Microservices

| #   | Route Path                     |            Methods             | Upstream Base URL & Path                                 | Auth Requirement                           | Purpose & Description                                                                                                                                       |
| --- | ------------------------------ | :----------------------------: | -------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/api/trade/[...path]`         |         `GET`, `POST`          | `wsapiService("trade")/${path}`                          | Public GETs / Privy Bearer for trades      | Spot token trading & meme swaps on Base.                                                                                                                    |
| 2   | `/api/perp/[...path]`          |         `GET`, `POST`          | `${PERP_API_BASE_URL or WSAPI_BASE_URL}/v1/perp/${path}` | Public reads / Session-verified for trades | Hyperliquid perpetuals (Ark): markets, marks, wallet state, prepare/submit steps the user's wallet signs, and the CCTP deposit rail (`ark/deposit/cctp/*`). |
| 3   | `/api/rwa/[...path]`           |         `GET`, `POST`          | `wsapiService("rwa")/${path}`                            | Public reads / Session-verified for quotes | Real-world asset catalog, quoting, and transaction construction.                                                                                            |
| 4   | `/api/rwa-prices`              |             `GET`              | Alchemy Token API + RWA Registry                         | Session-gated (`verifyRequest`)            | Live USD pricing for all tracked RWA tokens.                                                                                                                |
| 5   | `/api/rwa-chart`               |             `GET`              | Alchemy Token History                                    | Session-gated (`verifyRequest`)            | Price and yield history chart points for individual RWAs.                                                                                                   |
| 6   | `/api/kash/[...path]`          |      `GET`, `POST`, `PUT`      | `wsapiService("kash")/${path}`                           | Public quotes / Wallet ownership gate      | Kash rewards engine (purchases, tiers, subscriptions, conversions).                                                                                         |
| 7   | `/api/chess/[...path]`         | `GET`, `POST`, `PUT`, `DELETE` | `wsapiService("chess")/${path}`                          | Public spectator / Session for players     | Chess game lobby, boards, moves, clock, cashier, and tournaments.                                                                                           |
| 8   | `/api/draughts/[...path]`      | `GET`, `POST`, `PUT`, `DELETE` | `wsapiService("chess")/draughts/${path}`                 | Public spectator / Session for players     | Checkers match module sharing chess cashier and identity.                                                                                                   |
| 9   | `/api/vault/[...path]`         |             `GET`              | `wsapiService("world-street-vault")/${path}`             | Public (short TTL cache)                   | King of the Night / Last Man Standing game lobby and round state.                                                                                           |
| 10  | `/api/market-square/[...path]` | `GET`, `POST`, `PUT`, `DELETE` | `wsapiService("market-square")/${path}`                  | Session-gated (Privy Bearer)               | Ecosystem social feeds, live streams, and community posts.                                                                                                  |
| 11  | `/api/earn/[...path]`          |         `GET`, `POST`          | `wsapiService("earn")/${path}`                           | Public for feeds / Session for actions     | Bounty listings, company profiles, and bounty submissions.                                                                                                  |
| 12  | `/api/earn-upload`             |             `POST`             | `*.s3.filebase.com`                                      | Session-gated (`verifyRequest`)            | Proxies binary file uploads to signed S3 URLs for earn submissions.                                                                                         |
| 13  | `/api/payment/[...path]`       |         `GET`, `POST`          | `wsapiService("payment")/${path}`                        | Session-gated (`verifyRequest`)            | Off-ramp payment corridors, quotes, and recipient bank validation.                                                                                          |
| 14  | `/api/ramping/[...path]`       |         `GET`, `POST`          | `wsapiService("ramping")/${path}`                        | Session-gated (`verifyRequest`)            | Difference rail NGN on/offramp order creation and status tracking.                                                                                          |
| 15  | `/api/waitlist`                |             `POST`             | `wsapiService("perp")/waitlist`                          | Public                                     | Marketing waitlist signups from pre-launch gate.                                                                                                            |
| 16  | `/api/prediction/[...path]`    |         `GET`, `POST`          | `wsapiService("prediction-market")/${path}`              | Open Relay                                 | Prediction market metadata and categories reader.                                                                                                           |
| 17  | `/api/dashboard/feed`          |             `GET`              | Composed internally from multiple services               | Public (`s-maxage=20`)                     | Aggregated dashboard marquee, briefs, live events, and spot prices.                                                                                         |

---

### 2. Dextopus Bridge & Cross-Chain Swaps

| #   | Route Path                |    Methods    | Upstream Base URL & Path                                 | Auth Requirement                | Purpose & Description                                                       |
| --- | ------------------------- | :-----------: | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| 18  | `/api/dextopus/[...path]` | `GET`, `POST` | `https://swap-api.dextopus.com/api/${path}`              | Session-gated (`verifyRequest`) | Cross-chain swap quotes, deposit address generation, status reconciliation. |
| 19  | `/api/square/symbols`     |     `GET`     | `https://swap-api.dextopus.com/api/deposit/destinations` | Public                          | Tappable ticker catalog published for Market Square feeds.                  |

---

### 3. Pouch Finance Fiat & KYC

| #   | Route Path                 | Methods | Upstream Base URL & Path                                     | Auth Requirement     | Purpose & Description                                                        |
| --- | -------------------------- | :-----: | ------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------- |
| 20  | `/api/pouch/rate`          |  `GET`  | `https://api.pouchfinance.xyz/crypto/rate`                   | Public               | Live USD/NGN fiat conversion rates for onramp and offramp.                   |
| 21  | `/api/pouch/verify-bank`   | `POST`  | `https://api.pouchfinance.xyz/shared-kyc/ramp/verify-bank`   | Unauthenticated      | Bank account number and network verification (resolves account holder name). |
| 22  | `/api/pouch/kyc/initiate`  | `POST`  | `https://api.pouchfinance.xyz/shared-kyc/initiate`           | Unauthenticated      | Starts Shared KYC by triggering a 6-digit email OTP.                         |
| 23  | `/api/pouch/kyc/verify`    | `POST`  | `https://api.pouchfinance.xyz/shared-kyc/verify`             | Unauthenticated      | Validates the emailed OTP and returns a reusable Shared KYC JWT.             |
| 24  | `/api/pouch/kyc/submit`    | `POST`  | `https://api.pouchfinance.xyz/shared-kyc/submit`             | Pouch KYC Bearer JWT | Submits KYC identity documents (BVN, ID, personal details).                  |
| 25  | `/api/pouch/kyc/status`    |  `GET`  | `https://api.pouchfinance.xyz/shared-kyc/status`             | Pouch KYC Bearer JWT | Checks verification and compliance state for a user.                         |
| 26  | `/api/pouch/onramp`        | `POST`  | `https://api.pouchfinance.xyz/shared-kyc/ramp/onramp`        | Pouch KYC Bearer JWT | Creates a one-off fiat virtual account settling USDC on Base.                |
| 27  | `/api/pouch/onramp/status` |  `GET`  | `https://api.pouchfinance.xyz/shared-kyc/ramp/onramp/status` | Pouch KYC Bearer JWT | Checks deposit payment confirmation and settlement state.                    |
| 28  | `/api/pouch/offramp`       | `POST`  | `https://api.pouchfinance.xyz/shared-kyc/ramp/offramp`       | Pouch KYC Bearer JWT | Creates a crypto withdrawal order settling NGN to a bank account.            |

---

### 4. Polymarket APIs

| #   | Route Path                        | Methods | Upstream Base URL & Path                                | Auth Requirement                | Purpose & Description                                            |
| --- | --------------------------------- | :-----: | ------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| 29  | `/api/polymarket/sign`            | `POST`  | Internal HMAC Signer (`POLYMARKET_BUILDER_SECRET`)      | Session-gated (`verifyRequest`) | Remote builder request signer (HMAC-SHA256 signature generator). |
| 30  | `/api/polymarket/deposit-address` | `POST`  | `https://deposit-bridge.polymarket.com/deposit-address` | Session-gated (`verifyRequest`) | Generates a bridge address wrapping USDC to pUSD on Polygon.     |
| 31  | `/api/polymarket/access`          |  `GET`  | Edge Header Inspector (`x-vercel-ip-country`)           | Public                          | Geolocation access gating checking restricted territories.       |
| 32  | `/api/predictions`                |  `GET`  | `https://gamma-api.polymarket.com/events`               | Public (`revalidate=300`)       | Read-only prediction market event cards from Gamma API.          |

---

### 5. Gas Sponsorship & Relaying (Solana & EVM)

| #   | Route Path                        | Methods | Upstream Base URL & Path                     | Auth Requirement                | Purpose & Description                                                |
| --- | --------------------------------- | :-----: | -------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| 33  | `/api/gas-sponsor/solana/prepare` | `POST`  | Local Solana Keypair / Gas Sponsor Service   | Session-gated (`verifyRequest`) | Rewrites transaction fee payer and ATA rent payer to sponsor wallet. |
| 34  | `/api/gas-sponsor/solana`         | `POST`  | Local Solana Keypair / Gas Sponsor Service   | Session-gated (`verifyRequest`) | Cosigns user-signed Solana transaction and broadcasts to RPC.        |
| 35  | `/api/alchemy-solana-sponsor`     | `POST`  | Alias to `/api/gas-sponsor/solana`           | Session-gated (`verifyRequest`) | Legacy alias for Solana gas sponsorship.                             |
| 36  | `/api/alchemy-bundler/[network]`  | `POST`  | `https://${network}.g.alchemy.com/v2/${key}` | Session-gated (`verifyRequest`) | ERC-4337 / ERC-7702 UserOperation bundler & paymaster sponsor.       |

---

### 6. Multi-Chain Balances & RPC Relays

| #   | Route Path               | Methods | Upstream Base URL & Path                           | Auth Requirement                | Purpose & Description                                              |
| --- | ------------------------ | :-----: | -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| 37  | `/api/portfolio`         |  `GET`  | Alchemy Portfolio API (`assets/tokens/by-address`) | Session-gated (`verifyRequest`) | Aggregates balances across 28 EVM chains + Solana with USD values. |
| 38  | `/api/activity`          |  `GET`  | Alchemy Asset Transfers API                        | Session-gated (`verifyRequest`) | Indexes historical asset transfer logs and classifies actions.     |
| 39  | `/api/solana-rpc`        | `POST`  | Helius / Alchemy Solana Mainnet RPCs               | Session-gated (`verifyRequest`) | JSON-RPC proxy for browser wallet reads and `sendTransaction`.     |
| 40  | `/api/evm-rpc/[network]` | `POST`  | ZeroDev EVM RPC Project                            | Session-gated (`verifyRequest`) | JSON-RPC read proxy for contract calls and receipt polling.        |

---

### 7. Market Data, FX, Charts & Token Metadata

| #   | Route Path                          | Methods | Upstream Base URL & Path                                 | Auth Requirement | Purpose & Description                                           |
| --- | ----------------------------------- | :-----: | -------------------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| 41  | `/api/prices`                       |  `GET`  | `https://api.g.alchemy.com/prices/v1/...`                | Public           | Spot prices for native crypto assets by symbol.                 |
| 42  | `/api/fx`                           |  `GET`  | `https://open.er-api.com/v6/latest/USD`                  | Public           | Live foreign exchange rates (USD to NGN, EUR, GBP, etc.).       |
| 43  | `/api/chart`                        |  `GET`  | `https://api.coingecko.com/api/v3/coins/${id}/...`       | Public           | Candlestick (OHLC) and area chart points from CoinGecko.        |
| 44  | `/api/token-chart-id`               |  `GET`  | `https://api.coingecko.com/api/v3/coins/${platform}/...` | Public           | Resolves CoinGecko coin IDs from contract addresses.            |
| 45  | `/api/token-logo/[chain]/[address]` |  `GET`  | GeckoTerminal / CoinGecko / TrustWallet                  | Public           | 307 redirect to token image CDN URLs.                           |
| 46  | `/api/token-logos`                  | `POST`  | `https://api.geckoterminal.com/api/v2/...`               | Public           | Batched multi-token logo resolver across networks.              |
| 47  | `/api/market-tokens`                |  `GET`  | CoinGecko Markets API                                    | Public           | Filtered token lists by category (popular, layer-1, meme, rwa). |
| 48  | `/api/ondo`                         |  `GET`  | CoinGecko Ondo contract prices                           | Public           | Ondo tokenized treasury and equity product feeds.               |

---

### 8. Session Auth & Labs

| #   | Route Path                             | Methods | Upstream Base URL & Path            | Auth Requirement                       | Purpose & Description                                           |
| --- | -------------------------------------- | :-----: | ----------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| 49  | `/api/auth/me`                         |  `GET`  | Privy Server SDK (`@privy-io/node`) | Session-gated (`verifyRequest`)        | Resolves user identity, linked accounts, and embedded wallets.  |
| 50  | `/api/labs/chess-puzzle-coach/[asset]` |  `GET`  | Local filesystem test fixtures      | Dev-only (`NODE_ENV !== "production"`) | Serves audio and wasm assets for local chess coach lab testing. |

---

### 9. Circle CCTP

| #   | Route Path            | Methods | Upstream Base URL & Path                                                                 | Auth Requirement                | Purpose & Description                                                                                               |
| --- | --------------------- | :-----: | ---------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 51  | `/api/cctp/[...path]` |  `GET`  | `https://iris-api.circle.com/v2/messages/:domain` and `/v2/burn/USDC/fees/:source/:dest` | Session-gated (`verifyRequest`) | Burn attestations and live transfer fees for the perps top-up and withdrawal rail; allowlisted, validated with Zod. |
