// Spot and perpetuals are separate sections with their own sidebar entries;
// each carries its own simple/pro interface switch inside.
export type SectionId =
  | "portfolio"
  | "spot"
  | "perps"
  | "meme"
  | "rwa"
  | "prediction"
  | "earn"
  | "casino"
  | "activity"
  // The Market Square page. A section for the rail's highlight and the
  // route map only: the rail seats its entry by hand between Prediction and
  // Arkade, so it is not in the reorderable list below.
  | "square";

export const SECTION_LABEL: Record<SectionId, string> = {
  portfolio: "Portfolio",
  spot: "Spot",
  perps: "Perpetuals",
  meme: "Memecoins",
  rwa: "Real assets",
  prediction: "Prediction",
  earn: "Earn",
  casino: "Arkade",
  // "Arkivity" is the product name, and it is what `sections.activity` says
  // in all five catalogues. This fallback only stands in when buildNav is
  // called without a translate function, so it must not disagree with the
  // translated string it is standing in for.
  activity: "Arkivity",
  square: "Square",
};

// Portfolio is always the account home. The rest follow, led by whatever the
// user picked during onboarding.
const PINNED: SectionId = "portfolio";
const REORDERABLE: SectionId[] = [
  "spot",
  // Perpetuals are hidden on production for now (#382). Staging is where the
  // perps desk is exercised, so it stays in the nav here.
  "perps",
  "meme",
  "rwa",
  "prediction",
  // Earn is hidden from the nav for now.
  // "earn",
  "casino",
  "activity",
];

/**
 * Sections kept out of the navigation.
 *
 * A visibility switch, not a removal, the way MARKET_SQUARE_HIDDEN in
 * lib/market-square.ts is. Everything behind a listed id stays wired: its
 * route, its slice, its holdings in the portfolio breakdown. The id is only
 * not offered as a way in.
 *
 * buildNav in components/layout/nav-items.tsx is the single reader, so the
 * desktop rail, the phone drawer, the marquee and the dashboard's brief order
 * all drop a hidden section together.
 *
 * Real assets returned on 2026-09-09 once the gateway's rwa and gas-sponsor
 * services were confirmed live in production.
 *
 * Perpetuals and Prediction are listed on 2026-09-16. Perps is a product
 * decision: the desk is exercised on staging and is not offered here yet.
 * Prediction is not a choice at all, it is what production can serve. The
 * gateway's `prediction` service answers 502 on api.tsionark.com, so the
 * sportsbook and combo routes behind /prediction have nothing to call. Note
 * that `prediction-market`, a different service, IS live; it is unaffected.
 *
 * To offer a section again, take its id out of this list; nothing else
 * changes.
 */
export const HIDDEN_NAV_SECTIONS: readonly SectionId[] = ["perps", "prediction"];

// Sections that are their own page rather than an anchor.
export const SECTION_ROUTES: Partial<Record<SectionId, string>> = {
  portfolio: "/portfolio",
  spot: "/spot",
  perps: "/perps",
  meme: "/meme",
  rwa: "/rwa",
  casino: "/casino",
  earn: "/earn",
  prediction: "/prediction",
  activity: "/activity",
  square: "/square",
};

// The section a path belongs to, for the rail's highlight: the route whose
// prefix matches, so /prediction/event/abc lights Prediction, or portfolio,
// which is the account home. A route fact, so the shell can derive it once
// for every page; only the portfolio overrides it, from its scroll position.
export function sectionForPathname(pathname: string | null): SectionId {
  if (!pathname) return "portfolio";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "portfolio";
  for (const [id, route] of Object.entries(SECTION_ROUTES) as [SectionId, string][]) {
    if (pathname === route || pathname.startsWith(`${route}/`)) return id;
  }
  return "portfolio";
}

// Maps an onboarding interest to the section it should surface first.
const INTEREST_TO_SECTION: Record<string, SectionId> = {
  stocks: "rwa",
  gold: "rwa",
  crypto: "spot",
  perps: "perps",
  meme: "meme",
  prediction: "prediction",
  casino: "casino",
  // Earn is hidden from the nav for now; the interest falls back to the default order.
  // earn: "earn",
  yield: "rwa",
  realestate: "rwa",
  treasuries: "rwa",
};

export function interestToSection(interest: string | null): SectionId | null {
  if (!interest) return null;
  return INTEREST_TO_SECTION[interest] ?? null;
}

// The section order for a given preference: portfolio, then the preferred
// section, then the remaining sections in their default order.
export function orderedSections(interest: string | null): SectionId[] {
  const preferred = interestToSection(interest);
  if (!preferred) return [PINNED, ...REORDERABLE];
  const rest = REORDERABLE.filter((s) => s !== preferred);
  return [PINNED, preferred, ...rest];
}
