import type { Prediction } from "@/lib/types";
import type { PredictionCategory } from "./categories";
import { categoryEventHref } from "./category-market-presenter";

// Polymarket tags a market with free text: "Global Elections", "Fed Rates",
// "counter strike 2". This app has seven categories and the market detail route
// takes one of them in the query string. Nothing in the feed states which, so
// the two vocabularies are joined here, by hand.
//
// It is a lookup and not a rule because the two vocabularies do not line up.
// "Games" is Polymarket's tag for a sports fixture, not for video games.
// "Weather" and "Esports" are real Polymarket sections that this app has no
// category for at all. A rule that scored words would get all three wrong.
//
// Keys are lowercased labels. Add a key when a label turns up often enough to
// be worth placing; leaving one out costs a link, not correctness.
const GAMMA_TAG_CATEGORIES: Readonly<Record<string, PredictionCategory>> = {
  // Sports must be matched rather than left out of the table. Skipping it would
  // let a later tag on the same event, "United States" on an NFL market say,
  // decide the category and file a football fixture under politics.
  sports: "sports",
  games: "sports",
  soccer: "sports",
  football: "sports",
  nfl: "sports",
  nba: "sports",
  "nba finals": "sports",
  mlb: "sports",
  nhl: "sports",
  basketball: "sports",
  baseball: "sports",
  hockey: "sports",
  tennis: "sports",
  atp: "sports",
  wta: "sports",
  "us open": "sports",
  golf: "sports",
  pga: "sports",
  boxing: "sports",
  ufc: "sports",
  mma: "sports",
  f1: "sports",
  "formula 1": "sports",
  cricket: "sports",
  rugby: "sports",
  olympics: "sports",
  "champions league": "sports",
  ucl: "sports",
  "ucl matchday": "sports",
  "premier league": "sports",
  epl: "sports",
  "la liga": "sports",
  "serie a": "sports",
  bundesliga: "sports",
  "efl championship": "sports",
  "efl cup": "sports",
  "carabao cup": "sports",
  cfb: "sports",
  "college football": "sports",
  "super bowl": "sports",
  "world cup": "sports",
  "team futures": "sports",
  // Esports sits with sports for the same reason: it is a fixture between two
  // competitors, this app has no category for it, and the refusal is the point.
  esports: "sports",
  "counter strike 2": "sports",
  cs2: "sports",
  "dota 2": "sports",
  "league of legends": "sports",
  valorant: "sports",

  politics: "politics",
  election: "politics",
  elections: "politics",
  "global elections": "politics",
  "world elections": "politics",
  "us election": "politics",
  "us elections": "politics",
  "u.s. election": "politics",
  "main election": "politics",
  "presidential election": "politics",
  president: "politics",
  primaries: "politics",
  midterms: "politics",
  geopolitics: "politics",
  "israel election": "politics",
  "french election": "politics",
  "russia election": "politics",
  "german election": "politics",
  "uk election": "politics",
  "international election props": "politics",
  congress: "politics",
  senate: "politics",
  "supreme court": "politics",
  impeachment: "politics",
  "peace deal": "politics",
  ceasefire: "politics",
  "iran ceasefire": "politics",
  nato: "politics",
  immigration: "politics",
  // Polymarket tags a market with the office holder it is about. These are
  // heads of state and the markets under them are about what they do in office.
  trump: "politics",
  biden: "politics",
  "hunter biden": "politics",
  putin: "politics",
  khamenei: "politics",

  crypto: "crypto",
  "crypto prices": "crypto",
  "crypto legal": "crypto",
  bitcoin: "crypto",
  btc: "crypto",
  ethereum: "crypto",
  eth: "crypto",
  solana: "crypto",
  xrp: "crypto",
  dogecoin: "crypto",
  memecoins: "crypto",
  altcoins: "crypto",
  stablecoins: "crypto",
  defi: "crypto",
  nft: "crypto",
  nfts: "crypto",

  // Finance and economy split the way this app's own category descriptions
  // split them: finance is "markets, rates and companies", economy is "growth,
  // inflation and employment". So the Fed's rate decision is finance and the
  // CPI print it reacts to is economy.
  finance: "finance",
  "finance updown": "finance",
  stocks: "finance",
  "stock market": "finance",
  equities: "finance",
  earnings: "finance",
  ipo: "finance",
  companies: "finance",
  commodities: "finance",
  oil: "finance",
  gold: "finance",
  silver: "finance",
  bonds: "finance",
  treasuries: "finance",
  fed: "finance",
  "fed rates": "finance",
  fomc: "finance",
  "jerome powell": "finance",
  "interest rates": "finance",
  "s&p 500": "finance",
  nasdaq: "finance",
  "dow jones": "finance",
  banks: "finance",

  economy: "economy",
  economics: "economy",
  "economic policy": "economy",
  inflation: "economy",
  cpi: "economy",
  "cpi release": "economy",
  "jobs report": "economy",
  unemployment: "economy",
  "jobless claims": "economy",
  gdp: "economy",
  recession: "economy",
  tariffs: "economy",
  "trade war": "economy",

  tech: "tech",
  technology: "tech",
  ai: "tech",
  "artificial intelligence": "tech",
  openai: "tech",
  anthropic: "tech",
  google: "tech",
  apple: "tech",
  microsoft: "tech",
  nvidia: "tech",
  spacex: "tech",
  space: "tech",
  software: "tech",
  internet: "tech",
  "social media": "tech",

  culture: "culture",
  "pop culture": "culture",
  entertainment: "culture",
  movies: "culture",
  film: "culture",
  music: "culture",
  awards: "culture",
  oscars: "culture",
  grammys: "culture",
  emmys: "culture",
  "golden globes": "culture",
  tv: "culture",
  celebrities: "culture",
  books: "culture",
  royals: "culture",
};

