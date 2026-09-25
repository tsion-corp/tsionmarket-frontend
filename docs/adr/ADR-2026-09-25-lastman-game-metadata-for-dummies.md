# ADR-2026-09-25, in plain English: letting people name their game

- Status: **Proposed — awaiting your approval**
- Date: 2026-09-25
- The technical version: [ADR-2026-09-25-lastman-game-metadata.md](./ADR-2026-09-25-lastman-game-metadata.md)

## The situation

When you open Last Man Standing you see a list of games you could join. Right
now every one of them is called "Game 244", "Game 245", "Game 246". If three
are open at once, the only way to tell them apart is the stake and the clock.

The backend team built a way to fix this: whoever starts a game can give it a
name and a short description, and those come back attached to the game
wherever it is listed.

## The decision

**People can name their game and add a short description. No picture.**

The backend also accepts a picture. We are not using it. A picture needs
somewhere to live, needs somebody to check it is not something horrible, and
crowds a card that only exists for sixty seconds. A name does the job: it tells
two games apart, and that was the whole problem.

## How it will work for the player

1. You tap Start a game.
2. You choose your stake, as now, and you can type a name and a description.
3. You confirm. The game opens immediately.
4. The name is attached a moment later, behind the scenes.

Step 3 and step 4 are deliberately separate. **Your game opens whether or not
the name sticks.** You have already paid by then, so the worst possible outcome
is a game called "Game 246" instead of "Friday night big one". It is never a
game that failed to open.

Games that already exist, and anyone who skips the fields, just keep showing
"Game 246". That stays completely normal.

## Why it is safe

The name is attached with a signature from your own wallet, so nobody can name
somebody else's game. The vault double-checks that the person who signed is
the person who actually started that game, and throws away anything that does
not match. This happens silently and needs no tap from you.

The name can never change who wins or who gets paid. It is a label. The money
is decided by the contract on the blockchain, which never sees it.

## What could go wrong, and what we are doing about it

**The name does not save.** Possible, and harmless by design: you get a game
with a number instead of a name. We chose this over the alternative, which
would be your game failing to open because its label did not save.

**Somebody writes something offensive.** A name is 60 characters typed by
another person, and we are not filtering it. We are blocking a specific trick
where invisible characters can make text display differently from what it
actually says, which is how people fake convincing names. If genuine abuse
becomes a problem, it needs handling on the server, because anything we do in
the app can be bypassed by not using the app.

**We get the signature format wrong.** This is the one real engineering risk.
The vault checks the signature against an exact expected format, down to a
particular kind of dash. Get one character wrong and every name is rejected.
We are locking that format with a test that fails on a single character.

## What this does not include

- Renaming a game after it starts. The signature is tied to the one
  transaction that created it.
- Pictures, per above.
- Any change to how the money works.

## What we need from you

Approval to build it as described: **name and description, no picture, and the
game always opens even if the name does not save.**
