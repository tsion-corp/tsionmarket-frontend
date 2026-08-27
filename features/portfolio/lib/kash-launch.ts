// Kash is LAUNCHED: the card, banner, and every trading action (buy, send,
// convert, history) render unconditionally — there is no environment gate.
//
// The POINTS surfaces were held back while no revenue events fed the engine.
// That's no longer true: apps/trade (spot) and apps/perp (open + close) both
// publish platform.revenue.recorded on every fee-bearing trade, and
// apps/kash's worker consumes it. This is a code flag, not an env var, on
// purpose — flipping it is a reviewed one-line PR, not a deploy-time setting
// someone can toggle without the team seeing it.
export const KASH_POINTS_LIVE = true;
