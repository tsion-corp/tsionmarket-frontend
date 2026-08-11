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
