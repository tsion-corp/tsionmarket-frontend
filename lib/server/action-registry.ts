import "server-only";
import { wsapiService } from "@/lib/wsapi-base";
import { CONTRACTS as POLYMARKET, POLYGON_CHAIN_ID } from "@/lib/polymarket/config";

// The activity feed reads raw token transfers, which only know a direction:
// money left the wallet, or arrived. That is why a game entry, a prediction
// buy, a perp margin deposit and a KASH purchase all used to read "Withdrew
// USDC" — each is just USDC leaving, to a contract the transfer log does not
// name.
//
// This registry names them. It maps every on-chain address the app itself owns
// or trades against to the action a transfer to (or from) it represents, so the
// feed can say "Bought KASH+" instead of "Withdrew USDC". Only our own
// addresses are here: no third party can know that USDC sent to the vault means
// a wager was placed.

const BASE_NETWORK = "base-mainnet";
const POLYGON_NETWORK = "polygon-mainnet";

export type ActionKind =
  | "entered_game"
  | "claimed_winnings"
  | "prediction_buy"
  | "prediction_payout"
  | "perp_margin"
  | "perp_return"
  | "bought_kash"
  | "arkade_deposit"
  | "arkade_withdraw";

export interface ActionContract {
  // The action when funds LEAVE the wallet to this contract (`out`) and when
  // they ARRIVE from it (`in`). Either side may be absent, in which case that
  // direction falls through to plain transfer wording.
  out?: ActionKind;
  in?: ActionKind;
}

// Alchemy network id -> lowercased address -> the action it stands for.
export type ActionRegistry = Record<string, Map<string, ActionContract>>;

// Avantis TradingStorage on Base: the perps collateral vault, and the approve
// spender the open flow targets. Margin out funds a position; a payout comes
// back on close.
const PERP_TRADING_STORAGE = "0x8a311D7048c35985aa31C131B9A13e03a5f7422d";
// The retired, non-upgradeable prediction market that still holds user shares
// (winners redeem from it directly). Same wording as the current one.
const LEGACY_PREDICTION = "0xF9A870d3C3c597Fe167a5c8DB8394dec7B2a2Aa5";

function put(
  map: Map<string, ActionContract>,
  address: string | undefined | null,
  contract: ActionContract
): void {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return;
  map.set(address.toLowerCase(), contract);
}

// The KASH treasury (where a purchase's USDC leg is sent) is configured by the
// Kash engine at runtime, not in source, so it is read from the engine's public
// /status. Cached: the address is effectively static and the feed refetches
// often. Any failure returns null and the treasury simply stays unlabelled that
// fetch, never breaking the rest of the registry.
async function kashPaymentAddress(): Promise<string | null> {
  const base = process.env.KASH_API_URL ?? wsapiService("kash");
  try {
    const res = await fetch(`${base}/status`, {
      headers: { accept: "application/json" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { chain?: { paymentAddress?: string } };
      chain?: { paymentAddress?: string };
    };
    return body?.data?.chain?.paymentAddress ?? body?.chain?.paymentAddress ?? null;
  } catch {
    return null;
  }
}

// Chess and draughts (checkers) share one server-custodial cashier wallet on
// Base: the games are settled off-chain, so the only USDC a user's wallet moves
// is funding that balance (out) and withdrawing from it (in). The wallet is a
// deployment secret, but the cashier config exposes its address publicly, so it
// is read at runtime like the KASH treasury. Same failure-tolerant shape.
async function arkadeCashierAddress(): Promise<string | null> {
  const base =
    process.env.CHESS_API_URL ?? process.env.NEXT_PUBLIC_CHESS_API_URL ?? wsapiService("chess");
  try {
    const res = await fetch(`${base}/cashier/config`, {
      headers: { accept: "application/json" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { depositAddress?: string };
      depositAddress?: string;
    };
    return body?.data?.depositAddress ?? body?.depositAddress ?? null;
  } catch {
    return null;
  }
}

// Build the map. Env-configured addresses (vault, prediction) and static ones
// (perp, legacy prediction, Polymarket) are always present; the KASH treasury
// is added when /status is reachable. Never throws.
export async function fetchActionRegistry(): Promise<ActionRegistry> {
  const base = new Map<string, ActionContract>();
  put(base, process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS, {
    out: "entered_game",
    in: "claimed_winnings",
  });
  put(base, process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS, {
    out: "prediction_buy",
    in: "prediction_payout",
  });
  put(base, LEGACY_PREDICTION, { out: "prediction_buy", in: "prediction_payout" });
  put(base, PERP_TRADING_STORAGE, { out: "perp_margin", in: "perp_return" });

  // Runtime-resolved addresses, fetched together. Each degrades to null on
  // failure, leaving the rest of the registry intact.
  const [treasury, cashier] = await Promise.all([kashPaymentAddress(), arkadeCashierAddress()]);
  put(base, treasury, { out: "bought_kash" });
  put(base, cashier, { out: "arkade_deposit", in: "arkade_withdraw" });

  // Prediction trades settle on Polygon through the Polymarket exchanges.
  const polygon = new Map<string, ActionContract>();
  if (POLYGON_CHAIN_ID === 137) {
    for (const address of [
      POLYMARKET.standardExchange,
      POLYMARKET.negRiskExchange,
      POLYMARKET.negRiskAdapter,
      POLYMARKET.conditionalTokens,
    ]) {
      put(polygon, address, { out: "prediction_buy", in: "prediction_payout" });
    }
  }

  return { [BASE_NETWORK]: base, [POLYGON_NETWORK]: polygon };
}

// The action a transfer represents, or undefined when its counterparty is not
// one of our contracts (a plain send or receive).
export function actionFor(
  registry: ActionRegistry,
  network: string,
  counterparty: string | null,
  direction: "in" | "out"
): ActionKind | undefined {
  if (!counterparty) return undefined;
  const contract = registry[network]?.get(counterparty.toLowerCase());
  if (!contract) return undefined;
  return direction === "out" ? contract.out : contract.in;
}
