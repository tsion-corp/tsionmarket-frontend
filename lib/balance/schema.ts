import { z } from "zod";
import { isHexChainId } from "@/lib/balance/chain";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import type {
  BalanceAsset,
  HexChainId,
  TokenAmount,
  UserBalance,
  WalletBalance,
} from "@/lib/balance/types";

// The browser's own parse of what the balance proxy returns, and the mapper
// from the wire shape into this app's types.
//
// The proxy judges the upstream body against its own copy of this shape
// (lib/api/schemas/user-management.ts) and answers 502 on a mismatch. This is
// the second gate, on the data a component is about to be handed, and it is
// also where the wire form stops: past parseUserBalance nothing holds a raw
// upstream object.
//
// The object schemas are not strict — a field the service adds later is not a
// failure — but every figure is checked for the form it claims to have, and a
// figure that does not have it fails here rather than becoming NaN three
// screens away.

/** An unsigned integer, base 10: base units, a block number, a slot. */
const INTEGER = /^\d+$/u;

/** An unsigned plain decimal. Not scientific notation, which loses digits. */
const DECIMAL = /^\d+(?:\.\d+)?$/u;

// No real asset has more than a few dozen decimal places, and `decimals` is
// fed to 10n ** BigInt(decimals) downstream, where an absurd one is a hang
// rather than a wrong answer.
const MAX_DECIMALS = 36;

const hexChainId = z.custom<HexChainId>(isHexChainId, {
  message: "expected a 0x-prefixed hex chain id",
});

// The service sends the same figure twice: `balance` in base units and
// `balanceFormatted` as a decimal string. Only the base units are kept (see
// BalanceAsset), so before dropping the other one we check the two agree to
// the asset's own precision. A service that contradicts itself about how much
// money someone has is a parse failure — not a coin toss between two figures,
// and not a silent preference for whichever we happened to keep.
function renderingAgrees(asset: { balance: string; balanceFormatted: string; decimals: number }) {
  const fromUnits = fromBaseUnits(BigInt(asset.balance), asset.decimals);
  const fromRendering = fromBaseUnits(
    toBaseUnits(asset.balanceFormatted, asset.decimals),
    asset.decimals
  );
  return fromUnits === fromRendering;
}

const assetSchema = z
  .object({
    symbol: z.string(),
    name: z.string(),
    decimals: z.number().int().min(0).max(MAX_DECIMALS),
    // Null for the chain's native coin, a contract address for a token.
    address: z.string().nullable(),
    // Base units as an integer string. A number here would already have lost
    // digits by the time zod saw it, so `z.string()` is the load-bearing part.
    balance: z.string().regex(INTEGER, "expected integer base units"),
    balanceFormatted: z.string().regex(DECIMAL, "expected a plain decimal string"),
    // Accepted and then dropped. Every usdValue this endpoint has sent so far
    // is null, and the app prices assets from its own source, so the figure is
    // read by nothing here.
    //
    // Tolerated rather than pinned to z.null() because pricing is an ADDITIVE
    // change upstream: refusing the payload the day it ships would take every
    // balance read in the app down until a frontend release caught up, over a
    // field nobody consumes. It is dropped rather than carried so the domain
    // never holds a dollar amount whose provenance it cannot explain.
    usdValue: z.unknown(),
  })
  .refine(renderingAgrees, {
    message: "balanceFormatted disagrees with balance and decimals",
    path: ["balanceFormatted"],
  });

const walletSchema = z.object({
  chain: hexChainId,
  address: z.string(),
  native: assetSchema,
  tokens: z.array(assetSchema),
  // Decimal, unlike `chain`, which is hex. Kept as a string: a block number
  // outgrows an exact double eventually and nothing here needs to add to it.
  blockNumber: z.string().regex(INTEGER, "expected a decimal block number").nullable(),
  // Solana's slot. Null on every EVM chain, and null everywhere today.
  slot: z.string().regex(INTEGER, "expected a decimal slot").nullable(),
});

export const userBalanceSchema = z.object({
  generatedAt: z.string(),
  staleAt: z.string(),
  cached: z.boolean(),
  chains: z.array(hexChainId),
  // Accepted and dropped, for the same reason each usdValue is.
  totalUsdValue: z.unknown(),
  wallets: z.array(walletSchema),
});

type WireAsset = z.output<typeof assetSchema>;
type WireWallet = z.output<typeof walletSchema>;

function amountOf(asset: WireAsset): TokenAmount {
  return { baseUnits: asset.balance, decimals: asset.decimals };
}

function toAsset(asset: WireAsset): BalanceAsset {
  return {
    symbol: asset.symbol,
    name: asset.name,
    address: asset.address,
    amount: amountOf(asset),
  };
}

function toWallet(wallet: WireWallet): WalletBalance {
  return {
    chain: wallet.chain,
    address: wallet.address,
    native: toAsset(wallet.native),
    tokens: wallet.tokens.map(toAsset),
    blockNumber: wallet.blockNumber,
    slot: wallet.slot,
  };
}

/**
 * The envelope's `data` as a UserBalance.
 *
 * Throws a ZodError on anything that does not match, which the caller's query
 * turns into an error state. It never returns a partial balance: a body we
 * cannot read in full is not a smaller balance, and half of someone's holdings
 * presented as all of them is the worst outcome available here.
 */
export function parseUserBalance(body: unknown): UserBalance {
  const wire = userBalanceSchema.parse(body);
  return {
    generatedAt: wire.generatedAt,
    staleAt: wire.staleAt,
    cached: wire.cached,
    chains: wire.chains,
    wallets: wire.wallets.map(toWallet),
  };
}
