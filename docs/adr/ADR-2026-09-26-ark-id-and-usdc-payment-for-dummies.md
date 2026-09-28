# ADR for Dummies: Ark ID and USDC Payments

- **Status:** Proposed, awaiting maintainer approval
- **Date:** 2026-09-26

## The Idea

Give people a short `.ark` name they can share instead of a long wallet address. Put Ark ID in the account area, let people check whether a name is available, and accept verified Ark IDs when sending Kash.

Show the name's price in USDC, so the app keeps using one familiar displayed currency. Behind the scenes, the app can convert the needed USDC into the Base ETH that the existing name contract requires, then finish registering the name.

## What the Person Sees

1. They search for a name such as `beth`; the app displays it as `beth.ark`, checks that it is available, and shows its current yearly price in USDC.
2. They reserve the name. The existing contract requires a reservation transaction and a short wait before registration is allowed.
3. When the reservation is ready, they press one “Pay USDC and register” button. The app shows a progress state while it sends the payment, waits for settlement, and asks the wallet to confirm registration.
4. In Kash send, they can enter either a wallet address or an Ark ID. The app checks that the name really points to a wallet before enabling Send. If it does not resolve, the send stays blocked and the user can go buy an Ark ID.

## Important Limitation

The button can make the experience feel like one guided payment, but it cannot make the blockchain steps atomic. The user will still confirm the USDC transfer and, after it settles, confirm the name registration in their wallet. The wallet may show that final contract payment in ETH because that is how the existing contract works, even though the app labels the fee in USDC.

The reservation secret exists only in the returned registration data. The frontend must keep it on the user's device until registration finishes or the reservation expires. If the app loses that secret, the reservation cannot be completed.

## One Name, One Year, No Surprise Charges

A wallet gets one Ark ID, and it is paid for a full year when bought. After that, the person sees a calm confirmation with the date it expires, and nothing to pay. A renewal option only shows up when the name is genuinely close to expiring (within 60 days), and even then it takes two taps to confirm, so no one can be charged for a second year by accident. Someone who already owns a name is never shown a way to buy another.

## What Changes

Only the frontend changes. It adds the Ark ID card and payment sheet, a narrow proxy for the existing BNS API, the Kash name check, and tests. The backend and contracts remain untouched. If Dextopus cannot provide enough native Base ETH for the quoted USDC amount, or the payment service is unavailable, the app stops safely and preserves the reservation rather than claiming the name was bought.

## Decision Needed

Please approve both this plain-English record and its technical companion before implementation resumes.
