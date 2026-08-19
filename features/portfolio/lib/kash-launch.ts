// Kash is LAUNCHED: the card, banner, and every trading action (buy, send,
// convert, history) render unconditionally — there is no environment gate.
//
// The POINTS surfaces are the one thing still held back: no revenue events
// feed the engine yet, so a points counter would sit at zero forever and read
// as broken. This is a code flag, not an env var, on purpose — flipping it is
// a reviewed one-line PR, not a deploy-time setting someone can toggle
// without the team seeing it.
export const KASH_POINTS_LIVE = false;
