# ADR-2026-09-07 for everyone: buying any memecoin with your USD balance

## What was wrong

Your money sits on one network. Some memecoins live on another. Opening one of
those showed "Balance 0 USD" and "Not enough balance", even though you had
money. The page also kept telling you which network each coin was on, which
is not something you should have to think about.

## What we did

We copied the way real assets already work:

- The buy screen shows one balance, in USD. That is all your money, wherever
  it happens to sit.
- If a coin needs your money on the other network, we move it there for you
  when you tap Buy. You see "Order accepted, completing in the background",
  and a notification when the coin lands. You can close the screen.
- Until the money has moved, the screen shows an estimate of how many coins
  you'll get from the current price. The exact amount is quoted once the
  money is there.
- When you sell one of those coins, the proceeds come back to your USD
  balance on their own.
- Network names are gone from the cards and the buy screen.

## What it means for you

Tap Buy and wait for the notification. Solana coins have a 2 USD minimum
because moving money there has a fixed cost. If something goes wrong after the
move, your money stays safe in your account and you can tap Buy again without
moving it twice.
