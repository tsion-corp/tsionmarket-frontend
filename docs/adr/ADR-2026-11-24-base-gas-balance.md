# ADR: Base gas balance as a fallback for user-paid Base sends

- **Status:** Accepted 2026-11-24 by the maintainer (drop the automatic
  top-up; Pimlico sponsorship ships as its own PR)
- **Deciders:** the maintainer
- **Base branch:** `main`
- **Related:** `docs/plans/2026-11-16-base-sponsorship-via-pimlico-plan.md`
  (separate PR, `feat/base-sponsorship-pimlico`)

## Context

`feat/base-gas-balance` was built for a plan to stop sponsoring Base gas
(`daed696c`), so every wallet would pay for its own Base sends in ETH. It
added a portfolio gas balance with a low warning, a gas check in the buy
sheet, a native-ETH buffer for Base sells, and a `GasTopUpHost` that silently
swapped $1 of the user's USDC into ETH whenever a deposit landed while gas
was empty.

The stop-sponsoring change was reverted (`5484a23e`). Base stays sponsored,
and the cheaper Pimlico paymaster replaces Alchemy's Gas Manager in a
separate PR. As built, the branch would have told every user to keep ETH on
Base for nothing. It would also have moved user money without a tap, and it
swallowed errors silently.

## Decision

Keep the user-paid safety net and make all of it depend on the live
sponsorship flag (`gasPolicy` in `config/alchemy-bso-evm-networks.json`):

```
hasGasPolicyForNetwork("base-mainnet")
        │ true (today)                    │ false (sponsorship switched off)
        ▼                                 ▼
 notice hidden                     portfolio shows Base ETH balance,
 buy sheet: no gas check           warns under $1 with an "Add ETH" button
 sells: full balance               buy sheet blocks a buy it can't pay gas for
                                   Base ETH sells keep a 0.0003 ETH buffer
```

- **Removed:** `GasTopUpHost`. No user funds move without the user acting.
- `lib/trade/gas-reserve.ts`: `baseGasIsUserPaid()`, `baseGasUsd()` and
  `baseGasIsLow()` are the single source for the notice.
- Copy updated in all five locales; the unused `gasBalanceLowTitle` is gone.

## Consequences

- With Base sponsored, users see no change. If sponsorship is turned off,
  for example because the paymaster is out of funds, users get a clear
  warning and a path to add ETH instead of failed sends.
- Turning sponsorship off is now a one-line config change that the UI
  already handles.
- Users who run out of gas while Base is user-paid have to add ETH
  themselves; nothing tops it up automatically.

## Alternatives considered

- **Keep the automatic top-up:** rejected. It swaps user funds without
  consent, and it isn't needed while Base is sponsored.
- **Ask-first top-up prompt:** possible later if Base ever becomes
  permanently user-paid.
