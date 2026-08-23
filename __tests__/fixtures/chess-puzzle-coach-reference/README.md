# Chess puzzle coach reference fixtures

These files were captured from a local Chess.com puzzle session and are kept
only for development-time interaction testing on the
`feat/chess-puzzle-coach-lab` branch.

They are served exclusively by `/api/labs/chess-puzzle-coach/[asset]`, which
returns `404` when `NODE_ENV=production`. The production chess experience must
use Ark-owned or properly licensed engine, portrait, speech, and lip-sync
assets before this experiment is promoted.

## Fixture map

- `coach-reference.png`: temporary coach portrait.
- `narration-reference.mp3`: puzzle `2752337` goal narration.
- `narration-reference.viseme`: puzzle `2752337` lip-sync cues.
- `narration-2752339.mp3`: puzzle `2752339` goal narration.
- `narration-2752339.viseme`: puzzle `2752339` lip-sync cues.
- `coach-text-asset.bzp`: captured encrypted/compressed coach text asset.
- `explanation-engine.js`: captured worker/loader.
- `explanation-engine.wasm`: captured explanation engine.

The three engine files are stored locally under
`node_modules/.cache/ark-chess-puzzle-coach` so Turbopack does not watch or
index the 27 MB WASM file. The development media endpoint serves both fixture
locations behind the same URL. The normal lab UI loads only the portrait,
narration, and viseme timeline; the engine loads only when the diagnostic
control is selected.

## Captured system boundary

The saved `102` value is Puzzle Path XP, not a puzzle count. The same capture
reports two attempted puzzles, Wood tier, level 3, and 7 of the 110 XP needed
for level 4. The captured prestige-one configuration contains eight tiers with
20 levels each.

The development flow mirrors the observed service boundary:

1. `GetNextRated` returns one puzzle, its solution line, speech hashes, and
   potential awards.
2. The browser board and optional WASM worker validate moves and produce local
   feedback.
3. `SubmitRatedSolution` receives the puzzle id, played moves, hint usage, retry
   state, and duration.
4. The response supplies collected XP and updated path stats.
5. The frontend award/path state machine animates the result before requesting
   another puzzle.
