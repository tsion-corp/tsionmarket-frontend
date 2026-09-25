// Builds the per-chain plan for sweeping every held asset out of the user's
// old Privy embedded wallets and into their new Decane wallets. Pure: no
// framework, no network, so the maths is unit tested. Amounts stay in integer
// base units (bigint), parsed from the portfolio's exact rawBalance string,
// never the float `balance`.

import type { TokenBalance } from "@/lib/server/alchemy";
import { isSponsoredEvmNetwork } from "@/lib/trade/sponsored-evm";

export const SOLANA_NETWORK = "solana-mainnet";
// Two dust floors, and a token clears BOTH to be swept.
//
// By balance: a wallet collects tokens holding a wei or two —
// 0.000000000000000001 of a unit — from airdrops and rounding. Below a
// millionth of one whole unit is a rounding remnant whatever the price, so
// this one needs no price and survives a feed outage.
export const DUST_MIN_BALANCE = 1e-6;
// By value: a token worth less than a tenth of a cent is dust, whatever its
// balance says, and whether or not it carries a price. It was a cent, and a
// person whose old account held tokens worth one and two cents watched them
// stay behind — small, but theirs, and "ignored" is how it read. A honeypot
// memecoin holding a real balance worth a hundredth of a cent still reverts on
// transfer and is still dropped here; an unpriced one is "$0.00" to the user
// and not worth a sponsored transaction either. The one exception is a
// chain's NATIVE coin with no price at all: that is a feed gap, not a
// worthless balance, and native is the money the gate exists for.
export const DUST_MIN_VALUE_USD = 0.001;

export interface SweepAsset {
  // Stable identity for progress tracking across retries.
  id: string;
  network: string;
  // Token contract/mint address, or null for the chain's native gas token.
  tokenAddress: string | null;
  symbol: string;
  decimals: number;
  amount: bigint;
  valueUsd: number;
}

export interface ChainSweep {
  network: string;
  // An EVM chain sweeps as one atomic sponsored batch; Solana sweeps one
  // sponsored transaction per asset.
  kind: "evm-batch" | "solana-sequential";
  assets: SweepAsset[];
}

export interface SweepPlan {
  chains: ChainSweep[];
  // Holdings the sweep cannot move: assets on EVM networks outside the gas
  // sponsorship registry. Without sponsorship the full native balance cannot
  // be sent (something must pay gas) and the batch path does not exist, so
  // these stay in the old wallet and the UI says so instead of failing.
  skipped: SweepAsset[];
}

export function sweepAssetId(network: string, tokenAddress: string | null): string {
  return `${network}:${tokenAddress ?? "native"}`;
}

// Groups held balances by chain, dropping zero balances, with each chain's
// tokens ordered before its native asset. Ordering matters on a chain where
// gas ever comes out of the native balance; under sponsorship it is free, but
// the invariant is kept so the plan never depends on it.
//
// Sponsored EVM chains sweep richest first, then Solana last; the order is
// derived from the holdings rather than a fixed list because the portfolio's
// tracked networks grow over time.
export function buildSweepPlan(tokens: TokenBalance[]): SweepPlan {
  const byNetwork = new Map<string, SweepAsset[]>();
  const skipped: SweepAsset[] = [];
  for (const token of tokens) {
    const amount = BigInt(token.rawBalance);
    // Balance, not dollar value, decides what moves. A price feed can drop out
    // and report every token as $0 — filtering on value would then strand a
    // wallet of real tokens. Anything the user holds gets swept; a worthless
    // one that reverts is caught by the per-asset retry, not by a value gate.
    if (amount <= 0n) continue;
    // A rounding remnant by balance, or — when it has a price — worth so little
    // it is not worth attempting. Dropped before the sponsored/stranded split
    // so it is neither swept nor listed as stuck. An unpriced token
    // (priceUsd === 0) is kept: the feed may simply not cover it.
    if (token.balance < DUST_MIN_BALANCE) continue;
    const unpricedNative = token.address === null && token.priceUsd === 0;
    if (!unpricedNative && token.valueUsd < DUST_MIN_VALUE_USD) continue;
    const asset: SweepAsset = {
      id: sweepAssetId(token.network, token.address),
      network: token.network,
      tokenAddress: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      amount,
      valueUsd: token.valueUsd,
    };
    if (token.network !== SOLANA_NETWORK && !isSponsoredEvmNetwork(token.network)) {
      skipped.push(asset);
      continue;
    }
    const group = byNetwork.get(token.network);
    if (group) group.push(asset);
    else byNetwork.set(token.network, [asset]);
  }

  return { chains: groupSweepAssets([...byNetwork.values()].flat()), skipped };
}

// Groups sweepable assets into per-chain sweeps: EVM chains richest first,
// Solana last, tokens before each chain's native coin. Exported so a venue
// adapter can rebuild the chains from the subset of assets a run selected.
export function groupSweepAssets(assets: readonly SweepAsset[]): ChainSweep[] {
  const byNetwork = new Map<string, SweepAsset[]>();
  for (const asset of assets) {
    const group = byNetwork.get(asset.network);
    if (group) group.push(asset);
    else byNetwork.set(asset.network, [asset]);
  }
  const chainValue = (group: SweepAsset[]) => group.reduce((sum, a) => sum + a.valueUsd, 0);
  const evmNetworks = [...byNetwork.keys()]
    .filter((network) => network !== SOLANA_NETWORK)
    .sort((a, b) => chainValue(byNetwork.get(b)!) - chainValue(byNetwork.get(a)!));
  const ordered = byNetwork.has(SOLANA_NETWORK) ? [...evmNetworks, SOLANA_NETWORK] : evmNetworks;
  return ordered.map((network) => {
    const group = byNetwork.get(network)!;
    const tokensFirst = [
      ...group.filter((a) => a.tokenAddress !== null),
      ...group.filter((a) => a.tokenAddress === null),
    ];
    return {
      network,
      kind: network === SOLANA_NETWORK ? "solana-sequential" : "evm-batch",
      assets: tokensFirst,
    };
  });
}
