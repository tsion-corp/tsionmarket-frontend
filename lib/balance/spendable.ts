import { sumAmounts, toDecimalString } from "@/lib/balance/amount";
import { chainIdOf } from "@/lib/balance/chain";
import { BASE_CHAIN_ID } from "@/lib/meme/chain";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import type { TokenAmount, UserBalance, WalletBalance } from "@/lib/balance/types";

// The one contract that counts, from the table the rest of the app already
// trades against, so a second copy of the address cannot drift from it.
const BASE_USDC = USDC_BY_CHAIN.base.address.toLowerCase();

// What of a user-management balance this app can actually spend, and how that
// figure lines up with the one on screen today.
//
// Pure: no framework, no network, NO PRICE SOURCE. The last one is the point.
// A stablecoin's quantity is its dollar value by a convention this codebase
// already states out loud — "Stablecoins are the product's cash: they read as
// dollars, never as a token symbol" (features/activity/components/
// activity-row.tsx, notification-bell.tsx) — so cash is a sum, not a
// valuation, and it needs neither usePrices nor the dollars this endpoint does
// not send (lib/balance/types.ts).
//
// Two narrowings stand between the payload and that sum, and each one is a
// question about whose money it is rather than how much:
//
//   embeddedWallets()  LINKED wallets are not SPENDABLE wallets.
//   spendableCash()    a holding is not cash unless it is USDC, and a chain
//                      we do not settle on is not reachable.
//
// UNKNOWN IS NOT ZERO, anywhere in this file. Both functions answer null when
// they do not know, and a figure of nothing is only ever "0". The convention
// is lib/meme/decimal.ts's, whose header states it: "a null is never turned
// into a zero". It matters here because this number gates a withdraw button:
// an unknown balance rendered as zero holds the button shut on someone who
// has money, and no error is reported because nothing went wrong.

/**
 * The wallets from `balance` that this app can transact with, or null when
 * that set is not known.
 *
 * The endpoint reports every wallet LINKED to the Privy DID, which in Privy
 * includes wallets the user connected themselves. This app can only sign with
 * the embedded ones — getEmbeddedWallets (lib/user.ts) filters
 * `walletClientType === "privy"` — so `addresses` is that filter's output and
 * a linked wallet missing from it is somebody's money that no button here can
 * move. Counting it would overstate what is spendable.
 *
 * `addresses` matches case-insensitively: the service writes EVM addresses
 * lowercase and Privy does not always, and the same wallet under two spellings
 * must not read as two different wallets, nor as none.
 *
 * AN EMPTY `addresses` IS UNKNOWN, NOT "KEEP EVERYTHING" AND NOT "KEEP
 * NOTHING". getEmbeddedWallets answers [] for a user it has not loaded yet,
 * which is the same value it answers for a user who genuinely controls no
 * wallet — and from here the two are indistinguishable. Keeping everything
 * would silently count wallets this app cannot sign for; answering [] would
 * report a loading account as broke. Null says the only true thing, and
 * spendableCash carries it through.
 */
export function embeddedWallets(
  balance: UserBalance | null | undefined,
  addresses: readonly string[]
): WalletBalance[] | null {
  if (!balance) return null;
  if (addresses.length === 0) return null;
  const ours = new Set(addresses.map((address) => address.toLowerCase()));
  // A known set that matches no wallet IS an answer: we know whose wallets
  // they are and the service reported none of them, which is [] and sums to
  // zero. Only the two cases above are unknown.
  return balance.wallets.filter((wallet) => ours.has(wallet.address.toLowerCase()));
}

/**
 * Whether a holding is spendable cash: USDC, on the chain this app settles on.
 *
 * Native coins are excluded even though ETH is plainly money. Cash is what a
 * purchase draws on DIRECTLY; paying with ETH means a swap first, at a rate
 * nothing here knows. Including it would also need a price, and a price is
 * exactly what this path does not have and does not want — the ETH figure
 * would be the one number on it that could be wrong.
 *
 * The contract comes from USDC_BY_CHAIN (lib/trade/usdc.ts), the table the
 * rest of the app already trades against, rather than a second copy of the
 * address that could drift from it.
 */
