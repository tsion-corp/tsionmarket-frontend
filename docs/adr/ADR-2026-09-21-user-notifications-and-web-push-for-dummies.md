# ADR for Dummies: notifications people actually receive

**Status:** approved on 2026-09-21, including retiring Earn's separate push.

The technical version is `ADR-2026-09-21-user-notifications-and-web-push.md`.

## What's happening

The backend team has built the notification service. An admin can write a
message and publish it, and it goes to every user in two ways:

1. It's saved in each person's **inbox**, which is the permanent record.
2. It's **pushed to their browser**, so a pop-up appears on their screen even
   if the app is closed or they're on another tab.

This document covers the part users see. The admin screen for writing and
sending those messages belongs in the admin dashboard, not here, because it
needs a secret key that must never be in a public website.

## Three words that sound the same

- **Notification**: the pop-up itself.
- **Push**: the delivery method that wakes the browser when your tab is closed.
  This is what makes it work when you're doing something else.
- **Inbox**: the list in the bell. It's the record, and it's still there
  whether or not you saw the pop-up.

## What we're building

- A **"Turn on notifications" button** in the bell. We explain what it's for,
  and only when you press it does the browser ask permission. Never on page
  load, because a browser only lets us ask once and a "no" is permanent.
- The **inbox in the bell**, above the existing wallet activity list. Both stay.
  Unread ones are marked, you can open one, and you can mark them all read.
- A **background script** that catches incoming pushes and shows the pop-up.
  Clicking it takes you to the right page in the app, and if the app is already
  open in a tab, it uses that tab instead of opening another.
- The ability to **turn it off**, which both stops the browser and removes the
  record on the server.
- An app **manifest**, so the app can be added to a Home Screen. On iPhone and
  iPad that's the only way notifications work at all.

## Two things you should know

**1. One thing we have to switch off.** Earn had its own separate notification
sign-up. A browser only allows **one** push registration per website, so Earn's
and the platform's can't coexist. The platform one wins, and Earn's prompt goes
away. Earn's messages still appear in its own list inside the app. Anyone who
had turned on Earn notifications will need to turn on the new one.

**2. The server keys are in place.** The three settings push needs
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are set on the
deployed service, confirmed 2026-09-21, so real notifications should arrive as
soon as this ships. The app still handles the "push is switched off on this
server" case, because a local or preview environment may not have the keys.

## What this does not do yet

This sends **admin broadcasts to everyone**. It does not yet send "your order
filled" or "your deposit arrived" to one person, because the service has no way
for other parts of the platform to create a notification for a single user. You
said you'll raise that with the backend dev separately.

The good part: none of this work is wasted. When they add it, those messages
arrive through exactly the same pipe, and the app needs no redesign.

## What could go wrong

- Most inboxes will be empty at first, since only broadcasts exist.
- Someone using more than ten browsers loses the oldest registration. That's
  the server's limit, not something we control here.
- If you've previously blocked notifications for the site, browsers won't let
  us ask again. The app explains how to undo that in site settings.
