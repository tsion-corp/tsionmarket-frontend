# ADR-2026-09-07 for everyone: three Alchemy keys, tried in order

## What went wrong

Alchemy is the service we pay to talk to the blockchain: it gives us coin
prices, reads balances, and pays the gas for users' trades. We had one key,
and its monthly allowance ran out on 7 September. Alchemy then refused
everything on that key at once: prices vanished from the dashboard and
gasless trades failed.

We had a spare key, but it was a free one with a tiny allowance for prices,
and a spare key can never pay gas on the first key's behalf, because the gas
policy belongs to the account that created it.

## What we decided

The team now has three keys, each with its own gas policy. The app keeps them
as an ordered list and tries them in order: if the first can't serve a call
because its allowance is gone or it is refused, the next is tried, and the
app remembers to skip the bad one for a while so it doesn't keep paying for
failed calls.

The rule that makes this safe: a key is only ever used with its own policy.
Key 1 with policy 1, key 2 with policy 2, never mixed.

One of the three keys belongs to an older account that can't use the gas
payment method we switched to last week, so it can read and price but not
pay gas. It goes last in the list as a reserve.

## What it means

- If one account runs dry, the next takes over and users notice nothing.
- If all three run dry, trades fail with the same honest message as before,
  and the log says so loudly.
- The keys and policies are set as comma-separated lists in the environment,
  in the same order, and must be updated together in local, preview and
  production.
