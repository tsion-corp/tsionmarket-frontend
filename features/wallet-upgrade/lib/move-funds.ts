import { base58 } from "@scure/base";
import { formatUnits, isAddress } from "viem";
import {
  buildSweepPlan,
  SOLANA_NETWORK,
  type ChainSweep,
  type SweepAsset,
} from "@/lib/migration/sweep-plan";
import type { TokenBalance } from "@/lib/server/alchemy";
import type { SettleOutcome } from "@/lib/migration/types";
import { networkLabel } from "@/lib/trade/networks";

/**
 * Moving funds from the old (Decane) wallet to the new wallet. Pure: what is
 * checked, what is shown, and what a result means live here so they can be
 * tested without a wallet or a network. The actual sends are the existing
 * sweep's (features/migrate/lib/sweep), run with a Decane signer.
 */

/**
 * The only networks funds can be moved from for now. Everything else is still
 * shown, greyed out, so people can see it is there and is not being forgotten,
 * but it is never planned and never sent. Widening this is one line.
 */
export const MOVABLE_NETWORKS: ReadonlySet<string> = new Set([
  "eth-mainnet",
  "arb-mainnet",
  SOLANA_NETWORK,
]);

export const LOCKED_REASON = "Moving from this network isn't available yet.";

export interface Addresses {
  evm: string | null;
  solana: string | null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function isSolanaAddress(value: string): boolean {
  try {
    return base58.decode(value).length === 32;
  } catch {
    return false;
  }
}

/**
 * What stops money going to these addresses. Empty means safe to send. Run just
 * before sending, not only when the page loads.
 *
 * The destination is the NEW wallet; sending to the address the money is
 * already at would pay fees for nothing, and a malformed address is the one
 * mistake that loses funds outright.
 */
export function destinationProblems(destinations: Addresses, sources: Addresses): string[] {
  const problems: string[] = [];
  if (!destinations.evm && !destinations.solana) {
    problems.push("Your new wallet has no address to receive funds yet.");
  }
  if (destinations.evm) {
    if (!isAddress(destinations.evm, { strict: false })) {
      problems.push("Your new wallet's Ethereum address isn't valid.");
    } else if (sources.evm && same(destinations.evm, sources.evm)) {
      problems.push("Your new wallet's Ethereum address is the same as your old one.");
    }
  }
  if (destinations.solana) {
    if (!isSolanaAddress(destinations.solana)) {
      problems.push("Your new wallet's Solana address isn't valid.");
    } else if (sources.solana && destinations.solana === sources.solana) {
      problems.push("Your new wallet's Solana address is the same as your old one.");
    }
  }
  return problems;
}

/**
 * The signed-in old account must be the one the link recorded. A session for a
 * different account would read, and spend from, a wallet that is not the one
 * being upgraded.
 */
export function sourcesMatchLink(session: Addresses, linked: Addresses | null): boolean {
  if (!linked) return false;
  const evmOk = !linked.evm || (session.evm !== null && same(session.evm, linked.evm));
  const solOk = !linked.solana || session.solana === linked.solana;
  return evmOk && solOk && Boolean(linked.evm || linked.solana);
}

export function destinationsFromWallet(
  addresses: ReadonlyArray<{ family: string; address: string }>
): Addresses {
  return {
    evm: addresses.find((a) => a.family === "evm")?.address ?? null,
    solana: addresses.find((a) => a.family === "solana")?.address ?? null,
  };
}

export interface MoveAssetView {
  id: string;
  symbol: string;
  amountText: string;
  valueUsd: number;
  native: boolean;
}

export interface MoveChainView {
  network: string;
  label: string;
  /** Gas is covered by us on this chain. */
  sponsored: boolean;
  assets: MoveAssetView[];
  totalUsd: number;
}

export interface StuckView {
  network: string;
  label: string;
  assets: MoveAssetView[];
  reason: string;
}

export interface MovePlanView {
  /** What the one button will send. */
  chains: ChainSweep[];
  view: MoveChainView[];
  /** Held, on a network that is not switched on for moving. Shown greyed out. */
  locked: StuckView[];
  /** Held, on a network that is on, but not movable from here. The reason is in words. */
  stuck: StuckView[];
  totalUsd: number;
}

function amountText(asset: SweepAsset): string {
  const text = formatUnits(asset.amount, asset.decimals);
  const [whole, frac = ""] = text.split(".");
  const trimmed = frac.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : (whole ?? text);
}

function assetView(asset: SweepAsset): MoveAssetView {
  return {
    id: asset.id,
    symbol: asset.symbol,
    amountText: amountText(asset),
    valueUsd: asset.valueUsd,
    native: asset.tokenAddress === null,
  };
}

/**
 * From the old wallet's balances to what would move.
 *
 * A chain where we don't pay the gas needs some of its own coin to pay it. With
 * tokens and no coin the transfers would all fail, so those are listed as stuck
 * with the reason instead of being attempted.
 */
export function planMove(
  tokens: TokenBalance[],
  allowed: ReadonlySet<string> = MOVABLE_NETWORKS
): MovePlanView {
  const { chains, skipped } = buildSweepPlan(tokens);
  const runnable: ChainSweep[] = [];
  const stuck: StuckView[] = [];
  const locked: StuckView[] = [];

  const lockedView = (network: string, assets: SweepAsset[]): StuckView => ({
    network,
    label: network === SOLANA_NETWORK ? "Solana" : networkLabel(network),
    assets: assets.map(assetView),
    reason: LOCKED_REASON,
  });

  for (const chain of chains) {
    // Off the allowlist: listed, greyed, never sent. Checked first so nothing
    // below can put a locked network back in the plan.
    if (!allowed.has(chain.network)) {
      locked.push(lockedView(chain.network, chain.assets));
      continue;
    }
    const hasNative = chain.assets.some((a) => a.tokenAddress === null);
    if (chain.kind === "evm-user-paid" && !hasNative) {
      stuck.push({
        network: chain.network,
        label: networkLabel(chain.network),
        assets: chain.assets.map(assetView),
        reason: "There's no coin on this network to pay its fee, and we can't cover it here.",
      });
      continue;
    }
    runnable.push(chain);
  }
  for (const network of new Set(skipped.map((a) => a.network))) {
    if (!allowed.has(network)) {
      locked.push(
        lockedView(
          network,
          skipped.filter((a) => a.network === network)
        )
      );
      continue;
    }
    stuck.push({
      network,
      label: networkLabel(network),
      assets: skipped.filter((a) => a.network === network).map(assetView),
      reason: "This network can't be sent from here.",
    });
  }

  const view = runnable.map((chain): MoveChainView => {
    const assets = chain.assets.map(assetView);
    return {
      network: chain.network,
      label: chain.network === SOLANA_NETWORK ? "Solana" : networkLabel(chain.network),
      sponsored: chain.kind !== "evm-user-paid",
      assets,
      totalUsd: assets.reduce((sum, a) => sum + a.valueUsd, 0),
    };
  });
  return {
    chains: runnable,
    view,
    locked,
    stuck,
    totalUsd: view.reduce((sum, c) => sum + c.totalUsd, 0),
  };
}

/**
 * The last line of defence: whatever reaches the sender, nothing on a network
 * that is not switched on gets through. Throws rather than quietly dropping, so
 * a bug upstream is loud, not a silent partial move.
 */
export function assertMovable(
  chains: ChainSweep[],
  allowed: ReadonlySet<string> = MOVABLE_NETWORKS
): void {
  const bad = chains.find((chain) => !allowed.has(chain.network));
  if (bad) throw new Error(`Moving from ${bad.network} isn't switched on.`);
}

/** Nothing left to move from here. A wallet with only unmovable assets counts. */
export const nothingToMove = (plan: MovePlanView): boolean => plan.chains.length === 0;

/** A rehearsal: every asset "succeeds" and nothing is sent. */
export function dryRunOutcomes(chains: ChainSweep[]): Map<string, SettleOutcome> {
  const outcomes = new Map<string, SettleOutcome>();
  for (const chain of chains) {
    for (const asset of chain.assets) outcomes.set(asset.id, { ok: true, txHashes: ["dry-run"] });
  }
  return outcomes;
}

export interface MoveSummary {
  moved: number;
  failed: number;
  usdMoved: number;
  firstError: string | null;
  /** Something failed that is worth trying again. */
  retryable: boolean;
  failures: Array<{ id: string; symbol: string; network: string; error: string }>;
}

export function summarizeMove(
  chains: ChainSweep[],
  outcomes: Map<string, SettleOutcome>
): MoveSummary {
  const summary: MoveSummary = {
    moved: 0,
    failed: 0,
    usdMoved: 0,
    firstError: null,
    retryable: false,
    failures: [],
  };
  for (const chain of chains) {
    for (const asset of chain.assets) {
      const outcome = outcomes.get(asset.id);
      if (outcome?.ok) {
        summary.moved += 1;
        summary.usdMoved += asset.valueUsd;
        continue;
      }
      // Absent counts as failed: an asset the run never reached has not moved.
      const error = outcome && !outcome.ok ? outcome.error : "Not attempted.";
      summary.failed += 1;
      summary.firstError ??= error;
      if (!outcome || outcome.retryable) summary.retryable = true;
      summary.failures.push({ id: asset.id, symbol: asset.symbol, network: asset.network, error });
    }
  }
  return summary;
}
