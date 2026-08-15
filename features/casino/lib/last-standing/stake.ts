// What it costs to open or join a Last Man game.
//
// v4 has no entry fee endpoint and no global entryFee() on the contract. The
// contract exposes minStartStake(), a floor, and whoever opens a game chooses
// its stake above that floor; that stake becomes the game's minWager for
// everyone who joins. So the number a player sees is ours to pick, and this is
// where it is picked.
//
// The figure is held in dollars because that is how it was decided, and
// converted to wei at the current ETH price at the moment of the transaction.
// Everything here is integer arithmetic: a stake is an on-chain amount, and a
// float would round it wrong.

/** The default cost to open or join a game, in USD. */
export const DEFAULT_ENTRY_USD = 0.38;

const WEI_PER_ETH = 10n ** 18n;
// Prices and dollar figures are scaled to integers before dividing, so the
// conversion never touches floating point beyond the price it was handed.
const SCALE = 1_000_000n;

function toScaled(value: number): bigint {
  return BigInt(Math.round(value * Number(SCALE)));
}

/**
 * `usd` worth of ETH, in wei, at `ethPriceUsd`.
 *
 * Returns 0n for a price we do not have yet, which callers must treat as "not
 * ready" rather than free: sending a zero-value startGame would revert against
 * the contract's floor anyway, but a disabled button says so sooner.
 */
export function usdToWei(usd: number, ethPriceUsd: number): bigint {
  if (!Number.isFinite(usd) || !Number.isFinite(ethPriceUsd) || ethPriceUsd <= 0 || usd <= 0) {
    return 0n;
  }
  return (toScaled(usd) * WEI_PER_ETH) / toScaled(ethPriceUsd);
}

/** What `wei` is worth in dollars at `ethPriceUsd`. For display only. */
export function weiToUsd(wei: bigint, ethPriceUsd: number): number {
  if (!Number.isFinite(ethPriceUsd) || ethPriceUsd <= 0) return 0;
  return (Number(wei) / Number(WEI_PER_ETH)) * ethPriceUsd;
}

/**
 * A wei amount as the shape the vault API describes money in, so a row built
 * from the chain renders through the same components as an indexed one.
 */
export function weiToTokenAmount(
  wei: bigint,
  ethPriceUsd: number
): { amount: string; tokenSymbol: string; usdValue: number; formattedUsd: string } {
  const usd = weiToUsd(wei, ethPriceUsd);
  return {
    amount: String(Number(wei) / Number(WEI_PER_ETH)),
    tokenSymbol: "ETH",
    usdValue: usd,
    formattedUsd: `$${usd.toFixed(2)}`,
  };
}

/**
 * The stake to actually send: what we asked for, or the contract's floor when
 * that is higher.
 *
 * The floor moves with governance and with the ETH price, so a hardcoded
 * dollar figure can fall under it. Sending the lower number would revert with
 * StakeBelowMinimum; sending the floor just costs the player a little more
 * than the label promised, which the confirm sheet shows before they sign.
 */
export function stakeToSend(wantedWei: bigint, minStartStakeWei: bigint): bigint {
  return wantedWei > minStartStakeWei ? wantedWei : minStartStakeWei;
}

/** ETH as a decimal string, trimmed, for display next to a dollar figure. */
export function formatEth(wei: bigint, maxDecimals = 6): string {
  const whole = wei / WEI_PER_ETH;
  const fraction = (wei % WEI_PER_ETH).toString().padStart(18, "0").slice(0, maxDecimals);
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : `${whole}`;
}