/**
 * The category a Polymarket event's tags place it in, or null when its tags say
 * nothing this app has a category for.
 *
 * The first recognised label wins, and the labels arrive in the order Gamma
 * lists them, which runs broad to narrow: an NFL market is tagged "Sports",
 * "Games", "NFL". Labels in between that mean nothing here, place names most
 * often, are stepped over rather than guessed at.
 *
 * Null is the fallback, and it is deliberately not a category. A market with no
 * category cannot be linked, and a card that does not open is a far smaller
 * failure than a card that opens the wrong screen.
 */
export function gammaTagCategory(labels?: readonly string[]): PredictionCategory | null {
  for (const label of labels ?? []) {
    const category = GAMMA_TAG_CATEGORIES[label.trim().toLowerCase()];
    if (category) return category;
  }
  return null;
}

/**
 * Where a Polymarket card opens, or undefined when it opens nowhere.
 *
 * A market needs both halves of the route to be linkable: the event id, which
 * the feed supplies, and a category, which it does not. Undefined is returned
 * for anything missing either.
 *
 * Sports and esports link like everything else. They used to be refused here,
 * on the reasoning that the sports half of the detail route is the sportsbook
 * and it is keyed by its own event ids rather than Gamma's. That was true of
 * the route, not of the data: the discovery endpoint the detail screen reads
 * takes the event id alone and serves a Gamma sports event as readily as a
 * Gamma politics one. The href carries `source=markets` so the route knows
 * which of its two products to open, and the refusal is no longer needed.
 *
 * It mattered more than one category's worth: same-day fixtures dominate 24h
 * volume, so sports is most of what the desk shows, and refusing it left the
 * first cards on the page dead.
 */
export function predictionDetailHref(prediction: Prediction): string | undefined {
  if (!prediction.eventId) return undefined;
  const category = gammaTagCategory(prediction.tagLabels);
  if (!category) return undefined;
  return categoryEventHref(prediction.eventId, category);
}
