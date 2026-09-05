// Kash is LAUNCHED: the card, banner, and every trading action (buy, send,
// convert, history) render unconditionally — there is no environment gate.
//
// The POINTS surfaces (the points panel and the tier chip) are held back —
// not rolling out yet. This is a code flag, not an env var, on purpose —
// flipping it is a reviewed one-line PR, not a deploy-time setting someone
// can toggle without the team seeing it.
export const KASH_POINTS_LIVE = false;
