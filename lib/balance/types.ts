// The user-management balance endpoint's domain types, in a file with no
// client directive so the server can import them without pulling a browser
// client along (the same reason lib/meme/types.ts has none).
//
// GET /api/user-management/users/{did}/balance answers with the native and
// token balances of the signed-in user's linked wallets. Two rules shape every
// type here:
//
//  1. Every figure is a STRING. A balance arrives as an integer count of base
//     units ("504709067444182" with decimals: 18) and stays that way; the
//     bigint is produced on demand by lib/balance/amount.ts and never stored.
//     A string is also the only representation that survives React Query's
//     dehydration and JSON.stringify, which a bigint does not.
//  2. This endpoint prices nothing, so no dollar figure appears on these types
//     at all. The fields it sends are accepted and dropped — see the note
//     below.

/**
 * An EVM chain id as the service writes it: 0x-prefixed hexadecimal,
 * "0x2105" being Base (8453).
 *
 * Distinct from the plain `number` chain ids the rest of the app uses
 * (lib/meme/chain.ts's BASE_CHAIN_ID) so the two can never be compared by
 * accident: `"0x2105" === 8453` is false and always will be. Convert
 * deliberately with chainIdOf() when a caller needs the numeric form.
 */
export type HexChainId = `0x${string}`;

/**
 * No USD figure lives on these types, deliberately.
 *
 * The service sends `usdValue` on every asset and a `totalUsdValue` beside
 * them, and every one of them has so far been null: it reports quantities, and
 * this app prices assets from its own source. The parser accepts those fields
 * and drops them (lib/balance/schema.ts).
 *
 * Dropping beats carrying `null`. A field that is always null is noise a
 * reader has to rule out, and if the service ever starts pricing, a type that
 * says `null` would quietly become a lie while a type that says nothing stays
 * true. Adding a dollar figure here later is then a deliberate edit by someone
 * who has decided what that figure means next to the app's own prices.
 */

/**
 * A quantity of one asset, as base units plus the scale that interprets them.
 *
 * `baseUnits` is an unsigned integer written in base 10 — the token's smallest
 * indivisible unit, which is what the chain itself stores. `decimals` is how
 * many places to move the point to read it as a coin. Neither is ever a float,
 * and Number() is never called on `baseUnits`: 504709067444182 survives, but a
 * USDC whale's 2^53-exceeding base units would not.
 *
 * Use lib/balance/amount.ts to do anything with this: toBaseUnits() for the
 * bigint, toDecimalString() for a string lib/meme/decimal.ts can format, and
 * compareAmounts() to order two of them.
 */
export interface TokenAmount {
  /** Integer base units, base 10, unsigned. Never parsed as a number. */
  readonly baseUnits: string;
  /** Places between `baseUnits` and one whole coin. 18 for ETH, 6 for USDC. */
  readonly decimals: number;
}

/**
 * One holding in a wallet: the chain's native coin, or one ERC-20.
 *
 * The wire form carries `balanceFormatted` as well — a decimal-string
 * rendering of the same figure. It is deliberately absent here: it is
 * derivable from `amount` with fromBaseUnits, so keeping both would give a
 * reader two sources of truth for one number. The parser still checks that the
 * service's rendering agrees with its own base units before dropping it, so a
 * service that contradicts itself is a parse failure rather than a silently
 * preferred half.
 */
export interface BalanceAsset {
  symbol: string;
  name: string;
  /**
   * The ERC-20 contract address, or null for the chain's native coin. Null
   * means native — it never means "we could not find the address".
   */
  address: string | null;
  amount: TokenAmount;
}

/** One linked wallet's holdings on one chain. */
export interface WalletBalance {
  chain: HexChainId;
  /** The wallet's own address on that chain. */
  address: string;
  native: BalanceAsset;
  tokens: BalanceAsset[];
  /**
   * The EVM block the balances were read at, in DECIMAL — unlike `chain`,
   * which is hex. Kept as a string because a block number is an unbounded
   * integer that a float would eventually round.
   */
  blockNumber: string | null;
  /**
   * The Solana slot, and null on every EVM chain. Present in the payload with
   * a null value, which reads as "this service anticipates Solana and does not
   * serve it yet" rather than as a missing field.
   */
  slot: string | null;
}

/**
 * The whole answer for one Privy DID.
 *
 * `generatedAt` and `staleAt` are ISO timestamps 15 seconds apart, which is
 * the upstream Redis window this was served from or written into. They are
 * kept as the strings the service wrote: they are displayed or compared as
 * instants, never rebuilt, so parsing them here would only lose the exact
 * value. `cached` says the body came back out of that window rather than off
 * the chains — it is payload, not an HTTP cache header, and it drives at most
 * a "refreshing" hint.
 */
export interface UserBalance {
  generatedAt: string;
  staleAt: string;
  cached: boolean;
  /** Every chain the service looked at, hex. Today: ["0x2105"], Base alone. */
  chains: HexChainId[];
  wallets: WalletBalance[];
}
