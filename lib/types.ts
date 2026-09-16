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
  // The same volume as a plain dollar amount, so a surface that shows money in
  // the reader's own currency can hand it to the money layer instead of parsing
  // the dollars back out of `vol`. Absent when the feed states no volume: a
  // market that reports nothing must not read as one that traded nothing.
  volumeUsd?: number;
  q: string;
  yes: string;
  no: string;
  pct: number;
  // Market artwork from Polymarket (an S3 image URL). Present on live markets;
  // absent on the static fallback set, so the card falls back to a plain header.
  image?: string | null;
  // CLOB identifiers for trading. Present on live Polymarket markets; absent on
  // the static fallback set (those cards are display-only).
  yesTokenId?: string;
  noTokenId?: string;
  conditionId?: string;
  // When the market resolves, ISO 8601, straight from the feed. Absent on the
  // static fallback set and on any market Gamma gives no date for. It is the
  // raw instant rather than a formatted duration on purpose: a countdown has to
  // be recomputed every second, so only the view can turn this into text.
  endsAt?: string;
  // The Polymarket event this market belongs to, and the event's tag labels as
  // the feed spells them. Both are absent on the static fallback set.
  //
  // `conditionId` identifies the market on chain but no route in this app takes
  // one, so it cannot open anything. The event id can: the market detail route
  // is keyed by it. It is kept as the digits-only string the route accepts,
  // never a number, because it is an identifier and not a quantity.
  //
  // The tag labels are free text from the feed and are not a category. Mapping
  // them onto the app's own categories is the prediction feature's job, since
  // that is where the category union lives.
  eventId?: string;
  tagLabels?: string[];
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