function isCash(wallet: WalletBalance, address: string | null): boolean {
  // Everything on this platform settles on Base, and the endpoint reports Base
  // alone today (`chains: ["0x2105"]`). The chain is checked anyway so that
  // the day the service adds one, this figure does not silently grow by money
  // no button in this app can reach. Compared numerically because the two
  // forms are deliberately incomparable as strings ("0x2105" !== 8453).
  if (chainIdOf(wallet.chain) !== BASE_CHAIN_ID) return false;
  // A null address is the chain's native coin, never a token whose address we
  // failed to find (lib/balance/types.ts), so this is the native test and not
  // a guard against missing data.
  if (address === null) return false;
  // MATCHED BY CONTRACT, NEVER BY SYMBOL.
  //
  // This endpoint reports whatever a wallet holds, and anyone can deploy a
  // token on Base and call it USDC. A symbol test would let an airdropped
  // forgery inflate the one figure that decides whether someone may withdraw.
  // That attack is not hypothetical here: the activity feed has already
  // carried a token calling itself USDC with a homoglyph S (U+1E62), sent
  // from an address poisoned to look like one the reader had used before.
  //
  // Only USDC counts. Not USDT, not DAI: "ready to spend" means money that
  // has settled as USDC on Base, which is narrower than "a stablecoin" and
  // narrower again than "worth a dollar". The rest is real money and belongs
  // in the main balance, which values everything the reader holds.
  return address.toLowerCase() === BASE_USDC;
}

function cashAmounts(wallets: readonly WalletBalance[]): TokenAmount[] {
  return wallets.flatMap((wallet) =>
    wallet.tokens.filter((asset) => isCash(wallet, asset.address)).map((asset) => asset.amount)
  );
}

/**
 * The settled USDC holdings of `wallets` as a plain decimal string of dollars —
 * "1628.718" — or null when `wallets` is not known.
 *
 * Exact at any size. Every addend is summed in base units through
 * sumAmounts(), which scales the coarser scales up to the finest before
 * adding, so a 6-decimal USDC balance past 2^53 survives intact. No float is produced at any point: a string is what
 * comes back because the conversion to a number belongs at the display edge,
 * where someone has decided how many places to show.
 *
 * NULL IS UNKNOWN, "0" IS NOTHING, and the difference is the whole reason the
 * return type is not `string`. A caller gating a withdraw button on this must
 * branch on null before it branches on zero.
 */
export function spendableCash(wallets: readonly WalletBalance[] | null | undefined): string | null {
  if (!wallets) return null;
  return toDecimalString(sumAmounts(cashAmounts(wallets)));
}

// THE COMPARISON WITH THE INCUMBENT FIGURE
//
// features/portfolio/lib/breakdown.ts's readyToSpendUsd() sums the same idea
// off the Alchemy path: `t.kind === "stablecoin" ? sum + t.valueUsd : sum`,
// where valueUsd is a float balance multiplied by a float price. The two
// figures are built from different sources, so exact equality is the wrong
// bar and a comparison needs a tolerance.

/**
 * The smallest divergence worth calling a divergence.
 *
 * A cent, because a cent is the smallest amount of money anyone can be paid,
 * and below it the two figures are describing the same dollar.
 */
export const CASH_TOLERANCE_FLOOR_USD = "0.01";

/**
 * The share of the larger figure the two may differ by before it counts.
 *
 * 0.5%, and it is a proportion rather than another fixed amount because the
 * dominant source of honest divergence scales with the balance: the incumbent
 * values a stablecoin at its live feed price rather than at $1, so it lands a
 * few basis points from par on every dollar. That is fractions of a cent on a
 * small balance and dollars on a large one, and a fixed tolerance would flag
 * the large one every time.
 *
 * 50 bps sits well above the tens of basis points a healthy stablecoin feed
 * wanders by, and far below a real depeg (USDC traded at $0.88 in March 2023,
 * 12% off). Float rounding in the multiply is a further ~1e-15 relative, which
 * is noise inside this.
 */
export const CASH_TOLERANCE_RELATIVE = "0.005";

