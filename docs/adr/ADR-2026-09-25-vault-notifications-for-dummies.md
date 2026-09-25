# ADR-2026-09-25, in plain English: telling players they won

- Status: **Proposed — awaiting your approval**
- Date: 2026-09-25
- The technical version: [ADR-2026-09-25-vault-notifications.md](./ADR-2026-09-25-vault-notifications.md)

## The situation

The backend developer is right: he built notifications for Last Man Standing.
When a game ends, the vault sends out "you won" and "your game earned you a
share".

You are also right that the app has a proper notification system already: the
bell in the top bar, an inbox, unread counts, browser push.

Both are true, and nothing arrives. Here is why.

## What we found

**There are two separate notification systems, and the app is reading the
wrong one.**

- The **notification service** is fed automatically by other services. This is
  where the vault sends "you won".
- **User management** has its own, separate notification feature, filled in by
  hand when somebody on the team writes an announcement.

The bell reads the second one. The vault writes to the first. They do not share
a database, and user management does not listen to the vault. So the message is
being sent correctly and stored correctly, in a place nothing in the app looks
at.

We confirmed this against the live production API, not just by reading code.

## The good news

Almost nothing needs building. The bell, the inbox, the unread badge, the
browser push plumbing and the safety checks all already exist, and they are
general: they display whatever a notification says, whoever sent it. They do
not need to be taught what Last Man Standing is.

**This is a plumbing job, not a feature build.**

## The decision

**Connect the bell to the notification service as well, and show both.**

Not instead of. Both systems work and both carry things people want: team
announcements in one, "you won" in the other. The bell reads both and shows one
combined count, which is already how it works today with two sources, so a user
never has to know there are two systems behind it.

You confirmed this on 2026-09-25: sync the two, drop neither. That is now a
fixed requirement rather than our preference, so nothing here will quietly
retire one of them later.

## What players will get

| What happens                        | Do you get told?                        |
| ----------------------------------- | --------------------------------------- |
| You win a game                      | **Yes** — stays in your bell until read |
| Your game earns you a starter share | **Yes** — stays in your bell until read |
| A new game opens                    | Only if you are looking at the time     |
| A game you were not in ends         | Only if you are looking at the time     |
| Somebody joins a game               | **No, deliberately**                    |

The last two rows are the backend developer's deliberate choices and we are
keeping them. A game resets its timer every time somebody joins, and buzzing
people on each one is how a notification channel becomes the thing everybody
turns off. "A game just opened" is worth nothing sixty seconds later, so it is
shown live or not at all.

## Two things you should know before approving

**1. Phone buzz will not work yet.** Getting a notification onto a locked phone
needs a specific security key published by the service sending it. User
management publishes one. The notification service does not, so there is no way
for a browser to sign up for its push messages.

So a win will appear in the bell and live in the app, but will not buzz a phone
that is closed, which is exactly the case it was marked for. **This needs the
backend developer to add one endpoint.** Worth asking him now, because
everything else here works without it.

**2. There is a silent failure mode we are testing for specifically.** The
service matches a wallet to a person the first time that person's app talks to
it. Someone it has never heard from cannot be matched, and their win is thrown
away rather than saved — with no error anywhere.

Reading the code, this should take care of itself, because the bell talks to
the service the moment the app loads, long before anyone wins anything. But
"should" is not good enough when the failure is invisible and the thing being
lost is a payout notification. So the acceptance test is a brand-new account
winning and being told.

## What we are not doing

- Not moving the bell off user management: that would lose team announcements
  and the only working phone-push key.
- Not asking the backend to merge the two systems: that may be right
  eventually, but it is his call and it would block this.
- Not adding a "somebody joined" notification, per above.

## What we need from you

Approval to **read both notification sources and merge them in the bell**, and
a decision on whether to ask the backend developer for the push key endpoint
now or ship without phone buzz first.
