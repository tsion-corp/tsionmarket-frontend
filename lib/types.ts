export type AssetClass = "US Stock" | "Crypto" | "Commodity" | "Treasury";

export interface Holding {
  sym: string;
  name: string;
  amount: string;
  price: string;
  chg: string;
  value: string;
  bg: string;
}

export interface Market {
  sym: string;
  name: string;
  ticker: string;
  price: string;
  chg: string;
  class: AssetClass;
  bg: string;
}

export interface AllocationSlice {
  name: string;
  pct: number;
  color: string;
}

export interface PerpMarket {
  pair: string;
  price: string;
  chg: string;
  active?: boolean;
}

export interface Position {
  side: "LONG" | "SHORT";
  pair: string;
  size: string;
  entry: string;
  pnl: string;
}

export interface Prediction {
  tag: string;
  vol: string;
  q: string;
  yes: string;
  no: string;
  pct: number;
  // CLOB identifiers for trading. Present on live Polymarket markets; absent on
  // the static fallback set (those cards are display-only).
  yesTokenId?: string;
  noTokenId?: string;
  conditionId?: string;
}

export type RwaCategory =
  "Treasuries" | "Tokenized Stocks" | "Gold" | "Real Estate" | "Private Credit";

export interface RwaAsset {
  key: string;
  sym: string;
  name: string;
  ticker: string;
  cat: RwaCategory;
  price: string;
  chg: string;
  up: boolean;
  mcap: string;
  yield: string;
  yieldLabel: string;
  bg: string;
  about: string;
  facts: string[];
}

export interface Interest {
  key: string;
  title: string;
  desc: string;
  icon: string;
}

export interface FundMethod {
  key: string;
  label: string;
  desc: string;
}
