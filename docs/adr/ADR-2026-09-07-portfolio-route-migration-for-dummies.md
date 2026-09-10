# ADR for Dummies: Changing `/dashboard` to `/portfolio`

## What is this about?

When you open our app or click your portfolio, the web address in your browser currently says `/dashboard#portfolio` or `/dashboard`. We want the address to simply and cleanly read `/portfolio`.

---

## Why are we doing this?

1. **Cleaner links**: Showing `/portfolio` in the address bar is much clearer, looks professional, and directly matches what you are looking at (your portfolio of assets and coins).
2. **Fixing the strange `#portfolio` tag**: Previously, clicking "Portfolio" in the menu would attach a `#portfolio` tag to the end of the URL because the portfolio wasn't registered as its own full page route.
3. **No broken links**: Over 20,000 users visit our site and many have bookmarked `/dashboard`. We are adding automatic permanent redirects so that anyone typing `/dashboard` is instantly and smoothly sent to `/portfolio` without losing any information or funds.

---

## What are the changes?

1. **New Route**: `/portfolio` is now the main screen showing your portfolio, holdings, and market briefs.
2. **Automatic Redirection**: Any visit to `/dashboard` is automatically forwarded to `/portfolio`.
3. **Menu & Buttons**: All navigation buttons, login redirects, and the app logo now point straight to `/portfolio`.
4. **Zero Risk**: Your wallet, money, and sign-in status are completely safe and untouched.
