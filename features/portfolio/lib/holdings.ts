import type { TokenBalance } from "@/lib/server/alchemy";

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
  return tokens.filter((token) => !isDepositSettlementToken(token));
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
  if (token.balance > 0 && token.priceUsd === 0) return false;
  return token.valueUsd < ZERO_VALUE_USD;
}
