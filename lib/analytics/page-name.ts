import type { CampaignTags, PageName } from "@/lib/analytics/events";
import type { SectionId } from "@/lib/sections";

// The app's own section ids and the names the analytics catalog reports are
// deliberately not the same strings: the catalog was agreed with the people
// reading the reports, and renaming either side to match would break one of
// them. This is the one place the two vocabularies meet.
const PAGE_BY_SECTION: Record<SectionId, PageName> = {
  portfolio: "portfolio",
  spot: "spot",
  perps: "perpetuals",
  meme: "memecoins",
  rwa: "real_assets",
  prediction: "prediction",
  earn: "earn",
  casino: "arkade",
  activity: "arktivity",
  square: "market_square",
};

export function pageNameForSection(section: SectionId): PageName {
  return PAGE_BY_SECTION[section];
}

// Paths that are exactly one page. Checked before the prefixes below, so "/"
// does not match everything.
const PAGE_BY_EXACT_PATH: Record<string, PageName> = {
  "/": "landing",
  "/welcome": "welcome",
  "/auth": "auth",
  "/interests": "interests",
  "/vault": "vault",
  "/privacy": "privacy",
  "/terms": "terms",
  "/dashboard": "portfolio",
  "/portfolio": "portfolio",
  "/spot": "spot",
  "/perps": "perpetuals",
  "/meme": "memecoins",
  "/rwa": "real_assets",
  "/market": "spot",
  "/prediction": "prediction",
  "/earn": "earn",
  "/casino": "arkade",
  "/activity": "arktivity",
  "/square": "market_square",
};

// Everything else, longest prefix first. The games are named individually
// because "which game" is the question asked of Arkade most often, and a single
// "arkade" row cannot answer it.
const PAGE_BY_PREFIX: [string, PageName][] = [
  ["/casino/chess", "arkade_chess"],
  ["/casino/checkers", "arkade_checkers"],
  ["/casino/last-standing", "arkade_last_man"],
  ["/casino/arkball", "arkade_arkball"],
  ["/casino/arkjet", "arkade_arkjet"],
  ["/casino/chicken", "arkade_chicken"],
  ["/casino", "arkade"],
  ["/prediction", "prediction_market"],
  ["/earn/listing", "earn_listing"],
  ["/earn", "earn"],
  ["/spot/", "spot_asset"],
  ["/trade/", "spot_asset"],
  ["/square", "market_square"],
  ["/activity", "arktivity"],
  ["/rwa", "real_assets"],
  ["/meme", "memecoins"],
  ["/portfolio", "portfolio"],
  ["/dashboard", "portfolio"],
];

/**
 * The name of the page a pathname is, or null when it has none.
 *
 * A null is not a reason to skip the event: `page_view` always carries the raw
 * `path`, so an unnamed route is still visible in the data. The name exists so
 * that the pages anyone reports on group into one row each instead of one row
 * per id in the URL.
 */
export function pageNameForPath(pathname: string): PageName | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const exact = PAGE_BY_EXACT_PATH[path];
  if (exact) return exact;

  const match = PAGE_BY_PREFIX.filter(([prefix]) => path.startsWith(prefix)).sort(
    (left, right) => right[0].length - left[0].length
  )[0];
  return match ? match[1] : null;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

/**
 * The campaign tags on a URL's query string.
 *
 * Read off each page rather than only the one the session started on: a link
 * clicked mid-session is a campaign arrival too, and the SDK's own utm handling
 * only ever sees the boot URL. Tags that are not there are left out, so a page
 * with no campaign sends no empty strings.
 */
export function campaignTags(search: string): CampaignTags {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tags: CampaignTags = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) tags[key] = value;
  }
  return tags;
}
