---
date: 2026-09-22
feature: Sizing a sale's gas from the send actually being made
scope: fix
scenario-impact: none
---

# A token sale on an unsponsored chain asks for the fee it really costs

Selling on a chain we do not sponsor needs the wallet to hold that chain's coin
for the fee. The check measured a plain native transfer, but selling a token is
an ERC-20 transfer, which takes about three times the gas. So the check asked
for a third of the real fee and let the sale through; the node then refused it.
Topping the wallet up to just past the check still failed, which is what a
USD₮0 holder on HyperEVM ran into.

- The fee is now measured from the send being made: the token transfer itself,
  estimated against the paying wallet, not a native transfer standing in for it.
- A token send is floored at ERC-20 gas rather than the native minimum, so a
  node that will not estimate cannot fall back to a third of the answer.
- The spot ticket now measures for token sales too. It only did so when selling
  the gas token itself, so every other sale fell back to "holds any at all",
  which dust passed.
- The reading is refreshed while the sheet is open instead of being frozen at
  the price when it opened.

Gas units are bounded; the price is read live and the node's own estimate wins
whenever it is higher.
