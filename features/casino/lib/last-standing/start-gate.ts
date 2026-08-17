// Gate for OPENING new Last Man games. Default off: the deployed app shows
// the lobby and lets people join and watch what already exists, but the
// "start your own game" pitch is gone entirely, so the room count stays where
// ops put it. Local development (and, later, production launch) turns it on
// with NEXT_PUBLIC_LAST_MAN_START_LIVE=true — build-inlined like every
// NEXT_PUBLIC_ value, so flipping it in production means a redeploy.
export const LAST_MAN_START_LIVE = process.env.NEXT_PUBLIC_LAST_MAN_START_LIVE === "true";
