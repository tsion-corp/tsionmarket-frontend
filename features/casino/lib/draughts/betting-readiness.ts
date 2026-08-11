// Spectator betting is built on the frontend but not yet reachable for
// draughts, because the service resolves a market through the chess `matches`
// table only (`betting/crud.rs` -> `SELECT ... FROM matches WHERE id = $1`).
// Draughts games live in `draughts_matches`, so a draughts match id answers
// "match not found" and no market can exist.
//
// The panel is therefore rendered read-only until the service can resolve a
// draughts match. Flip this to true once it can: the panel already calls the
// real market and place-bet endpoints, which are game-agnostic on our side, so
// nothing else has to change.
//
// See docs/backend/draughts-spectator-betting.md for what the service needs.
export const DRAUGHTS_BETTING_ENABLED = false;