/**
 * A verdict on the two cash figures.
 *
 * "diverged" means the difference is larger than the incumbent's pricing and
 * rounding can explain, which points at one of the two real differences
 * between the sources rather than at arithmetic: a WALLET SET (the incumbent
 * reads the embedded wallets, the endpoint reports linked ones, so a wallet
 * the user connected themselves lands on one side only) or COVERAGE (the
 * incumbent spans five EVM chains plus Solana where this counts Base alone).
 * Both are real money in the wrong column, and neither is a rounding bug.
 */
export type CashAgreement =
  | { readonly verdict: "unknown"; readonly differenceUsd: null; readonly toleranceUsd: null }
  | {
      readonly verdict: "agree" | "diverged";
      /** |exact − incumbent|, as a plain decimal string. */
      readonly differenceUsd: string;
      /** The tolerance this verdict was reached with, as a plain decimal. */
      readonly toleranceUsd: string;
    };

// Both figures are compared as bigints at eighteen places, which is finer than
// either source resolves, so the comparison itself adds no error.
const COMPARISON_SCALE = 18;
const ONE = 10n ** BigInt(COMPARISON_SCALE);
const PLAIN_DECIMAL = /^-?\d+(?:\.\d+)?$/u;

/**
 * A decimal string at COMPARISON_SCALE places. Throws on anything else —
 * toBaseUnits answers 0n for a string it cannot read, and a zero produced that
 * way would read as a balance of nothing.
 */
function scaled(decimal: string): bigint {
  if (!PLAIN_DECIMAL.test(decimal.trim())) {
    throw new Error(`Not a plain decimal figure: ${decimal}`);
  }
  const negative = decimal.trim().startsWith("-");
  const magnitude = toBaseUnits(decimal.trim().replace("-", ""), COMPARISON_SCALE);
  return negative ? -magnitude : magnitude;
}

/**
 * The incumbent's float as the decimal string it actually holds.
 *
 * toFixed writes the double's own expansion, so 999.9 arrives as
 * 999.900000000000090949 — the error the float path already carries, stated
 * rather than hidden. It is refused above 1e21, where toFixed switches to
 * exponential notation, and for a non-finite figure. Both are defects in the
 * source rather than disagreements about money, and they throw instead of
 * returning "unknown", which is the verdict a not-yet-loaded balance gets and
 * would bury them.
 */
function decimalOf(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Incumbent cash figure is not finite: ${value}`);
  }
  if (Math.abs(value) >= 1e21) {
    throw new Error(`Incumbent cash figure is too large to write exactly: ${value}`);
  }
  return value.toFixed(COMPARISON_SCALE);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Whether the exact figure from spendableCash() and the incumbent
 * readyToSpendUsd() number agree.
 *
 * `incumbentUsd` is taken as a bare number rather than as the breakdown
 * module's type on purpose: lib/ may not import features/ (eslint
 * `boundaries`), and a structural parameter keeps this comparison usable from
 * either side of that line.
 *
 * A null `spendableUsd` is "unknown" — the one figure was never established,
 * so there is nothing to agree or disagree with, and saying so beats treating
 * a missing balance as a divergence and sending someone to look for a wallet
 * difference that is not there.
 */
export function compareCashFigures(
  spendableUsd: string | null,
  incumbentUsd: number
): CashAgreement {
  // Read before the null check so an unreadable incumbent is still reported:
  // it is a defect either way, and a null balance must not hide it.
  const incumbent = scaled(decimalOf(incumbentUsd));
  if (spendableUsd === null) {
    return { verdict: "unknown", differenceUsd: null, toleranceUsd: null };
  }
  const exact = scaled(spendableUsd);

  const difference = absolute(exact - incumbent);
  const larger = absolute(exact) > absolute(incumbent) ? absolute(exact) : absolute(incumbent);
  const relative = (larger * scaled(CASH_TOLERANCE_RELATIVE)) / ONE;
  const floor = scaled(CASH_TOLERANCE_FLOOR_USD);
  const tolerance = relative > floor ? relative : floor;

  return {
    verdict: difference <= tolerance ? "agree" : "diverged",
    differenceUsd: fromBaseUnits(difference, COMPARISON_SCALE),
    toleranceUsd: fromBaseUnits(tolerance, COMPARISON_SCALE),
  };
}
