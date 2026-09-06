// Spot and perpetuals are separate sections with their own sidebar entries;
// each carries its own simple/pro interface switch inside.
export type SectionId =
  "portfolio" | "spot" | "perps" | "meme" | "rwa" | "prediction" | "earn" | "casino" | "activity";

export const SECTION_LABEL: Record<SectionId, string> = {
  portfolio: "Portfolio",
  spot: "Spot",
  perps: "Perpetuals",
  meme: "Memecoins",
  rwa: "Real assets",
  prediction: "Prediction",
  earn: "Earn",
  casino: "Arkade",
  activity: "Activity",
};

// Portfolio is always the account home. The rest follow, led by whatever the
// user picked during onboarding.
const PINNED: SectionId = "portfolio";
const REORDERABLE: SectionId[] = [
  "spot",
  "perps",
  "meme",
  "rwa",
  "prediction",
  // Earn is hidden from the nav for now.
  // "earn",
  "casino",
  "activity",
];

// Sections that are their own page rather than an anchor on /dashboard.
// Portfolio is the dashboard itself, so it has no entry here.
export const SECTION_ROUTES: Partial<Record<SectionId, string>> = {
  spot: "/spot",
  perps: "/perps",
  meme: "/meme",
  rwa: "/rwa",
  casino: "/casino",
  earn: "/earn",
  prediction: "/prediction",
  activity: "/activity",
};

// The section a path belongs to, for the rail's highlight: the route whose
// prefix matches, so /prediction/event/abc lights Prediction, or portfolio,
// which is the dashboard and the account home. A route fact, so the shell can
// derive it once for every page; only the dashboard overrides it, from its
// scroll position.
export function sectionForPathname(pathname: string | null): SectionId {
  if (!pathname) return "portfolio";
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
