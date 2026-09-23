---
date: 2026-09-22
status: accepted
approved: 2026-09-22
---

# Mixpanel on the web app, in plain English

## What is the problem?

Mixpanel is the tool that records what people do in the app: who signed up, who deposited, who traded. The data team has found that its numbers are wrong in ways that have already reached leadership. After checking the code, the causes are:

- **Some events never arrive.** Privacy tools such as Brave and uBlock block Mixpanel's address, so a share of users are invisible. The new perpetuals desk (Hyperliquid) was never connected to Mixpanel at all. A new user's first deposit is skipped, and deposits are only noticed if the person is on the dashboard when the money lands.
- **Some numbers are wrong.** When someone sells, the app reports the number of tokens as if it were dollars. Selling a million meme tokens worth $5 is reported as a $1,000,000 trade. This is where the phantom million dollars of trading volume came from.
- **Some context is missing.** Test and preview versions of the app report into the real project, so fake users are mixed with real ones. Campaign links lose their tracking tags on the way in, so marketing cannot see which campaign brought someone.

## What are we going to do?

1. **Send events through our own website address** instead of straight to Mixpanel, so privacy tools stop dropping them. We already do this for error reports.
2. **Label every event with where it came from** (the live site, a preview, or a developer's laptop), so reports can count real users only.
3. **Report the real dollar amount of every trade**, taken from what actually settled, and send the token quantity separately. The app will refuse to send a sell without it, so this mistake cannot come back.
4. **Connect the Hyperliquid perpetuals desk**, so perps trading shows up.
5. **Keep campaign tags** from the first visit and attach them to the person, so marketing can see where users come from.
6. **Use one agreed list of failure reasons**, and stop counting "the user pressed cancel" as a failed trade.
7. **Count first deposits**, and watch for deposits and withdrawals on every page, not just the dashboard.

## What are we deliberately not doing?

- **We are not bringing back the old bank deposit event.** It was retired on 26 August because every Naira deposit was being counted twice. Bank deposits are in `deposit_completed`, marked as bank.
- **We are not changing how people are identified.** Changing it would make every existing user look like two people.
- **We are not renaming properties the existing reports use.** New names are added next to the old ones.

## Is this the final fix?

No. The browser can only report what it sees while the app is open. Money that lands while the app is closed, and perps positions closed automatically by Hyperliquid, can only be reported reliably by the backend. That is a separate piece of work, described in `docs/mixpanel-server-events-integration.md`. When the backend version of an event is working, the browser version is removed so nothing is counted twice.

Mixpanel is also not the place to count accounts, money or revenue. Those come from Privy and our own ledger, through the daily report the data team has asked for.

## What changes for the data team?

- Charts will show a step on the release date: sell volume drops to real figures, perps appear, first deposits appear. We will add a note in Mixpanel on that date.
- New properties to use: `environment`, `utm_*`, `token_quantity`, `amount_source`, `order_id`, `tx_hash`, and `amount_usd` and `game_id` on game events.
- Hidden or unreleased areas (KYC, Earn, send money, prediction on production) will still show no events. That is expected.

## What was decided

- The work goes on the branch `feat/mixpanel-integration_carniel`, which follows the live version of the app.
- Our Mixpanel project stores its data in the EU, so events are sent to Mixpanel's EU servers.
- There is one Mixpanel project. Reports that should count real people filter on `environment = production`.
- Deposit and withdrawal counting is fixed in the browser now. The backend team will take it over later.
