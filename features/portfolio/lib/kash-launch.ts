// The Kash launch gate: is the rewards program open right now?
//
// While false the portfolio shows the Kash card as a teaser: static zeros, a
// "Coming soon" chip, every action answering with a toast, and not a single
// request to the kash engine. Flipping to live is one env change and a
// redeploy: NEXT_PUBLIC_KASH_LIVE=true. Inlined at build like every
// NEXT_PUBLIC_ value, which is also what makes it tamper-proof at runtime.
export const KASH_LIVE = process.env.NEXT_PUBLIC_KASH_LIVE === "true";
