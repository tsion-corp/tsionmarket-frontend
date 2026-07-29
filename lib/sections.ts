export type SectionId = "portfolio" | "trade" | "markets" | "rwa" | "prediction" | "vault";

export const SECTION_LABEL: Record<SectionId, string> = {
  portfolio: "Portfolio",
  trade: "Perpetuals",
  markets: "Markets",
  rwa: "Real assets",
  prediction: "Prediction",
  vault: "Casino",
};

// Portfolio is always the account home. The rest follow, led by whatever the
// user picked during onboarding.
const PINNED: SectionId = "portfolio";
const REORDERABLE: SectionId[] = ["trade", "markets", "rwa", "prediction", "vault"];

// Maps an onboarding interest to the section it should surface first.
const INTEREST_TO_SECTION: Record<string, SectionId> = {
  stocks: "rwa",
  gold: "rwa",
  crypto: "markets",
  perps: "trade",
  prediction: "prediction",
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
