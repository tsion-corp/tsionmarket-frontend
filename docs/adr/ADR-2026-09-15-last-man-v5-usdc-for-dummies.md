# The Last Man, in dollars — the plain version

Companion to [ADR-2026-09-15-last-man-v5-usdc.md](./ADR-2026-09-15-last-man-v5-usdc.md).
Same decision, no jargon.

## What the game is

Players put money into a pot. Every time someone joins, a 60-second clock
resets. Whoever is last standing when it runs out wins. The pot splits: half to
the winner, 10% to whoever started the game, 40% to the house.

## What is wrong with it today

The game has always been played in **ETH**, the coin you pay Ethereum fees with.
But nobody on this platform holds ETH. Everyone holds **USDC**, which is
dollars.

So we built a workaround. Before you could play, we converted some of your
dollars into ETH ("add money"). After you won, we converted it back
("withdraw"). Two conversions, two waits, two chances to fail — for a game you
wanted to play in the dollars you already had.

The game is also **switched off on production right now**, because of a separate
backend fault that leaves winnings stuck. That is being fixed; this document is
about what we build in the meantime.

## What changes

The vault contract has a new version that lets the game be played in **any**
approved coin, not just ETH. So we play it in dollars.

**You stake dollars straight from your balance.** No "add money". No "withdraw".
You win dollars, and they are already your spendable balance. The two conversion
screens are deleted.

The smallest amount you can start a game with is **10 cents**.

## What it feels like to play

One tap. Nothing pops up.

That is worth saying plainly, because it is the whole product: this app signs
for you, invisibly, and pays the fee. There is no wallet window, no "confirm"
sheet, no approval to read. A player taps and the thing happens. That never
changes.

Behind the scenes the contract needs two separate instructions — "let the game
take 10 cents from me", then "start the game". We send both as **one bundled
action**, so either both happen or neither does.

The reason is not to save you a tap; you never had one. It is the 60-second
clock. Sent one after the other, the game could finish in the gap between them,
and the second instruction would fail having already given the game permission
to take the money. Bundled, there is no gap.

## The thing we are being careful about

Dollars have **6 decimal places**. ETH has **18**.

Our code was written when everything was ETH, so in places it assumes 18. Point
that at a 20-dollar pot and it displays `0.00000000002`. We found exactly this
kind of mistake while checking the new contract: reading it with the old
assumptions reported a pot roughly a thousand times larger than everything on
Earth.

So every amount now comes from the backend already formatted, and any maths
happens on whole units rather than decimals. There is a test that puts a dollar
game and an ETH game side by side and checks both read correctly.

## Where the game gets its information

Normally the backend keeps a list of every game — who is playing, how big the
pot is, how long is left — and our app just reads that list.

That list is **empty right now**. The backend has a fault and is not filling it
in. If we relied on it alone, the game would show nothing.

So we add a backup: when the backend's list is empty, we ask the blockchain
directly.

The obvious way to do that is expensive — one question per game, per player, per
few seconds. Instead:

- **Our server asks, not your phone.** One question answered once, shared by
  everyone looking, instead of one per person.
- **All the games in a single question.** There is a standard way to bundle many
  blockchain questions into one; we use it. Ten games cost the same as one.
- **The answer is reused for a few seconds.** Everyone arriving in that window
  gets the same answer rather than triggering a new one.
- **We skip it entirely when the backend works.** It is a backup, not a habit.

When the answer did come from the blockchain rather than the backend, the app
says so, rather than quietly presenting a different source as if it were the
same thing.

## What this does _not_ fix

The backup gets the game **on screen**. It does not get winnings **paid out**.

Paying out is done automatically by a backend robot, and that robot reads the
same empty list. So while the fault lasts, a finished game does not pay itself
out. The money is not lost — anyone can trigger the payout, and it goes to the
right person regardless of who triggers it — but it does not happen on its own.

That is why this goes to the **test site only**. It does not reach real users
until the backend list is filling in and we have watched a real dollar game pay
itself out.

## What we are deliberately giving up

The new contract can run games in ETH too. We are choosing not to offer that,
because asking someone to hold ETH is the exact problem we set out to remove.

If a game in another coin does exist, we still show it correctly — we just never
start one. Turning this back on later is a one-line change.

## The short version

|                   | Before                      | After                           |
| ----------------- | --------------------------- | ------------------------------- |
| Played in         | ETH                         | Dollars                         |
| Before you play   | Convert dollars to ETH      | Nothing                         |
| After you win     | Convert ETH to dollars      | Nothing, it is already dollars  |
| Taps to start     | Several, across two screens | One                             |
| Things to confirm | None, and still none        | None, and still none            |
| Fees you pay      | None (we cover them)        | None (we cover them)            |
| Minimum stake     | About 50 cents of ETH       | 10 cents                        |
| Where it goes     | —                           | Test site first, not real users |

## What we need from you

Approval to build this. Nothing is being changed yet — this document and its
technical twin describe the plan, and the rule in this repository is that a
person, not the AI, approves it before any code is written.
