---
date: 2026-09-18
feature: Casino live game presence, Chess spectator flow, and ArkBall funding
scope: fix
scenario-impact: none
---

# Casino live games are clearer and recover more reliably

The casino hub now displays the modeled online audience for Chess, ArkBall,
Arkjet, and Chicken Cross. The figures refresh through the casino presence API
without blocking the catalogue.

Chess now preserves rated and variant setup choices, repairs live spectator
boards when socket events are missed, keeps balance information visible, and
allows eligible spectators to submit a stake while a match is active.

ArkBall now uses the shared wallet funding flow, treats a submitted ticket as
committed, and keeps its balance controls in the game navigation. Optional Base
RPC configuration also has a public-RPC fallback for balance reads.

The casino route imports its catalogues directly so the presence feature stays
inside the existing first-load JavaScript budget.
