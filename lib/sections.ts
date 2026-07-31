// "trade" is the combined trading hub: spot markets and perpetuals under one
// section, chosen with an in-section tab.
export type SectionId = "portfolio" | "trade" | "rwa" | "prediction" | "casino";

export const SECTION_LABEL: Record<SectionId, string> = {
  portfolio: "Portfolio",
  trade: "Trade",
  rwa: "Real assets",
  prediction: "Prediction",
  casino: "Casino",
};

// Portfolio is always the account home. The rest follow, led by whatever the
// user picked during onboarding.
const PINNED: SectionId = "portfolio";
const REORDERABLE: SectionId[] = ["trade", "rwa", "prediction", "casino"];

// Maps an onboarding interest to the section it should surface first. Spot and
// perps both live in the trade hub now.
const INTEREST_TO_SECTION: Record<string, SectionId> = {
  stocks: "rwa",
  gold: "rwa",
  crypto: "trade",
  perps: "trade",
  prediction: "prediction",
  casino: "casino",
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
