import type { TokenAmount } from "@/features/casino/lib/vault-api";
import { GAME_ASSET } from "@/features/casino/lib/last-standing/stake";

// What a game amount is worth in dollars.
//
// v5 plays a game in whatever asset its starter chose, so there is no single
// price to multiply by any more. A USDC amount IS a dollar amount; an ETH
// amount needs the ETH price.
//
// Getting this wrong is not subtle. A 0.38 USDC pot priced at the ETH price
// showed as $925.68, and the same pot with no price at all showed as $0.00 —
// both seen on 2026-09-15, in the same game, on two different screens.
//
// The service's own `usdValue` is native-only by its contract and comes back as
// 0 for a token game, so it cannot be trusted as "already priced" either.

function isGameAsset(amount: TokenAmount): boolean {
  if (amount.token) return amount.token.toLowerCase() === GAME_ASSET.address.toLowerCase();
  return amount.tokenSymbol?.toUpperCase() === GAME_ASSET.symbol;
}

/** Dollars for one amount, or null when it cannot be priced. */
export function usdOf(amount: TokenAmount, ethPriceUsd: number): number | null {
  const size = Number(amount.amount);
  if (!Number.isFinite(size)) return null;
  if (isGameAsset(amount)) return size;
  if (!Number.isFinite(ethPriceUsd) || ethPriceUsd <= 0) return null;
  return size * ethPriceUsd;
}

/**
 * The same amount with its dollar figure filled in.
 *
 * An amount that cannot be priced keeps usdValue 0 and shows a dash, which is
 * what the service itself does for a token game: the alternative is printing a
 * number that is wrong by three orders of magnitude.
 */
export function priced(amount: TokenAmount, ethPriceUsd: number): TokenAmount {
  const usd = usdOf(amount, ethPriceUsd);
  if (usd === null) return { ...amount, usdValue: 0, formattedUsd: "—" };
  return { ...amount, usdValue: usd, formattedUsd: `$${usd.toFixed(2)}` };
}

// The assets a v5 game can be played in, by their own scale. A game carries its
// token on chain and on the wire; decimals are derived from it rather than
// assumed, because the one thing that must never happen is a 6-decimal amount
// read at 18 (a 0.38 USDC pot becomes 0.00000000000000038) or the reverse.
const NATIVE = "0x0000000000000000000000000000000000000000";

/** The decimals of the asset a game is played in. Native, hence 18, when unknown. */
export function decimalsForToken(token: string | null | undefined): number {
  if (!token) return 18;
  const lower = token.toLowerCase();
  if (lower === GAME_ASSET.address.toLowerCase()) return GAME_ASSET.decimals;
  return 18;
}

/** The symbol of the asset a game is played in. */
export function symbolForToken(token: string | null | undefined): string {
  return decimalsForToken(token) === GAME_ASSET.decimals ? GAME_ASSET.symbol : "ETH";
}

/** A base-unit amount as a decimal string at its own scale, with no invented precision. */
export function formatAtScale(raw: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = raw / unit;
  const fraction = (raw % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/**
 * A raw on-chain amount as the shape the vault API describes money in, priced.
 *
 * This is what a row built from the chain or from a socket frame goes through,
 * so it renders identically to an indexed row.
 */
export function rawToTokenAmount(
  raw: bigint,
  token: string | null | undefined,
  ethPriceUsd: number
): TokenAmount {
  const decimals = decimalsForToken(token);
  const base: TokenAmount = {
    amount: formatAtScale(raw, decimals),
    raw: raw.toString(),
    token: token ?? NATIVE,
    tokenSymbol: symbolForToken(token),
    decimals,
    usdValue: 0,
    formattedUsd: "—",
  };
  return priced(base, ethPriceUsd);
}
