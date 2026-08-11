import type { MemeToken } from "@/lib/meme/api";
import type { DepositPrefill } from "@/lib/voice/intent";

export interface StatLine {
  k: string;
  v: string;
  c?: string;
}

export interface DetailPayload {
  sym: string;
  name: string;
  sub: string;
  price: string;
  chg: string;
  bg: string;
  stats: StatLine[];
  cta?: string;
  onCta?: () => void;
  // Optional secondary action, rendered as an outlined button below the primary
  // one (e.g. "Sell" beside "Buy more" on a held asset).
  cta2?: string;
  onCta2?: () => void;
  coingeckoId?: string;
  up?: boolean;
  logo?: string | null;
  // Show only the candlestick chart, with no area option. Set for the simple
  // spot flow, which is candles-only.
  candlesOnly?: boolean;
}

export interface ConfirmPayload {
  eyebrow: string;
  badgeSym?: string;
  badgeBg?: string;
  badgeLogo?: string | null;
  title: string;
  sub: string;
  lines: StatLine[];
  cta: string;
  successTitle: string;
  successMsg: string;
}

// The asset a buy sheet opens for. The sheet resolves its own routes from the
// symbol; priceUsd drives the instant "you get about" estimate.
export interface BuyPayload {
  symbol: string;
  name: string;
  priceUsd: number;
  logo?: string | null;
}

// A held asset a sell sheet operates on. Sells settle to USDC on Base, so the
// sheet needs the origin token's identity (network/address/decimals), the
// balance available to sell, and priceUsd for the "you get about" estimate.
export interface SellPayload {
  symbol: string;
  name: string;
  network: string;
  address: string | null;
  decimals: number;
  balance: number;
  // Exact on-chain balance in base units, so a "max" sell sends precisely what
  // the wallet holds instead of a rounded float.
  rawBalance: string;
  priceUsd: number;
  logo?: string | null;
}

// A held RWA to trade. RWA buy/sell must go through the RWA service (quote +
// build), never Dextopus, so holdings resolve the registry asset by network and
// address and open the RWA trade panel on the requested side.
export interface RwaTradePayload {
  network: string;
  address: string;
  symbol: string;
  mode: "buy" | "sell";
}

export type DashboardModal =
  | { type: "detail"; detail: DetailPayload }
  | { type: "confirm"; confirm: ConfirmPayload }
  | { type: "buy"; buy: BuyPayload }
  | { type: "sell"; sell: SellPayload }
  | { type: "rwaTrade"; rwaTrade: RwaTradePayload }
  | { type: "memeSell"; memeSell: MemeToken }
  | { type: "funds"; deposit?: DepositPrefill }
  | { type: "withdraw" }
  | { type: "crossBorder" }
  | { type: "account" }
  | { type: "done"; title: string; msg: string }
  | null;

export type { SectionId as DashboardSection } from "@/lib/sections";
