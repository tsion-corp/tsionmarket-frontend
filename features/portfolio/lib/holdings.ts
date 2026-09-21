import { isFeeSponsoredNetwork } from "@/lib/trade/sponsored-evm";
import { SOLANA_CHAIN_ID, chainIdOfNetwork } from "@/lib/meme/chain";
import type { MemeToken, PortfolioPosition } from "@/lib/meme/types";
import type { TokenBalance } from "@/lib/server/alchemy";
import { DUST_USD, isDustHolding, isUnpricedHolding } from "@/lib/portfolio/dust";

// Deposits currently settle as USDC on Base and sit in the wallet as spendable
// cash, not as a position the user chose to hold. Until per-deposit tracking
// lands, the holdings table shows bought assets only, so this settlement balance
// is filtered out of that view. Every other consumer of the portfolio (trade
// balances, swap net-balances, global search, funding) still sees the token,
// because the user needs that USDC to buy with. This is display-only.
//
// The portfolio allowlist (lib/server/alchemy) guarantees only the real Base
// USDC contract ever reaches here under the "USDC" symbol, so matching on symbol
// and network is exact. A spoofed token cannot reach this point.
const SETTLEMENT_NETWORK = "base-mainnet";
const SETTLEMENT_SYMBOL = "USDC";

// True for the USDC-on-Base deposit float that the holdings table hides.
export function isDepositSettlementToken(token: TokenBalance): boolean {
  return token.network === SETTLEMENT_NETWORK && token.symbol === SETTLEMENT_SYMBOL;
}

// The bought-asset set shown in the holdings table: the portfolio minus the
// deposit settlement float. USDT, RWAs, native gas tokens, and every other
// holding pass through unchanged.
export function selectHoldings(tokens: TokenBalance[]): TokenBalance[] {
  const canPayFeeOn = networksWithNativeBalance(tokens);
  return tokens.filter(
    (token) => !isDepositSettlementToken(token) && !isUnsellableHolding(token, canPayFeeOn)
  );
}

// Networks where the wallet holds some of the chain's own coin. A native row is
// the one with no contract address.
function networksWithNativeBalance(tokens: TokenBalance[]): Set<string> {
  const networks = new Set<string>();
  for (const token of tokens) {
    if (token.address === null && token.balance > 0) networks.add(token.network);
  }
  return networks;
}

/**
 * True for a holding this wallet has no way to sell.
 *
 * Gas is meant to be invisible here: on every sponsored network the platform
 * pays the fee, so a sale costs the owner nothing. A handful of chains cannot
 * be sponsored (HyperEVM, ApeChain and opBNB all reject the EIP-7702 entry
 * point our bundler uses, see PR #401), and there the transfer is paid by the
 * sender in the chain's own coin. A wallet holding none of that coin can start
 * a sale but never finish it, which is what a tester hit selling USD₮0 on
 * HyperEVM on 2026-09-12.
 *
 * Rather than offer a sale that fails, the table leaves the row out. The
 * balance is untouched and every other consumer of the portfolio still sees it;
 * this is display-only, like the settlement float above.
 */
function isUnsellableHolding(token: TokenBalance, canPayFeeOn: Set<string>): boolean {
  if (isFeeSponsoredNetwork(token.network)) return false;
  return !canPayFeeOn.has(token.network);
}

// The floor the holdings table renders as "$0.00": one rounded cent.
const ZERO_VALUE_USD = 0.005;

// True for a row the "hide zero-value assets" toggle should drop: the
// always-present USDC/USDT/native baseline (balance 0) and dust that rounds to
// $0.00.
//
// A held balance we could not PRICE is deliberately not zero-value. valueUsd is
// balance x price, so an unpriced holding is $0 while the balance is real, and
// hiding it tells the owner they do not have something they do — which is how a
// delivered APE on ApeChain and a delivered HYPE on HyperEVM both read as "the
// app didn't show it". Only the portfolio allowlist decides what is a real
// holding, so anything reaching here with a balance has already been recognized
// and is worth showing at an unknown value rather than not at all.
export function isZeroValueHolding(token: TokenBalance): boolean {
  if (isUnpricedHolding(token)) return false;
  return token.valueUsd < ZERO_VALUE_USD;
}

/**
 * True for a row the "hide small balances" toggle drops: the always-present
 * USDC/USDT/native baseline at zero, and anything worth under a cent.
 *
 * The second half is what unsolicited tokens land in. Anyone can mint a token
 * and send it to any address, so a list that keeps them buries the holdings the
 * owner actually has under names they have never heard of. The toggle still
 * reveals them, because they are theirs.
 */
export function isSmallBalance(token: TokenBalance): boolean {
  return isZeroValueHolding(token) || isDustHolding(token);
}

// The dust and unpriced rules live in lib so the balance figure and these
// views cannot drift apart. Re-exported here because this is where the
// portfolio views already look for them.
export { DUST_USD, isDustHolding, isUnpricedHolding };

/**
 * A held trade-service memecoin as the trade sheet's token, on the chain the
 * holding lives on, or null for anything else.
 *
 * The sheet re-fetches the fresh listing (risk, tradability) by chainId and
 * address itself. It was built with Base's 8453 for every meme, so a Solana
 * coin's sale was quoted on the wrong chain. The address goes through as the
 * balance feed wrote it: a Solana mint is case-sensitive.
 */
export function memeTokenOf(token: TokenBalance): MemeToken | null {
  if (token.meme !== true || token.address === null) return null;
  const chainId = chainIdOfNetwork(token.network);
  if (chainId === null) return null;
  return {
    chainId,
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    logoUrl: token.logo,
    // Unpriced stays null: the sheet shows no price rather than "0".
    priceUsd: token.priceUsd > 0 ? String(token.priceUsd) : null,
    liquidityUsd: null,
    volume24hUsd: null,
    priceChange24hPercent: null,
    marketCapUsd: null,
    fdvUsd: null,
    pairAddress: null,
    dexName: null,
    riskLevel: "UNKNOWN",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
  };
}

/**
 * The holdings minus the memecoins the trade service has a position for.
 *
 * The service's /portfolio is the record of what was bought through it, with
 * cost basis and P&L, and the Memecoins section shows it. Listing the same coin
 * again here from its wallet balance would show it twice at two values. A
 * balance the service does not know (an airdrop, a transfer in) stays. Identity
 * is chainId + address: an EVM address compares without case, a Solana mint
 * exactly as written.
 */
export function withoutServiceKnownMemes(
  tokens: TokenBalance[],
  positions: readonly Pick<PortfolioPosition, "chainId" | "address">[]
): TokenBalance[] {
  if (positions.length === 0) return tokens;
  const keyOf = (chainId: number, address: string) =>
    `${chainId}:${chainId === SOLANA_CHAIN_ID ? address : address.toLowerCase()}`;
  const known = new Set(positions.map((p) => keyOf(p.chainId, p.address)));
  return tokens.filter((token) => {
    if (token.address === null) return true;
    const chainId = chainIdOfNetwork(token.network);
    return chainId === null || !known.has(keyOf(chainId, token.address));
  });
}
