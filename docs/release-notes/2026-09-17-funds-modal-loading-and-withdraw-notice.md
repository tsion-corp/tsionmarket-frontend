---
date: 2026-09-17
feature: Modals show something while they load, and a sent transfer stops being reported as a failure
scope: fix
scenario-impact: none
---

# Two reports from production, each with a second site behind it

Both of these came from users, and both turned out to have a second occurrence
that the report did not mention. Fixing only what was reported would have left
each bug half alive.

## A press that looked like nothing happened

> "When I click withdrawal... It finally loaded. But I had to try multiple times."

Every modal is a `next/dynamic` import with `ssr: false`, and none of them passed
a `loading` fallback. `modal-shell.tsx:54` paints its backdrop
(`bg-black/62 backdrop-blur-[7px]`) the instant `open` turns true. So between the
press and the chunk arriving, the screen was a blurred page with nothing on it.
On a phone that is seconds, and it reads as a dead button, so people pressed
again.

`ModalLoading` now fills that gap: the heading, the subtitle and two method tiles
as skeletons, at the height the sheets open to, so the sheet does not snap open
and then jump when the real content lands. It carries `role="status"` and
`aria-busy`, so the wait is not silent to a screen reader either.

**The second site.** `app-modals.tsx` holds eight of these modals, and
`dashboard-shell.tsx` mounts **Funds and Withdraw a second time**, independently,
with the same defect. The report came from the portfolio page; the sidebar and
the FAB reach the shell's copies. Both are fixed, ten dynamic modals in total.

## A transfer that was sent, reported in red

The other report was the opposite problem: a message saying the withdrawal had
_not_ been confirmed, sitting on the amount screen before Withdraw had been
pressed at all, while the offramp was working perfectly.

Two defects in one line.

**It was not an error.** Both withdraw screens held a single `error` string, so
`sendUnconfirmed` — which means the transfer is already on its way and may well
complete — was rendered in exactly the red used for "nothing was sent". That is
what made a working withdrawal look like a failed one, and what made people
withdraw again.

**It was never cleared.** `setSendError(null)` ran only inside `submit()`. Change
the amount, change the bank, leave and come back: the note from the last attempt
was still there, describing a withdrawal that no longer existed.

`components/ui/form-feedback.tsx` now carries the distinction the screens were
missing:

- `asError` renders in the failure colour with `role="alert"`, which interrupts.
- `asNotice` renders in neutral text with `role="status" aria-live="polite"`,
  which waits its turn.

And an `editing()` wrapper retires the previous result at all three input sites
at once — amount, bank, account number — rather than at three places that can
drift apart.

**The second site.** `crypto-withdraw-screen.tsx` had the same bug and one more
besides: alongside the inline message it fired `toast.error` for a transfer whose
user operation had already reached the bundler. That is now `toast.info`.

## What this does not change

No flow, no amount, no order. Both fixes are about what the interface says while
something is happening, and neither touches the money path.

## Verification

`./scripts/preflight.sh`: all five gates pass, 5,146 tests.

New:

- `components/ui/form-feedback.test.tsx` — a failure keeps the failure colour and
  interrupts; an unconfirmed result never gets the failure colour; the two are
  announced differently.
- `components/layout/modals/modal-loading.test.tsx` — the shell is never empty,
  the placeholder announces itself as busy and carries an accessible name, and it
  reserves height rather than collapsing.

Updated: `app-modals.test.tsx` now renders inside `NextIntlClientProvider`. The
loading fallback is the first thing in that host that speaks, so the test's
missing provider only became visible once the fallback existed. The provider is
always present in the app.

`common.loading` added to all five catalogs, matching each one's existing
wording for the same idea.

Exercised on `localhost:3001`.

## A gap worth stating

The clearing behaviour has no mount test. Building one needs Privy, the portfolio
hook, four ramping hooks, and a screen state that cannot occur naturally (a
verified account with no bank selected); no harness exists for `BankWithdrawScreen`
and one was not worth inventing inside a bug fix. The notice-versus-error half is
covered by `form-feedback.test.tsx`, and the clearing is enforced structurally by
routing all three inputs through one wrapper. A harness for that screen is worth
having on its own.
