#!/bin/zsh
# Concludes the in-progress merge of main into feat/chess-pgn-viewer (conflicts
# already resolved: branch side for the chess files, main's side for the
# balance-card revert and the test fix) plus the prettier pass. Already on the
# branch. Run from the repo root, then tell Claude to open the PR.
set -e

git add -A

git commit -m "merge main + licensed pieces: Cburnett set replaces chess.com's artwork

Two things concluded together on top of the new chess visuals:

- Merge of main: the branch was re-pushed without the two fix commits #82
  carried (the per-move test update and the prettier pass), so the squash
  on main conflicted with the visual work. Resolved by taking the branch's
  chess files — a superset of what #82 merged — and main's side elsewhere;
  prettier re-applied across the diff.
- Piece licensing: the board shipped chess.com's proprietary 'neo' PNGs,
  which their own NOTICE forbade in any public deployment — and main
  deploys publicly. Swapped for Colin Burnett's classic Cburnett set
  (Wikipedia/lichess's pieces; GPLv2+/BSD/CC-BY-SA triple license) using
  Wikimedia Commons' own 150px renders, same filenames, path constant
  renamed to /piece/cburnett with attribution in NOTICE.txt."

git push origin feat/chess-pgn-viewer

echo
echo "Pushed. Tell Claude to open the PR and merge."
