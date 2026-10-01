# ADR for Dummies: Your referral code in every link you copy

- **Status:** Accepted 2026-10-01 by the maintainer
- **Date:** 2026-10-01

## The Idea

Today you only get credit for bringing someone in when you share with one of
the app's share buttons. Most pages don't have one, and most people just copy
the link from their browser. Those links credit nobody.

From now on, while you're signed in, the link in your browser's address bar
always ends with your referral code (`?ref=yourname`). Copy it from anywhere,
send it any way you like, and the person who opens it is linked to you.

## What the Person Sees

1. You're signed in and open a fight on the sportsbook. The address reads
   `.../prediction/local?event=...&ref=adaeze`.
2. You copy it and send it on WhatsApp.
3. Your friend opens it. The app quietly remembers that you sent them.
4. When they sign up and deposit, the referral is yours.
5. Once your friend signs in, their own address bar shows _their_ code, so
   whatever they share credits them.

## What Changes

- Signed-in users' links carry their code automatically.
- Links with a code in them no longer flicker through a redirect.

## What Does Not Change

- Who gets the credit: still the first person who brought someone in.
- You can't refer yourself; the backend already refuses it.
- Signed-out visitors' links stay clean.
