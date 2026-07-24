// Countries where Polymarket order placement is not permitted. This is an
// advisory gate for the UI — Polymarket enforces the hard block server-side at
// order time, so this only decides whether we show the trading affordances.
// Codes are ISO 3166-1 alpha-2. Ontario (Canada) is region-restricted and can't
// be gated at country granularity here; Polymarket enforces that case.
export const BLOCKED_COUNTRIES: ReadonlySet<string> = new Set([
  "US", // United States
  // OFAC-sanctioned jurisdictions
  "CU",
  "IR",
  "KP",
  "RU",
  "SY",
  "BY",
  // Other jurisdictions Polymarket blocks
  "FR",
  "DE",
  "IT",
  "BE",
  "PL",
  "GB",
  "SG",
  "TW",
  "TH",
  "AU",
  "CN",
  "PT",
  "HU",
]);

// Unknown country resolves to allowed: we cannot determine the region (e.g.
// local dev), and Polymarket is the hard backstop at order time.
export function isBlockedCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return BLOCKED_COUNTRIES.has(country.toUpperCase());
}
