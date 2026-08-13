import type { PageName } from "@/lib/analytics/events";
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
};

export function pageNameForSection(section: SectionId): PageName {
  return PAGE_BY_SECTION[section];
}

// Routes that are a nav section in their own right rather than a tab within
// the dashboard. Anything not listed is not a reportable section, so it sends
// no page_view rather than inventing a name for it.
const PAGE_BY_PATH_PREFIX: [string, PageName][] = [
  ["/casino", "arkade"],
  ["/prediction", "prediction"],
  ["/earn", "earn"],
  ["/activity", "arktivity"],
  ["/rwa", "real_assets"],
  ["/dashboard", "portfolio"],
];

/**
 * The section a pathname belongs to, or null when it is not one of the nav
 * sections (auth, interests, vault and the marketing root are all excluded).
 *
 * Longest prefix wins, so /casino/checkers reports as arkade rather than
 * matching nothing.
 */
export function pageNameForPath(pathname: string): PageName | null {
  const match = PAGE_BY_PATH_PREFIX.filter(([prefix]) => pathname.startsWith(prefix)).sort(
    (left, right) => right[0].length - left[0].length
  )[0];
  return match ? match[1] : null;
}
