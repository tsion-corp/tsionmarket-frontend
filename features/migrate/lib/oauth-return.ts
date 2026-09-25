"use client";

// Google and Twitter sign-in for the old account leave Privy's OAuth result in
// the query string and return the whole page, so the sheet that started the
// login is gone by the time the browser lands:
//
//   /portfolio?privy_oauth_state=...&privy_oauth_provider=google&privy_oauth_code=...
//
// A mounted PrivyProvider exchanges that code and then strips the parameters
// itself, in a `finally`, so it cleans up whether the exchange works or fails.
// Privy is deliberately not a provider on these routes any more (ADR-0009), so
// with nothing mounted nobody exchanges the code and nobody clears it: the
// sign-in silently does not happen, and the credentials sit in the URL and in
// browser history. Mounting the sheet on the way back fixes both at once.
//
// Read once at import, because the answer has to outlive Privy's own cleanup —
// every consumer of this runs after the parameters are already gone.
export const returningFromPrivyOAuth =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("privy_oauth_code");
