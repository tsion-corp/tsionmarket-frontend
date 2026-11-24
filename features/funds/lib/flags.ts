// Naira bank withdrawal. Turned off while the offramp was not serving
// withdrawals, and back on now that it is: Pouch quotes the sell side live
// again (checked against /api/pouch/rate?type=SELL, which is the rate a
// withdrawal actually pays out at).
//
// It stays a flag rather than becoming unconditional, because the reason it
// was switched off has happened once and can happen again, and one value is
// the difference between a dead-end flow and a hidden one.
export const BANK_WITHDRAW_ENABLED = true;

// Which rail the bank buttons use. Paycrest carries both directions (see
// docs/adr/ADR-2026-11-24-paycrest-ramping.md). "ramping" is the previous
// Difference-rail screens, kept until Paycrest has carried real traffic, so
// a rail problem is one value away from the old flow instead of a revert.
export type BankRail = "paycrest" | "ramping";
export const BANK_RAIL: BankRail = "paycrest";
