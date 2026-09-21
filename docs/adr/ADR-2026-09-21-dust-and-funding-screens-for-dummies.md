---
date: 2026-09-21
status: proposed
---

# Why balances said "<$0.01", in plain words

## The balance

People, including people who had just signed up, saw their balance as "less than
one cent" instead of "$0.00".

Nothing was broken. Anyone can create a coin and send it to any wallet, and some
people send worthless coins to thousands of wallets at a time to get noticed.
Those coins are worth a tiny fraction of a cent. We were adding them up. Once the
sum is above zero but below a cent, the app cannot show a proper number, so it
showed "less than one cent".

Now those coins are left out of the number. If someone holds nothing but junk
coins, their balance reads "$0.00", which is the truth. The coins are still
theirs, so the portfolio keeps a switch, "Hide small balances", that shows them
again.

## The deposit and withdraw screens

Each screen inside those flows decided for itself how tall it was and where its
Back button went. That is why Back sat above the X instead of next to it, why
the deposit address was hidden below a scroll inside another scroll, and why the
panel stopped short of the bottom of the phone.

Now the window itself owns those parts. Each screen just says "I have a back
step", "I need the whole phone", or "everything fits, do not scroll me". So:

- Deposit and withdraw steps fill the phone.
- Back and the close button sit on the same line.
- The deposit address screen fits without scrolling.
- "How to deposit?" opens a short guide written for someone who has never sent
  crypto before.
- The two opening screens ("Add funds" and "Withdraw") stay small, because they
  only ask which way you want to go.

We also fixed the search box in the withdraw flow. It was typing into nothing.
